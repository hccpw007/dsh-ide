/**
 * Git 面板的 Local Changes 页签。
 *
 * 布局与 IDEA 一致：最左是竖向工具栏，其右是变更列表（按 Staged / Changes /
 * Merge Conflicts 分组），右侧内嵌差异。文件与分组都有右键菜单，菜单文案固定英文。
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'

import { cn } from '../../../common/cn'
import { SplitHandle } from '../../../common/split-handle'
import type { Translate } from '../../../types/plugin'
import type { IdeServices } from '../../shell/contract'

import { readStatus, stage, stashChanges, unstage, type GitChange, type GitStatus, type GitRunOutput } from './api'
import type { ApiResult } from '../../../common/api'
import { recordGitConsole } from './console-store'
import { DiffView, type SelectedChange } from './DiffView'
import { GitSideToolbar, type GitToolbarItem } from './GitSideToolbar'
import {
  chevronDownIcon,
  chevronRightIcon,
  closeIcon,
  collapseIcon,
  diffIcon,
  expandAllIcon,
  eyeIcon,
  fileIcon,
  listIcon,
  nodeLineIcon,
  refreshIcon,
  rollbackIcon,
  sortIcon,
  stashIcon,
} from './icons'
import { ContextMenu, type MenuItem, type MenuState } from './menu'
import { RollbackDialog } from './RollbackDialog'

/** 列表中的一个变更项。 */
interface ChangeItem {
  /** 文件状态。 */
  change: GitChange
  /** 右侧取索引区。 */
  staged: boolean
  /** 是否未跟踪。 */
  untracked: boolean
  /** 是否冲突。 */
  conflicted: boolean
}

/** 变更列表宽度上下限：太窄放不下文件名，太宽会把右侧差异挤没。 */
const MIN_LIST_WIDTH = 200
const MAX_LIST_WIDTH = 640

/** 首次打开时的列表宽度；IDEA 里变更列表只占左侧窄窄一条。 */
const DEFAULT_LIST_WIDTH = 300

/** 一个变更分组。 */
interface ChangeGroup {
  /** 分组键。 */
  key: 'conflicted' | 'untracked' | 'changes'
  /** 标题的语言 key。 */
  label: string
  /** 分组内容。 */
  items: ChangeItem[]
}

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
 * 把变更类型映射成文件名色调。
 *
 * 取色与项目树共用同一套 IDEA VCS 令牌：新增绿、修改蓝、删除灰、未跟踪红，
 * 同一份状态在两处必须给出同一个颜色。
 * @param item 变更项
 * @returns Tailwind 文本色类名
 */
function toneOf(item: ChangeItem): string {
  // 冲突优先于其它状态：合并冲突的文件要一眼可见
  if (item.conflicted) return 'text-vcs-conflict'
  // 未纳入版本控制的文件：IDEA 用红色标出「还没被跟踪」
  if (item.untracked) return 'text-vcs-unknown'

  // 已暂存的项看索引区状态，未暂存的看工作区状态
  const status = item.change.indexStatus.trim() === '' ? item.change.worktreeStatus : item.change.indexStatus

  // 删除：文件已从索引或工作区移除，灰色表示「消失」
  if (status === 'D') return 'text-vcs-deleted'
  // 已纳入版本控制的新增：绿色
  if (status === 'A') return 'text-vcs-added'

  // 修改、重命名与复制：IDEA 统一用蓝色
  return 'text-vcs-modified'
}

/**
 * 拆分路径为文件名与目录。
 * @param path 相对路径
 * @returns 文件名与目录
 */
