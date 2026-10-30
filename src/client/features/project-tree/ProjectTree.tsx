/**
 * 项目树工具窗口。
 *
 * 以会话工作区为根逐层懒加载，支持展开、选中、键盘导航、右键菜单与实时刷新。
 * 刷新走 `services.subscribeInvalidate`：编辑器保存、Git 操作、删除新建都会广播，
 * 树只重新请求受影响的目录，不整棵重建。树的状态与数据加载在 use-project-tree.ts，
 * 这里只负责渲染与上下文菜单、输入对话框这两块纯 UI 状态。
 */
import React, { useCallback, useState, useSyncExternalStore } from 'react'

import { apiPost } from '../../../common/api'
import { openIdeContextMenu } from '../../../common/context-menu'
import type { FeatureViewProps } from '../../shell/contract'

import { childPathOf, runMenuAction } from './actions'
import { ProjectTreeContextMenu, type MenuAction } from './context-menu'
import { parentPathOf, ROOT_PATH } from './data'
import { collapseAllIcon, hiddenIcon, refreshIcon } from './icons'
import { TreePromptDialog, TreeToolbar } from './toolbar'
import { EntryRowView, RootRowView, StatusRowView } from './tree-row'
import type { TreeRow } from './tree-model'
import { useProjectTree } from './use-project-tree'

/** 已打开的右键菜单。 */
interface OpenMenu {
  /** 视口坐标。 */
  position: { x: number; y: number }
  /** 目标行路径。 */
  path: string
  /** 目标是否为目录。 */
  directory: boolean
}

/** 正在输入的对话框。 */
type Prompt =
  | { kind: 'newFile' | 'newDirectory' | 'rename'; path: string; directory: boolean }
  | { kind: 'deleteConfirm'; path: string; directory: boolean }

/**
 * 渲染项目树工具窗口。
 * @param props 见 FeatureViewProps
 * @returns 项目树面板
 */
