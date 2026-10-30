/**
 * Git 面板的 Local Changes 页签。
 *
 * 布局与 IDEA 一致：最左是竖向工具栏，其右是变更列表（按 Staged / Changes /
 * Merge Conflicts 分组，可按目录折叠成树或平铺），右侧内嵌差异。文件与分组都有
 * 右键菜单，菜单文案固定英文。
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'

import type { DiffSource } from '../../../common/diff-source'
import { SplitHandle } from '../../../common/split-handle'
import type { Translate } from '../../../types/plugin'
import type { IdeServices } from '../../shell/contract'

import { readStatus, stage, stashChanges, unstage, type GitStatus, type GitRunOutput } from './api'
import type { ApiResult } from '../../../common/api'
import {
  buildGroups,
  buildGroupViews,
  CHANGE_SORT_LABELS,
  collectCollapseKeys,
  collectVisible,
  type ChangeGroupView,
  type ChangeSort,
} from './changes-model'
import { ChangesList } from './ChangesList'
import type { CommitFile } from './commit-model'
import { CommitDialog } from './CommitDialog'
import { DiffView } from './DiffView'
import type { SelectedChange } from './diff-model'
import { GitSideToolbar, type GitToolbarItem } from './GitSideToolbar'
import {
  closeIcon,
  collapseIcon,
  diffIcon,
  expandAllIcon,
  listIcon,
  nodeLineIcon,
  refreshIcon,
  rollbackIcon,
  sortIcon,
  stashIcon,
} from './icons'
import { ContextMenu, type MenuItem, type MenuState } from './menu'
import { RollbackDialog } from './RollbackDialog'

/** 变更列表宽度上下限：太窄放不下文件名，太宽会把右侧差异挤没。 */
const MIN_LIST_WIDTH = 200
const MAX_LIST_WIDTH = 640

/** 首次打开时的列表宽度；IDEA 里变更列表只占左侧窄窄一条。 */
const DEFAULT_LIST_WIDTH = 300

/** 排序菜单的选项顺序。 */
const SORT_OPTIONS: readonly ChangeSort[] = ['name', 'path', 'status']

/** Local Changes props。 */
export interface LocalChangesProps {
  /** 已绑定 git 前缀的翻译函数。 */
  t: Translate
  /** 工作台服务总线。 */
  services: IdeServices
  /** 工作区根。 */
  root: string
}

/**
 * 渲染 Local Changes。
 * @param props 见 LocalChangesProps
 * @returns 变更列表与内嵌差异
 */
