/**
 * 项目树工具窗口。
 *
 * 以会话工作区为根逐层懒加载，支持展开、选中、键盘导航、右键菜单与实时刷新。
 * 刷新走 `services.subscribeInvalidate`：编辑器保存、Git 操作、删除新建都会广播，
 * 树只重新请求受影响的目录，不整棵重建。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

import { apiPost } from '../../../common/api'
import { openIdeContextMenu } from '../../../common/context-menu'
import type { FeatureViewProps, IdeServices } from '../../shell/contract'

import { childPathOf, runMenuAction } from './actions'
import { ProjectTreeContextMenu, type MenuAction } from './context-menu'
import { fetchDirectory, parentPathOf, ROOT_PATH, type DirectoryState } from './data'
import { collapseAllIcon, hiddenIcon, refreshIcon } from './icons'
import { TreePromptDialog, TreeToolbar } from './toolbar'
import { EntryRowView, StatusRowView } from './tree-row'
import { buildRows, isEntryRow, type EntryRow, type TreeRow } from './tree-model'

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
 * 订阅 Git 状态映射，给文件名着色。
 * @param services 服务总线
 * @returns 当前映射
 */
function useGitStatus(services: IdeServices): ReadonlyMap<string, string> {
  return useSyncExternalStore(
    (listener) => services.subscribeGitStatus(listener),
    () => services.gitStatus(),
    () => services.gitStatus(),
  )
}

/**
 * 渲染项目树工具窗口。
 * @param props 见 FeatureViewProps
 * @returns 项目树面板
 */