export function ProjectTree({ t, services }: FeatureViewProps): React.ReactElement {
  const tree = useProjectTree({ t, services })
  const root = useSyncExternalStore(
    (listener) => services.subscribeRoot(listener),
    () => services.root,
    () => services.root,
  )

  /** 已打开的右键菜单。 */
  const [menu, setMenu] = useState<OpenMenu | null>(null)
  /** 正在输入的对话框。 */
  const [prompt, setPrompt] = useState<Prompt | null>(null)
  /** 输入框内容。 */
  const [promptText, setPromptText] = useState('')

  /**
   * 执行右键菜单动作。
   * @param action 动作
   * @param path 目标路径
   * @param directory 目标是否目录
   */
  const runAction = useCallback(
    (action: MenuAction, path: string, directory: boolean): void => {
      runMenuAction(action, path, directory, { root, services, t, openPrompt: setPrompt })
    },
    [root, services, t],
  )

  /**
   * 提交输入框内容。
   *
   * 新建与重命名都落到 `/fs/*` 路由，成功后广播目录刷新。
   */
  const submitPrompt = useCallback(async (): Promise<void> => {
    if (prompt === null) return

    const name = promptText.trim()
    const target = { path: prompt.path, directory: prompt.directory }

    if (prompt.kind === 'deleteConfirm') {
      const result = await apiPost<{ batch: string }>('/fs/delete', { root, path: prompt.path })
      setPrompt(null)

      if (result.ok) {
        services.invalidate(parentPathOf(prompt.path))
        services.refreshGitStatus()
        services.notify('success', t('deleted'), {
          label: t('undo'),
          run: () => {
            // 撤销 = 从回收站里搬回原位；宿主没有恢复路由，这里给出手工提示
            services.notify('info', `${t('trashHint')} ${result.value.batch}`)
          },
        })
      } else {
        services.notify('error', result.error.message)
      }

      return
    }

    if (name === '' || name.includes('/')) {
      services.notify('error', t('invalidName'))

      return
    }

    if (prompt.kind === 'rename') {
      const result = await apiPost('/fs/rename', { root, from: prompt.path, to: childPathOf(target, name) })
      setPrompt(null)

      if (result.ok) {
        services.invalidate(parentPathOf(prompt.path))
        services.refreshGitStatus()
      } else {
        services.notify('error', result.error.message)
      }

      return
    }

    const path = childPathOf(target, name)
    const result = await apiPost('/fs/create', {
      root,
      path,
      kind: prompt.kind === 'newDirectory' ? 'directory' : 'file',
      text: '',
    })
    setPrompt(null)

    if (result.ok) {
      services.invalidate(parentPathOf(path))
      if (prompt.kind === 'newFile') services.openFile(path)
    } else {
      services.notify('error', result.error.message)
    }
  }, [prompt, promptText, root, services, t])

  const actionsDisabled = root === ''

  /**
   * 渲染一行。
   * @param row 扁平行
   * @returns 根节点行、目录项行或状态行
   */
  function renderRow(row: TreeRow): React.ReactNode {
    if (row.kind === 'root') {
      return <RootRowView key={row.key} row={row} onToggle={() => tree.toggleRow(ROOT_PATH)} />
    }

    if (row.kind !== 'entry') {
      return (
        <StatusRowView
          key={row.key}
          row={row}
          t={t}
          onRetry={row.kind === 'error' ? () => tree.retryDirectory(row.retryPath) : undefined}
        />
      )
    }

    return (
      <EntryRowView
        key={row.key}
        row={row}
        t={t}
        expanded={tree.isRowExpanded(row.path)}
        // 选中态只跟随项目树自己的选中行，与 IDEA 一样不会因为编辑器切换而多出高亮
        selected={tree.selectedPath === row.path}
        focused={tree.focusedPath === row.path}
        gitStatus={tree.gitStatusOf(row.path)}
        registerRef={(element) => tree.registerRowRef(row.path, element)}
        // 单击只选中；双击才展开目录或在编辑区打开文件，与 IDEA 的项目树一致
        onClick={() => tree.selectRow(row.path)}
        onDoubleClick={() => {
          if (row.directory) tree.toggleRow(row.path)
          else services.openFile(row.path)
        }}
        onToggleExpand={() => tree.toggleRow(row.path)}
        // 右键先选中该行，再在指针位置打开菜单，与 IDEA 的「右键即选中」一致
        onContextMenu={(event) => {
          event.preventDefault()
          tree.selectRow(row.path)
          setMenu({ position: { x: event.clientX, y: event.clientY }, path: row.path, directory: row.directory })
        }}
        onFocus={() => tree.setFocused(row.path)}
      />
    )
  }

  return (
    <div
      className="flex min-h-full flex-col"
      // 工具窗口空白处右键：整树刷新、折叠与隐藏项开关，与 IDEA 的项目视图菜单对齐
      onContextMenu={(event) => {
        if (event.defaultPrevented) return

        openIdeContextMenu(event, services, [
          {
            id: 'refresh',
            label: t('refresh'),
            shortcut: '⌘R',
            run: tree.refresh,
          },
          { id: 'collapseAll', label: t('collapseAll'), run: tree.collapseAll },
          {
            id: 'toggleHidden',
            label: t('toggleHidden'),
            run: tree.toggleHidden,
          },
          {
            id: 'settings',
            label: t('menu.panelSettings'),
            shortcut: '⌘,',
            separatorBefore: true,
            run: () => services.openPage('settings'),
          },
        ])
      }}
    >
      {/* 工具窗口标题栏：面板名称是视图切换入口，右侧是目录浏览操作 */}
      <TreeToolbar
        title={t('title')}
        onOpenViewMenu={tree.openViewMenu}
        toggleHiddenLabel={t('toggleHidden')}
        collapseAllLabel={t('collapseAll')}
        refreshLabel={t('refresh')}
        disabled={actionsDisabled}
        showHidden={tree.showHidden}
        onToggleHidden={tree.toggleHidden}
        onCollapseAll={tree.collapseAll}
        onRefresh={tree.refresh}
        hiddenIcon={hiddenIcon(tree.showHidden)}
        collapseIcon={collapseAllIcon()}
        refreshIcon={refreshIcon()}
      />

      {/* 工作区未绑定时的提示 */}
      {root === '' && <div className="px-3 py-3 text-xs text-secondary">{t('noSession')}</div>}

      {/* All Changed Files 视图没有变更文件时的提示 */}
      {root !== '' && tree.view === 'changed' && tree.rows.length === 0 && (
        <div className="px-3 py-2 text-xs text-secondary">{t('noChanges')}</div>
      )}

      {/* 树主体；键盘导航挂在容器上，避免每个行重复绑定 */}
      {root !== '' && tree.rows.length > 0 && (
        <div role="tree" aria-label={t('title')} onKeyDown={tree.handleKeyDown} className="flex-1 py-1">
          {tree.rows.map(renderRow)}
        </div>
      )}

      {/* 行右键菜单；坐标来自指针，菜单自行收进视口 */}
      {menu !== null && (
        <ProjectTreeContextMenu
          t={t}
          position={menu.position}
          path={menu.path}
          directory={menu.directory}
          onClose={() => setMenu(null)}
          onAction={runAction}
        />
      )}

      {prompt !== null && (
        <TreePromptDialog
          title={
            prompt.kind === 'newFile'
              ? t('promptNewFile')
              : prompt.kind === 'newDirectory'
                ? t('promptNewDirectory')
                : prompt.kind === 'rename'
                  ? t('promptRename')
                  : `${t('deleteConfirm')} ${prompt.path}`
          }
          confirmOnly={prompt.kind === 'deleteConfirm'}
          value={promptText}
          cancelLabel={t('cancel')}
          confirmLabel={prompt.kind === 'deleteConfirm' ? t('delete') : t('confirm')}
          danger={prompt.kind === 'deleteConfirm'}
          onChange={setPromptText}
          onCancel={() => setPrompt(null)}
          onConfirm={() => void submitPrompt()}
        />
      )}
    </div>
  )
}