export function LocalChanges({ t, services, root }: LocalChangesProps): React.ReactElement {
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const [selected, setSelected] = useState<SelectedChange | null>(null)
  const [revision, setRevision] = useState(0)
  const [menu, setMenu] = useState<MenuState | null>(null)
  /** 变更列表宽度（px），由列表与差异之间的分隔条拖动改变。 */
  const [listWidth, setListWidth] = useState(DEFAULT_LIST_WIDTH)
  /** 是否按目录分组；IDEA 的 Local Changes 默认就是目录树。 */
  const [grouped, setGrouped] = useState(true)
  /** 分组内部的文件排序方式。 */
  const [sort, setSort] = useState<ChangeSort>('name')
  /** Commit 弹窗是否打开；工具栏的提交按钮与 IDEA 一样在这里打开它。 */
  const [commitOpen, setCommitOpen] = useState(false)
  /** 待回滚的预选路径；null 表示 Rollback 对话框未打开。 */
  const [rollbackPaths, setRollbackPaths] = useState<readonly string[] | null>(null)

  /** 把拖拽得到的新宽度收进合法区间。 */
  const resizeList = useCallback((next: number): void => {
    setListWidth(Math.min(Math.max(next, MIN_LIST_WIDTH), MAX_LIST_WIDTH))
  }, [])

  /** 重新读取工作区状态。 */
  const refresh = useCallback(async (): Promise<void> => {
    if (root === '') {
      setStatus(null)

      return
    }

    const result = await readStatus(root)

    if (!result.ok) {
      // 不是仓库属于正常状态，不当作错误弹提示
      setStatus(null)
      setError(result.error.code === 'GIT_NOT_REPOSITORY' ? '' : result.error.message)

      return
    }

    setStatus(result.value)
    setError('')
  }, [root])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // 其它 feature（项目树暂存等）刷新 Git 状态后，这里同步重读，避免列表停留在旧结果
  useEffect(() => services.subscribeGitStatus(() => void refresh()), [refresh, services])

  /** 按当前分组与排序整理好的列表数据。 */
  const views = useMemo(() => buildGroupViews(buildGroups(status), grouped, sort), [grouped, sort, status])

  /** 所有当前可见的文件，供差异视图的文件导航使用。 */
  const visibleFiles = useMemo<SelectedChange[]>(
    () => collectVisible(views, collapsed).map((item) => ({ path: item.path, staged: item.staged })),
    [collapsed, views],
  )

  /** 选中项对应的差异来源；差异视图三种来源共用一套渲染，这里固定为工作区来源。 */
  const selectedSource = useMemo<DiffSource | null>(
    () => (selected === null ? null : { kind: 'worktree', path: selected.path, staged: selected.staged }),
    [selected],
  )

  /** 可见差异来源列表，顺序与列表一致。 */
  const visibleSources = useMemo<DiffSource[]>(
    () => visibleFiles.map((file) => ({ kind: 'worktree', path: file.path, staged: file.staged })),
    [visibleFiles],
  )

  /** 差异视图切换文件：工作区来源直接映射回列表选中项。 */
  const selectSource = useCallback((next: DiffSource): void => {
    if (next.kind !== 'worktree') return

    setSelected({ path: next.path, staged: next.staged })
  }, [])

  // 列表刷新后跟随选中文件：暂存/取消暂存会让它换组，只有确实消失时才关闭差异
  useEffect(() => {
    if (selected === null) return

    const items = views.flatMap((view) => view.items)
    const same = items.find((item) => item.path === selected.path && item.staged === selected.staged)
    if (same !== undefined) return

    const moved = items.find((item) => item.path === selected.path)
    if (moved !== undefined) {
      setSelected({ path: moved.path, staged: moved.staged })

      return
    }

    setSelected(null)
  }, [selected, views])

  /**
   * 执行一次写操作并刷新列表与差异；命令与控制台记录由 api 层统一处理。
   * @param action 实际调用
   */
  const run = useCallback(
    async (action: () => Promise<ApiResult<GitRunOutput>>): Promise<boolean> => {
      setBusy(true)

      try {
        const result = await action()

        if (!result.ok) {
          setError(result.error.message)

          return false
        }

        setError('')
        await refresh()
        setRevision((previous) => previous + 1)
        services.refreshGitStatus()
        services.invalidate()

        return true
      } finally {
        setBusy(false)
      }
    },
    [refresh, services],
  )

  /**
   * 暂存一组文件。
   * @param items 变更项
   */
  const stageItems = useCallback(
    (items: CommitFile[]): void => {
      const paths = items.map((item) => item.path)
      if (paths.length === 0) return

      void run(() => stage(root, paths))
    },
    [root, run],
  )

  /**
   * 取消暂存一组文件。
   * @param items 变更项
   */
  const unstageItems = useCallback(
    (items: CommitFile[]): void => {
      const paths = items.map((item) => item.path)
      if (paths.length === 0) return

      void run(() => unstage(root, paths))
    },
    [root, run],
  )

  /**
   * 打开 Rollback Changes 对话框，并预选该文件。
   * @param item 变更项
   */
  const rollback = useCallback((item: CommitFile): void => {
    setRollbackPaths([item.path])
  }, [])

  /**
   * 折叠或展开一个分组/目录。
   * @param key 折叠键
   */
  const toggleCollapse = useCallback((key: string): void => {
    setCollapsed((previous) => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)

      return next
    })
  }, [])

  /**
   * 在按钮旁边打开下拉菜单。
   *
   * 与 IDEA 的工具条下拉一致：菜单贴着按钮右侧展开，而不是跟着指针走。
   * @param event 触发按钮的点击事件
   * @returns 菜单左上角坐标
   */
  const menuBeside = useCallback((event: React.MouseEvent<HTMLButtonElement>): { x: number; y: number } => {
    const rect = event.currentTarget.getBoundingClientRect()

    return { x: rect.right + 2, y: rect.top }
  }, [])

  /**
   * 复制路径到剪贴板。
   * @param value 要复制的文本
   */
  const copyText = useCallback(
    (value: string): void => {
      void navigator.clipboard.writeText(value).then(
        () => services.toast('success', t('copied')),
        (copyError: unknown) => {
          console.error('[dsh-ide] Failed to copy from Git panel:', copyError)
          services.toast('error', t('copyFailed'))
        },
      )
    },
    [services, t],
  )

  /**
   * 打开文件右键菜单。
   * @param event 鼠标事件
   * @param item 变更项
   */
  const openFileMenu = useCallback(
    (event: React.MouseEvent, item: CommitFile): void => {
      event.preventDefault()
      event.stopPropagation()

      const path = item.path
      const items: MenuItem[] = [
        { id: 'show', label: t('showDiff'), run: () => setSelected({ path, staged: item.staged }) },
        { id: 'open', label: t('openInEditor'), run: () => services.openFile(path) },
        {
          id: item.staged ? 'unstage' : 'stage',
          label: item.staged ? t('unstage') : t('stage'),
          separatorBefore: true,
          run: () => (item.staged ? unstageItems([item]) : stageItems([item])),
          disabled: item.conflicted,
        },
        { id: 'rollback', label: t('rollback'), danger: true, run: () => rollback(item), disabled: item.staged },
      ]

      if (item.conflicted) {
        items.push({ id: 'resolve', label: t('resolveConflicts'), separatorBefore: true, run: () => services.openConflict(path) })
      }

      items.push({ id: 'copy', label: t('copyPath'), separatorBefore: true, run: () => copyText(path) })

      setMenu({ x: event.clientX, y: event.clientY, items })
    },
    [copyText, rollback, services, stageItems, t, unstageItems],
  )

  /**
   * 打开分组右键菜单。
   * @param event 鼠标事件
   * @param view 分组视图
   */
  const openGroupMenu = useCallback(
    (event: React.MouseEvent, view: ChangeGroupView): void => {
      event.preventDefault()

      const items: MenuItem[] = [
        { id: 'stageAll', label: t('stage'), run: () => stageItems(view.items) },
        { id: 'collapse', label: t('collapseAll'), run: () => setCollapsed(new Set(collectCollapseKeys([view]))) },
        { id: 'refresh', label: t('refresh'), separatorBefore: true, run: () => void refresh() },
      ]

      setMenu({ x: event.clientX, y: event.clientY, items })
    },
    [refresh, stageItems, t],
  )

  /** 分组方式的下拉菜单。 */
  const openGroupModeMenu = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>): void => {
      setMenu({
        ...menuBeside(event),
        items: [
          // 按目录分组：把文件放进可折叠的目录树，当前生效的方式打勾
          { id: 'directory', label: t('groupByDirectory'), selected: grouped, run: () => setGrouped(true) },
          // 平铺列表：不分组，所有文件直接排在分组下面
          { id: 'flat', label: t('flatList'), selected: !grouped, run: () => setGrouped(false) },
        ],
      })
    },
    [grouped, menuBeside, t],
  )

  /** 排序方式的下拉菜单。 */
  const openSortMenu = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>): void => {
      setMenu({
        ...menuBeside(event),
        items: SORT_OPTIONS.map((option) => ({
          id: option,
          label: t(CHANGE_SORT_LABELS[option]),
          selected: sort === option,
          run: () => setSort(option),
        })),
      })
    },
    [menuBeside, sort, t],
  )

  /** 全部展开：清空折叠集合即可。 */
  const expandAll = useCallback((): void => {
    setCollapsed(new Set())
  }, [])

  /** 全部折叠：分组与目录一起收起。 */
  const collapseAll = useCallback((): void => {
    setCollapsed(new Set(collectCollapseKeys(views)))
  }, [views])

  const headShort = status?.headShort ?? ''
  const isRepo = status !== null
  const empty = status !== null && views.length === 0

  /** 列表里选中的那一项，供工具栏的回滚、打开差异等按钮使用。 */
  const selectedItem = useMemo<CommitFile | null>(() => {
    if (selected === null) return null

    for (const view of views) {
      const found = view.items.find((item) => item.path === selected.path && item.staged === selected.staged)
      if (found !== undefined) return found
    }

    return null
  }, [selected, views])

  /** 左侧工具栏：顺序照截图里的 IDEA 工具栏，图标与可用能力一一对应。 */
  const toolbar: GitToolbarItem[] = [
    {
      id: 'refresh',
      title: t('refresh'),
      icon: refreshIcon(),
      unavailable: busy ? t('loading') : undefined,
      onClick: () => void refresh(),
    },
    {
      id: 'commit',
      title: t('commitAction'),
      icon: nodeLineIcon(),
      unavailable: views.length === 0 ? t('nothingToCommit') : undefined,
      onClick: () => setCommitOpen(true),
    },
    {
      id: 'rollback',
      title: t('rollback'),
      icon: rollbackIcon(),
      unavailable: selectedItem === null ? t('selectItemFirst') : selectedItem.staged ? t('unstage') : undefined,
      onClick: selectedItem === null ? undefined : () => rollback(selectedItem),
    },
    {
      id: 'editorDiff',
      title: t('diffInEditor'),
      icon: diffIcon(),
      unavailable: selectedItem === null ? t('selectItemFirst') : undefined,
      // IDEA 的 Ctrl+D：把差异放到编辑器标签里，便于同时对照多个文件
      onClick:
        selectedItem === null
          ? undefined
          : () => services.openDiff({ kind: 'worktree', path: selectedItem.path, staged: selectedItem.staged }),
    },
    {
      id: 'shelve',
      title: t('shelveChanges'),
      icon: stashIcon(),
      unavailable: views.length === 0 ? t('nothingToShelve') : undefined,
      onClick: () => void run(() => stashChanges(root)),
    },
    {
      id: 'group',
      title: t('groupByDirectory'),
      icon: listIcon(),
      separatorBefore: true,
      // 分组方式是一个持续生效的开关，按钮按当前状态保持高亮
      active: grouped,
      onClick: openGroupModeMenu,
    },
    {
      id: 'collapse',
      title: t('collapseAll'),
      icon: collapseIcon(),
      separatorBefore: true,
      unavailable: views.length === 0 ? t('nothingToCollapse') : undefined,
      onClick: collapseAll,
    },
    { id: 'sort', title: t('sortChanges'), icon: sortIcon(), onClick: openSortMenu },
    {
      id: 'expand',
      title: t('expandAll'),
      icon: expandAllIcon(),
      unavailable: views.length === 0 ? t('nothingToCollapse') : undefined,
      onClick: expandAll,
    },
    {
      id: 'close',
      title: t('closePanel'),
      icon: closeIcon(),
      separatorBefore: true,
      onClick: () => services.closeBottomPanel(),
    },
  ]

  return (
    <div className="flex h-full min-h-0">
      {/* 左侧：IDEA 同款竖向工具栏 */}
      <GitSideToolbar label={t('title')} items={toolbar} />

      {/* 变更分组列表：宽度可拖拽，默认只占窄窄一条，把空间留给右侧差异 */}
      <div className="flex shrink-0 flex-col border-r border-line1" style={{ width: listWidth }}>
        {root === '' && <div className="px-3 py-3 text-xs text-secondary">{t('noSession')}</div>}

        {root !== '' && !isRepo && <div className="px-3 py-3 text-xs text-secondary">{t('notRepository')}</div>}

        {error !== '' && <div className="border-b border-line1 px-2 py-1.5 text-xs text-danger">{error}</div>}

        {empty && <div className="px-3 py-3 text-xs text-secondary">{t('clean')}</div>}

        <ChangesList
          t={t}
          views={views}
          collapsed={collapsed}
          selected={selected}
          busy={busy}
          onToggleCollapse={toggleCollapse}
          onSelect={(item) => setSelected({ path: item.path, staged: item.staged })}
          onFileMenu={openFileMenu}
          onGroupMenu={openGroupMenu}
          onStage={stageItems}
        />
      </div>

      {/* 列表与差异之间的分隔条：拖动改变左右占比，与工作台其他分隔条同一套交互 */}
      <SplitHandle orientation="vertical" current={() => listWidth} onResize={resizeList} />

      {/* 右侧：内嵌差异 */}
      <div className="min-w-0 flex-1">
        <DiffView
          t={t}
          services={services}
          root={root}
          source={selectedSource}
          files={visibleSources}
          onSelect={selectSource}
          onClose={() => setSelected(null)}
          revision={revision}
          headShort={headShort}
        />
      </div>

      {menu !== null && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}

      {/* Rollback Changes 对话框：回滚完成后本列表随 Git 状态刷新 */}
      {rollbackPaths !== null && (
        <RollbackDialog
          t={t}
          services={services}
          root={root}
          initialPaths={rollbackPaths}
          onClose={() => setRollbackPaths(null)}
          onRolledBack={() => void refresh()}
        />
      )}

      {/* Commit Changes 对话框：与主工具栏的 Commit 按钮同一个组件，提交后列表随 Git 状态刷新 */}
      {commitOpen && <CommitDialog t={t} services={services} onClose={() => setCommitOpen(false)} />}
    </div>
  )
}