export function ProjectTree({ t, services }: FeatureViewProps): React.ReactElement {
  const gitStatus = useGitStatus(services)
  const root = useSyncExternalStore(
    (listener) => services.subscribeRoot(listener),
    () => services.root,
    () => services.root,
  )
  const activeFile = useSyncExternalStore(
    (listener) => services.subscribeActiveFile(listener),
    () => services.activeFile(),
    () => services.activeFile(),
  )

  /** 各目录的加载状态；缺省表示尚未请求。 */
  const [directories, setDirectories] = useState<Record<string, DirectoryState>>({})
  /** 已展开目录集合；根目录不在此集合中，其子项始终可见。 */
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
  /** 当前选中的行路径。 */
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  /** 当前键盘焦点所在行路径。 */
  const [focusedPath, setFocusedPath] = useState<string | null>(null)
  /** 是否显示点开头的隐藏项。 */
  const [showHidden, setShowHidden] = useState(false)
  /** 递增后整棵树重新加载。 */
  const [reloadToken, setReloadToken] = useState(0)
  /** 已打开的右键菜单。 */
  const [menu, setMenu] = useState<OpenMenu | null>(null)
  /** 正在输入的对话框。 */
  const [prompt, setPrompt] = useState<Prompt | null>(null)
  /** 输入框内容。 */
  const [promptText, setPromptText] = useState('')

  /** 每个目录正在进行的请求；换根或刷新时统一取消。 */
  const controllers = useRef(new Map<string, AbortController>())
  /** 行元素引用，供键盘导航直接移动焦点。 */
  const rowRefs = useRef(new Map<string, HTMLButtonElement>())

  /**
   * 加载一个目录的直接子项。
   * @param path 相对路径；根为空串
   */
  const loadDirectory = useCallback(
    async (path: string): Promise<void> => {
      if (root === '') return

      controllers.current.get(path)?.abort()

      const controller = new AbortController()
      controllers.current.set(path, controller)
      // 已加载过的目录保留旧行，等新数据回来再整体替换：自动保存、Git 操作都会广播
      // 刷新，若先切成 loading，树会把整屏文件行换成占位符，看起来就是闪一下
      setDirectories((previous) =>
        previous[path]?.status === 'ready'
          ? previous
          : { ...previous, [path]: { status: 'loading', entries: [], truncated: false } },
      )

      try {
        const state = await fetchDirectory(root, path, controller.signal)

        // 取消是正常路径：已换根或已卸载，不再回写状态
        if (controller.signal.aborted) return

        setDirectories((previous) => ({ ...previous, [path]: state }))
      } finally {
        if (controllers.current.get(path) === controller) controllers.current.delete(path)
      }
    },
    [root],
  )

  // 根变化或手动刷新时重建整棵树
  useEffect(() => {
    setDirectories({})
    setExpanded(new Set())
    setSelectedPath(null)
    setFocusedPath(null)
    rowRefs.current.clear()

    if (root === '') return undefined

    void loadDirectory(ROOT_PATH)

    return () => {
      for (const controller of controllers.current.values()) controller.abort()
      controllers.current.clear()
    }
  }, [loadDirectory, reloadToken, root])

  // 文件系统变更广播：重新加载受影响的目录，其余目录保持不动
  useEffect(
    () =>
      services.subscribeInvalidate((path) => {
        if (root === '') return

        if (path === undefined) {
          setReloadToken((previous) => previous + 1)

          return
        }

        const parent = parentPathOf(path)
        void loadDirectory(parent)
        // 目录内部发生变化时，如果它自身的子项已加载，也要一并刷新
        if (directories[path]?.status === 'ready') void loadDirectory(path)
      }),
    [directories, loadDirectory, root, services],
  )

  const rows = useMemo(
    () => buildRows({ directories, expanded, showHidden, gitStatus }),
    [directories, expanded, gitStatus, showHidden],
  )
  const entryRows = useMemo(() => rows.filter(isEntryRow), [rows])

  // 展开/折叠导致焦点行消失时，把焦点落到新的首行
  useEffect(() => {
    if (entryRows.length === 0) {
      if (focusedPath !== null) setFocusedPath(null)

      return
    }

    if (focusedPath === null || !entryRows.some((row) => row.path === focusedPath)) {
      setFocusedPath(entryRows[0].path)
    }
  }, [entryRows, focusedPath])

  /**
   * 把 DOM 焦点移到指定行。
   * @param path 行路径
   */
  const focusRow = useCallback((path: string): void => {
    setFocusedPath(path)
    const element = rowRefs.current.get(path)
    element?.focus()
    element?.scrollIntoView({ block: 'nearest' })
  }, [])

  /**
   * 展开或收起目录；首次展开时按需请求。
   * @param path 目录路径
   */
  const toggleDirectory = useCallback(
    (path: string): void => {
      if (expanded.has(path)) {
        setExpanded((previous) => {
          const next = new Set(previous)
          next.delete(path)

          return next
        })

        return
      }

      setExpanded((previous) => new Set(previous).add(path))

      // 未加载过的目录在展开时才请求，符合「未展开不请求」的约束
      if (directories[path] === undefined) void loadDirectory(path)
    },
    [directories, expanded, loadDirectory],
  )

  /**
   * 打开文件或切换目录。
   * @param row 目录项行
   */
  const activate = useCallback(
    (row: EntryRow): void => {
      setSelectedPath(row.path)
      setFocusedPath(row.path)

      if (row.directory) {
        toggleDirectory(row.path)

        return
      }

      services.openFile(row.path)
    },
    [services, toggleDirectory],
  )

  /**
   * 键盘导航：上下移动、首尾跳转、左右展开与折叠。
   * @param event 键盘事件
   */
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>): void => {
      if (entryRows.length === 0) return

      const index = entryRows.findIndex((row) => row.path === focusedPath)
      const current = index >= 0 ? entryRows[index] : undefined

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
        event.preventDefault()

        const nextIndex =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? entryRows.length - 1
              : event.key === 'ArrowDown'
                ? Math.min(index < 0 ? 0 : index + 1, entryRows.length - 1)
                : Math.max(index < 0 ? 0 : index - 1, 0)

        focusRow(entryRows[nextIndex].path)

        return
      }

      if (current === undefined) return

      // 右键：展开目录；已展开时进入第一个子项
      if (event.key === 'ArrowRight' && current.directory) {
        event.preventDefault()

        if (!expanded.has(current.path)) {
          toggleDirectory(current.path)

          return
        }

        const child = entryRows[index + 1]
        if (child !== undefined && child.depth === current.depth + 1) focusRow(child.path)

        return
      }

      // 左键：收起目录；已收起时回到父目录
      if (event.key === 'ArrowLeft') {
        event.preventDefault()

        if (current.directory && expanded.has(current.path)) {
          toggleDirectory(current.path)

          return
        }

        const parent = entryRows
          .slice(0, index)
          .reverse()
          .find((row) => row.depth === current.depth - 1)

        if (parent !== undefined) focusRow(parent.path)

        return
      }

      // 回车打开文件或切换目录
      if (event.key === 'Enter') {
        event.preventDefault()
        activate(current)
      }
    },
    [activate, entryRows, expanded, focusRow, focusedPath, toggleDirectory],
  )

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
   * 渲染单行。
   * @param row 扁平行
   * @returns 目录项行或状态行
   */
  function renderRow(row: TreeRow): React.ReactNode {
    if (row.kind !== 'entry') {
      return (
        <StatusRowView
          key={row.key}
          row={row}
          t={t}
          onRetry={row.kind === 'error' ? () => void loadDirectory(row.retryPath) : undefined}
        />
      )
    }

    return (
      <EntryRowView
        key={row.key}
        row={row}
        t={t}
        expanded={expanded.has(row.path)}
        selected={selectedPath === row.path || activeFile === row.path}
        focused={focusedPath === row.path}
        gitStatus={gitStatus.get(row.path)}
        registerRef={(element) => {
          if (element === null) rowRefs.current.delete(row.path)
          else rowRefs.current.set(row.path, element)
        }}
        onClick={() => activate(row)}
        // 右键先选中该行，再在指针位置打开菜单，与 IDEA 的「右键即选中」一致
        onContextMenu={(event) => {
          event.preventDefault()
          setSelectedPath(row.path)
          setFocusedPath(row.path)
          setMenu({ position: { x: event.clientX, y: event.clientY }, path: row.path, directory: row.directory })
        }}
        onFocus={() => setFocusedPath(row.path)}
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
            run: () => setReloadToken((value) => value + 1),
          },
          { id: 'collapseAll', label: t('collapseAll'), run: () => setExpanded(new Set()) },
          {
            id: 'toggleHidden',
            label: t('toggleHidden'),
            run: () => setShowHidden((value) => !value),
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
      {/* 工具窗口标题栏：面板名称与目录浏览操作 */}
      <TreeToolbar
        title={t('title')}
        toggleHiddenLabel={t('toggleHidden')}
        collapseAllLabel={t('collapseAll')}
        refreshLabel={t('refresh')}
        disabled={actionsDisabled}
        showHidden={showHidden}
        onToggleHidden={() => setShowHidden((previous) => !previous)}
        onCollapseAll={() => setExpanded(new Set())}
        onRefresh={() => setReloadToken((previous) => previous + 1)}
        hiddenIcon={hiddenIcon(showHidden)}
        collapseIcon={collapseAllIcon()}
        refreshIcon={refreshIcon()}
      />

      {/* 工作区未绑定时的提示 */}
      {root === '' && <div className="px-3 py-3 text-xs text-secondary">{t('noSession')}</div>}

      {/* 树主体；键盘导航挂在容器上，避免每个行重复绑定 */}
      {root !== '' && (
        <div role="tree" aria-label={t('title')} onKeyDown={handleKeyDown} className="flex-1 py-1">
          {rows.map(renderRow)}
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