function splitPath(path: string): { name: string; directory: string } {
  const index = path.lastIndexOf('/')

  return index < 0 ? { name: path, directory: '' } : { name: path.slice(index + 1), directory: path.slice(0, index) }
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

  const groups: ChangeGroup[] = useMemo(() => {
    if (status === null) return []

    // 同一路径可能同时出现在索引区与工作区（AM / MM 这类状态）：IDEA 的 Local Changes
    // 是单一列表，同一文件只占一行，分两行会让人误以为存在两个同名文件
    const tracked = new Map<string, ChangeItem>()

    for (const change of status.unstaged) {
      tracked.set(change.path, { change, staged: false, untracked: false, conflicted: false })
    }

    // 已暂存的项覆盖同路径的未暂存项：索引区状态优先，取消暂存也要作用到这一行
    for (const change of status.staged) {
      tracked.set(change.path, { change, staged: true, untracked: false, conflicted: false })
    }

    return [
      {
        key: 'conflicted' as const,
        label: 'groupConflicted',
        items: status.conflicted.map((change) => ({ change, staged: false, untracked: false, conflicted: true })),
      },
      { key: 'changes' as const, label: 'groupChanges', items: [...tracked.values()] },
      // 未纳入版本控制的文件单独成组：IDEA 的 Unversioned Files 与已跟踪的修改分列
      {
        key: 'untracked' as const,
        label: 'groupUntracked',
        items: status.untracked.map((change) => ({ change, staged: false, untracked: true, conflicted: false })),
      },
    ].filter((group) => group.items.length > 0) as ChangeGroup[]
  }, [status])

  /** 所有可见文件，供差异视图的文件导航使用。 */
  const visibleFiles = useMemo<SelectedChange[]>(
    () =>
      groups.flatMap((group) =>
        collapsed.has(group.key)
          ? []
          : group.items.map((item) => ({ path: item.change.path, staged: item.staged })),
      ),
    [collapsed, groups],
  )

  // 列表刷新后跟随选中文件：暂存/取消暂存会让它换组，只有确实消失时才关闭差异
  useEffect(() => {
    if (selected === null) return

    const items = groups.flatMap((group) => group.items)
    const same = items.find((item) => item.change.path === selected.path && item.staged === selected.staged)
    if (same !== undefined) return

    const moved = items.find((item) => item.change.path === selected.path)
    if (moved !== undefined) {
      setSelected({ path: moved.change.path, staged: moved.staged })

      return
    }

    setSelected(null)
  }, [groups, selected])

  /**
   * 执行一次写操作，记录控制台并刷新列表与差异。
   * @param display 失败时用于回显的命令行
   * @param action 实际调用
   */
  const run = useCallback(
    async (display: string, action: () => Promise<ApiResult<GitRunOutput>>): Promise<boolean> => {
      setBusy(true)

      try {
        const result = await action()

        if (!result.ok) {
          recordGitConsole({ cwd: root, command: display, stdout: '', stderr: result.error.message, ok: false })
          setError(result.error.message)

          return false
        }

        recordGitConsole({
          cwd: root,
          command: result.value.command,
          stdout: result.value.stdout,
          stderr: result.value.stderr,
          ok: true,
        })
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
    [refresh, root, services],
  )

  /**
   * 暂存一组文件。
   * @param items 变更项
   */
  const stageItems = useCallback(
    (items: ChangeItem[]): void => {
      const paths = items.map((item) => item.change.path)
      if (paths.length === 0) return

      void run(`git add -- ${paths.join(' ')}`, () => stage(root, paths))
    },
    [root, run],
  )

  /**
   * 取消暂存一组文件。
   * @param items 变更项
   */
  const unstageItems = useCallback(
    (items: ChangeItem[]): void => {
      const paths = items.map((item) => item.change.path)
      if (paths.length === 0) return

      void run(`git reset HEAD -- ${paths.join(' ')}`, () => unstage(root, paths))
    },
    [root, run],
  )

  /**
   * 打开 Rollback Changes 对话框，并预选该文件。
   * @param item 变更项
   */
  const rollback = useCallback((item: ChangeItem): void => {
    setRollbackPaths([item.change.path])
  }, [])

  /**
   * 复制路径到剪贴板。
   * @param value 要复制的文本
   */
  const copyText = useCallback(
    (value: string): void => {
      void navigator.clipboard.writeText(value).then(
        () => services.notify('success', t('copied')),
        (copyError: unknown) => {
          console.error('[dsh-ide] Failed to copy from Git panel:', copyError)
          services.notify('error', t('copyFailed'))
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
    (event: React.MouseEvent, item: ChangeItem): void => {
      event.preventDefault()
      event.stopPropagation()

      const path = item.change.path
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
   * @param group 分组
   */
  const openGroupMenu = useCallback(
    (event: React.MouseEvent, group: ChangeGroup): void => {
      event.preventDefault()

      const items: MenuItem[] = [
        { id: 'stageAll', label: t('stage'), run: () => stageItems(group.items) },
        {
          id: 'collapse',
          label: t('collapseAll'),
          run: () => setCollapsed((previous) => new Set(previous).add(group.key)),
        },
        { id: 'refresh', label: t('refresh'), separatorBefore: true, run: () => void refresh() },
      ]

      setMenu({ x: event.clientX, y: event.clientY, items })
    },
    [refresh, stageItems, t],
  )

  const headShort = status?.headShort ?? ''
  const isRepo = status !== null
  const empty = status !== null && groups.length === 0

  /** 列表里选中的那一项，供工具栏的回滚等按钮使用。 */
  const selectedItem = useMemo<ChangeItem | null>(() => {
    if (selected === null) return null

    for (const group of groups) {
      const found = group.items.find((item) => item.change.path === selected.path && item.staged === selected.staged)
      if (found !== undefined) return found
    }

    return null
  }, [groups, selected])

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
      id: 'diff',
      title: t('showDiff'),
      icon: nodeLineIcon(),
      unavailable: selectedItem === null ? t('selectItemFirst') : undefined,
      onClick:
        selectedItem === null
          ? undefined
          : () =>
              setSelected({
                path: selectedItem.change.path,
                staged: selectedItem.staged,
              }),
    },
    {
      id: 'rollback',
      title: t('rollback'),
      icon: rollbackIcon(),
      unavailable: selectedItem === null ? t('selectItemFirst') : selectedItem.staged === true ? t('unstage') : undefined,
      onClick: selectedItem === null ? undefined : () => rollback(selectedItem),
    },
    { id: 'compare', title: t('showDiff'), icon: diffIcon(), unavailable: t('diffInline') },
    {
      id: 'stash',
      title: t('stashChanges'),
      icon: stashIcon(),
      unavailable: root === '' ? t('nothingToShelve') : undefined,
      onClick: () => void run('git stash push', () => stashChanges(root)),
    },
    { id: 'view', title: t('groupByDirectory'), icon: eyeIcon(), unavailable: t('notAvailable') },
    { id: 'group', title: t('groupByDirectory'), icon: listIcon(), separatorBefore: true, unavailable: t('notAvailable') },
    {
      id: 'collapse',
      title: t('collapseAll'),
      icon: collapseIcon(),
      separatorBefore: true,
      unavailable: groups.length === 0 ? t('nothingToCollapse') : undefined,
      onClick: () => setCollapsed(new Set(groups.map((group) => group.key))),
    },
    { id: 'sort', title: t('sortByDate'), icon: sortIcon(), unavailable: t('notAvailable') },
    {
      id: 'expand',
      title: t('expandAll'),
      icon: expandAllIcon(),
      unavailable: groups.length === 0 ? t('nothingToCollapse') : undefined,
      onClick: () => setCollapsed(new Set()),
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

        <div className="min-h-0 flex-1 overflow-auto py-0.5 [scrollbar-gutter:stable]">
          {groups.map((group) => {
            const open = !collapsed.has(group.key)

            return (
              <div key={group.key}>
                <div
                  className="group flex h-6 cursor-pointer items-center gap-1.5 px-1 hover:bg-surface2/50"
                  onClick={() =>
                    setCollapsed((previous) => {
                      const next = new Set(previous)
                      if (next.has(group.key)) next.delete(group.key)
                      else next.add(group.key)

                      return next
                    })
                  }
                  onContextMenu={(event) => openGroupMenu(event, group)}
                >
                  <span className="flex h-6 w-3.5 items-center justify-center text-secondary">
                    {open ? chevronDownIcon() : chevronRightIcon()}
                  </span>

                  {/* 分组名称：IDEA 里是常规前景色的粗体，只有冲突组才换色提示 */}
                  <span
                    className={cn(
                      'text-xs font-semibold',
                      group.key === 'conflicted' ? 'text-warn' : 'text-primary',
                    )}
                  >
                    {t(group.label)}
                  </span>

                  {/* 组内文件数 */}
                  <span className="text-[11px] text-secondary">
                    {group.items.length} {group.items.length === 1 ? t('file') : t('files')}
                  </span>

                  <span className="flex-1" />

                  {/* 分组批量操作：悬停时显示，不抢占列表宽度 */}
                  <button
                    type="button"
                    className="hidden rounded px-1 text-[10px] text-secondary hover:text-primary group-hover:block"
                    disabled={busy}
                    onClick={(event) => {
                      event.stopPropagation()
                      stageItems(group.items)
                    }}
                  >
                    {t('stage')}
                  </button>
                </div>

                {open &&
                  group.items.map((item) => {
                    const { name, directory } = splitPath(item.change.path)
                    const active =
                      selected !== null && selected.path === item.change.path && selected.staged === item.staged

                    return (
                      <button
                        key={`${group.key}:${item.change.path}`}
                        type="button"
                        title={item.change.path}
                        onClick={() => setSelected({ path: item.change.path, staged: item.staged })}
                        onContextMenu={(event) => openFileMenu(event, item)}
                        className={cn(
                          'mx-1 flex h-[23px] w-[calc(100%-8px)] items-center gap-1.5 rounded pl-5 pr-2 text-left text-xs transition-colors',
                          // 选中行用 IDEA 的蓝色圆角块，与项目树同一套底色；文件名仍保留状态色
                          active ? 'bg-treeselected' : 'hover:bg-surface2/60',
                        )}
                      >
                        {fileIcon(item.change.path, 13)}

                        {/* 文件名按变更类型着色 */}
                        <span className={cn('min-w-0 shrink truncate', toneOf(item))}>{name}</span>

                        {/* 目录紧跟在文件名后面，与 IDEA 的「名字 + 灰色路径」一致 */}
                        {directory !== '' && (
                          <span className="min-w-0 truncate text-[11px] text-secondary">{directory}</span>
                        )}
                      </button>
                    )
                  })}
              </div>
            )
          })}
        </div>
      </div>

      {/* 列表与差异之间的分隔条：拖动改变左右占比，与工作台其他分隔条同一套交互 */}
      <SplitHandle orientation="vertical" current={() => listWidth} onResize={resizeList} />

      {/* 右侧：内嵌差异 */}
      <div className="min-w-0 flex-1">
        <DiffView
          t={t}
          services={services}
          root={root}
          file={selected}
          files={visibleFiles}
          onSelectFile={setSelected}
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
    </div>
  )
}
