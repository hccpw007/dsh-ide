/**
 * 项目树工具窗口。
 *
 * 以会话工作区为根逐层懒加载目录，只读浏览：展开目录时才请求子项，已加载的目录
 * 折叠后再次展开直接复用缓存。数据来自宿主的 workspaceFiles Remote，路径由宿主
 * 按会话根解析，插件本身不拼绝对路径。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

import { cn } from '../../../common/cn'
import {
  getWorkspaceFilesRemote,
  subscribeWorkspaceFiles,
  type WorkspaceDirectoryEntry,
} from '../../../common/workspace-files'
import type { FeatureViewProps } from '../../shell/contract'

import { ProjectTreeContextMenu } from './context-menu'
import { chevronIcon, collapseAllIcon, fileBadge, folderIcon, hiddenIcon, refreshIcon } from './icons'

/** 根目录在组件内部用空串表示，避免把它当成一个可展开的普通目录。 */
const ROOT_PATH = ''

/** 请求宿主时的根目录路径；workspaceFiles 把会话根解析为 `.`。 */
const ROOT_REQUEST_PATH = '.'

/** 每层缩进像素。 */
const INDENT_WIDTH = 14

/** 行首基础缩进像素。 */
const BASE_INDENT = 8

/** 目录递归展开的最大层数；超出后停止渲染，防止异常数据造成无限递归。 */
const MAX_DEPTH = 64

/** 一个目录的加载状态。 */
interface DirectoryState {
  status: 'loading' | 'ready' | 'error'
  entries: WorkspaceDirectoryEntry[]
  truncated: boolean
}

/** 树中一行；状态行与目录项共用同一个扁平列表，便于键盘上下移动。 */
type TreeRow =
  | {
      kind: 'entry'
      key: string
      path: string
      name: string
      directory: boolean
      depth: number
    }
  | { kind: 'loading' | 'empty' | 'truncated'; key: string; depth: number }
  | { kind: 'error'; key: string; depth: number; retryPath: string }

/** 可聚焦的目录项行。 */
type EntryRow = Extract<TreeRow, { kind: 'entry' }>

/** 已打开的右键菜单：位置与目标行。 */
interface OpenMenu {
  position: { x: number; y: number }
  row: EntryRow
}

/** 工具条小按钮。 */
interface IconButtonProps {
  /** 按钮的无障碍名称；同时作为悬停提示，文案来自语言包。 */
  label: string
  /** 点击后的动作。 */
  onClick(): void
  /** 宿主能力缺失或未绑定会话时禁用。 */
  disabled?: boolean
  /** 按钮图标。 */
  children: React.ReactNode
}

/**
 * 渲染工具栏图标按钮。
 * @param props 见 IconButtonProps
 * @returns 小尺寸图标按钮
 */
function IconButton({ label, onClick, disabled = false, children }: IconButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-6 w-6 items-center justify-center rounded text-secondary transition-colors',
        'bg-transparent hover:bg-layer2 hover:text-primary focus-visible:bg-layer2 focus-visible:text-primary',
        'disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent',
      )}
    >
      {children}
    </button>
  )
}

/**
 * 判断条目名能否安全拼进工作区相对路径。
 * @param name 宿主返回的文件名
 * @returns 名称合法时返回 true
 */
function isSafeEntryName(name: string): boolean {
  return name !== '' && name !== '.' && name !== '..' && !name.includes('/') && !name.includes('\0')
}

/**
 * 把宿主返回值收窄为目录项数组。
 * @param value 宿主返回的 entries 字段
 * @returns 仅保留名称与类型为字符串的条目
 */
function sanitizeEntries(value: unknown): WorkspaceDirectoryEntry[] {
  if (!Array.isArray(value)) return []

  return value.filter((entry): entry is WorkspaceDirectoryEntry => {
    if (typeof entry !== 'object' || entry === null) return false

    const candidate = entry as { name?: unknown; type?: unknown }

    return typeof candidate.name === 'string' && typeof candidate.type === 'string'
  })
}

/**
 * 拼接子项的工作区相对路径。
 * @param parent 父目录路径；根目录为空串
 * @param name 子项名称
 * @returns 子项相对路径
 */
function entryPathOf(parent: string, name: string): string {
  return parent === ROOT_PATH ? name : `${parent}/${name}`
}

/**
 * 目录项排序：目录优先，同级按自然序、忽略大小写。
 * @param a 前一个条目
 * @param b 后一个条目
 * @returns 排序结果
 */
function compareEntries(a: WorkspaceDirectoryEntry, b: WorkspaceDirectoryEntry): number {
  const aDirectory = a.type === 'directory'
  const bDirectory = b.type === 'directory'

  // 目录排在文件之前，与 IDEA 项目树一致
  if (aDirectory !== bDirectory) return aDirectory ? -1 : 1

  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
}

/**
 * 把已加载的目录展开成扁平行列表。
 *
 * 只遍历展开集合中的目录，未展开目录的子项不会被访问；状态行插在对应目录的位置，
 * 用户能直接看到加载、失败或截断发生在哪一层。
 * @param directories 各目录的加载状态
 * @param expanded 已展开目录集合
 * @param showHidden 是否显示点开头的隐藏项
 * @param parent 当前目录路径；根目录为空串
 * @param depth 当前目录所在层数
 * @returns 当前可见的扁平行
 */
function buildRows(
  directories: Record<string, DirectoryState>,
  expanded: ReadonlySet<string>,
  showHidden: boolean,
  parent: string = ROOT_PATH,
  depth: number = 0,
): TreeRow[] {
  const state = directories[parent]

  // 首次加载或重新加载期间显示加载行
  if (state === undefined || state.status === 'loading') {
    return [{ kind: 'loading', key: `loading:${parent}`, depth }]
  }

  // 失败时保留重试入口，给出错在哪一层
  if (state.status === 'error') {
    return [{ kind: 'error', key: `error:${parent}`, depth, retryPath: parent }]
  }

  const entries = state.entries
    .filter((entry) => (showHidden || !entry.name.startsWith('.')) && isSafeEntryName(entry.name))
    .sort(compareEntries)

  // 全部被隐藏时也按空目录处理，用户能区分「没有文件」和「加载没完成」
  if (entries.length === 0) {
    return [{ kind: 'empty', key: `empty:${parent}`, depth }]
  }

  const rows: TreeRow[] = []

  for (const entry of entries) {
    const path = entryPathOf(parent, entry.name)
    const directory = entry.type === 'directory'

    rows.push({ kind: 'entry', key: `entry:${path}`, path, name: entry.name, directory, depth })

    // 只展开用户点开过的目录；宿主已把符号链接解析为目标类型，目录链接同样按需展开
    if (directory && expanded.has(path) && depth < MAX_DEPTH) {
      rows.push(...buildRows(directories, expanded, showHidden, path, depth + 1))
    }
  }

  // 宿主条目数达到上限时提示截断，避免用户误以为目录只有这些
  if (state.truncated) {
    rows.push({ kind: 'truncated', key: `truncated:${parent}`, depth })
  }

  return rows
}

/**
 * 判断一行是否为可聚焦的目录项。
 * @param row 树行
 * @returns 目录项行返回 true
 */
function isEntryRow(row: TreeRow): row is EntryRow {
  return row.kind === 'entry'
}

/**
 * 渲染项目树工具窗口。
 * @param props 见 FeatureViewProps
 * @returns 项目树面板
 */
export function ProjectTree({ t, sessionId }: FeatureViewProps): React.ReactElement {
  const remote = useSyncExternalStore(subscribeWorkspaceFiles, getWorkspaceFilesRemote, getWorkspaceFilesRemote)

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
  /** 递增后重跑加载副作用，用于刷新整棵树。 */
  const [reloadToken, setReloadToken] = useState(0)
  /** 已打开的右键菜单；null 表示未打开。 */
  const [menu, setMenu] = useState<OpenMenu | null>(null)

  /** 每个目录正在进行的请求；切换会话或刷新时统一取消。 */
  const controllers = useRef(new Map<string, AbortController>())
  /** 行元素引用，供键盘导航直接移动焦点。 */
  const rowRefs = useRef(new Map<string, HTMLButtonElement>())

  /**
   * 加载一个目录的直接子项。
   * @param path 工作区相对路径；根目录为空串
   */
  const loadDirectory = useCallback(
    async (path: string): Promise<void> => {
      if (remote === undefined || sessionId === '') return

      controllers.current.get(path)?.abort()

      const controller = new AbortController()
      controllers.current.set(path, controller)
      setDirectories((previous) => ({
        ...previous,
        [path]: { status: 'loading', entries: [], truncated: false },
      }))

      try {
        const result = await remote.list(
          sessionId,
          path === ROOT_PATH ? ROOT_REQUEST_PATH : path,
          controller.signal,
        )

        // 取消是正常路径：组件已卸载或换了会话，不再回写状态
        if (controller.signal.aborted) return

        if (result.ok !== true || result.value === undefined) {
          console.error('[dsh-ide] 项目树读取目录失败:', path, result.error)
          setDirectories((previous) => ({
            ...previous,
            [path]: { status: 'error', entries: [], truncated: false },
          }))

          return
        }

        setDirectories((previous) => ({
          ...previous,
          [path]: {
            status: 'ready',
            entries: sanitizeEntries(result.value?.entries),
            truncated: result.value?.truncated === true,
          },
        }))
      } catch (error) { // 网络或 Remote 抛错时保留可重试状态，不把整棵树打空
        if (controller.signal.aborted) return

        console.error('[dsh-ide] 项目树读取目录失败:', path, error)
        setDirectories((previous) => ({
          ...previous,
          [path]: { status: 'error', entries: [], truncated: false },
        }))
      } finally {
        if (controllers.current.get(path) === controller) controllers.current.delete(path)
      }
    },
    [remote, sessionId],
  )

  /**
   * 展开或收起一个目录；首次展开时按需请求子项。
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

      // 未加载过的目录在展开时才请求，符合 P1「未展开的目录不发请求」的约束
      if (directories[path] === undefined) void loadDirectory(path)
    },
    [directories, expanded, loadDirectory],
  )

  // 会话、Remote 或刷新令牌变化时重建整棵树，并取消上一轮请求
  useEffect(() => {
    setDirectories({})
    setExpanded(new Set())
    setSelectedPath(null)
    setFocusedPath(null)
    rowRefs.current.clear()

    if (remote === undefined || sessionId === '') return undefined

    void loadDirectory(ROOT_PATH)

    return () => {
      for (const controller of controllers.current.values()) controller.abort()
      controllers.current.clear()
    }
  }, [loadDirectory, remote, sessionId, reloadToken])

  const rows = useMemo(
    () => buildRows(directories, expanded, showHidden),
    [directories, expanded, showHidden],
  )

  const entryRows = useMemo(() => rows.filter(isEntryRow), [rows])

  // 展开/折叠导致焦点行消失时，把焦点落到新的首行，避免整个树失去键盘入口
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
   * 处理树内的方向键导航。
   * @param event 键盘事件
   */
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>): void => {
      if (entryRows.length === 0) return

      const index = entryRows.findIndex((row) => row.path === focusedPath)
      const current = index >= 0 ? entryRows[index] : undefined

      // 上下移动与首尾跳转
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

      // 左键：收起目录；已是收起状态时回到父目录
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
      }
    },
    [entryRows, expanded, focusRow, focusedPath, toggleDirectory],
  )

  /**
   * 点击目录项：选中并更新焦点；目录同时切换展开状态。
   * @param row 目录项行
   */
  const handleEntryClick = useCallback(
    (row: EntryRow): void => {
      setSelectedPath(row.path)
      setFocusedPath(row.path)

      if (row.directory) toggleDirectory(row.path)
    },
    [toggleDirectory],
  )

  const actionsDisabled = remote === undefined || sessionId === ''

  /**
   * 重新加载某个条目所在目录。
   * @param path 条目路径
   */
  const reloadParentOf = useCallback(
    (path: string): void => {
      const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ROOT_PATH

      void loadDirectory(parent)
    },
    [loadDirectory],
  )

  const closeMenu = useCallback(() => setMenu(null), [])

  /**
   * 渲染单行。
   * @param row 扁平行
   * @returns 目录项行或状态行
   */
  function renderRow(row: TreeRow): React.ReactNode {
    if (row.kind !== 'entry') {
      const paddingLeft = BASE_INDENT + row.depth * INDENT_WIDTH

      if (row.kind === 'error') {
        return (
          <div
            key={row.key}
            className="flex h-6 items-center gap-2 pr-2 text-xs text-danger"
            style={{ paddingLeft }}
          >
            {/* 目录读取失败提示 */}
            <span className="truncate">{t('loadFailed')}</span>

            {/* 重试按钮：重新请求失败的目录 */}
            <button
              type="button"
              onClick={() => void loadDirectory(row.retryPath)}
              className="shrink-0 bg-transparent px-0 text-info hover:underline"
            >
              {t('retry')}
            </button>
          </div>
        )
      }

      const tone = row.kind === 'truncated' ? 'text-warn' : 'text-secondary'
      const text = row.kind === 'truncated' ? t('truncated') : row.kind === 'loading' ? t('loading') : t('empty')

      return (
        <div
          key={row.key}
          className={cn('flex h-6 items-center pr-2 text-xs', tone)}
          style={{ paddingLeft }}
        >
          {text}
        </div>
      )
    }

    const isExpanded = expanded.has(row.path)
    const selected = selectedPath === row.path
    const focused = focusedPath === row.path

    return (
      <button
        key={row.key}
        type="button"
        role="treeitem"
        aria-level={row.depth + 1}
        aria-expanded={row.directory ? isExpanded : undefined}
        aria-selected={selected}
        tabIndex={focused ? 0 : -1}
        ref={(element) => {
          if (element === null) rowRefs.current.delete(row.path)
          else rowRefs.current.set(row.path, element)
        }}
        title={row.path}
        onClick={() => handleEntryClick(row)}
        // 右键先选中该行，再在指针位置打开菜单，与 IDEA 的「右键即选中」一致
        onContextMenu={(event) => {
          event.preventDefault()
          setSelectedPath(row.path)
          setFocusedPath(row.path)
          setMenu({ position: { x: event.clientX, y: event.clientY }, row })
        }}
        onFocus={() => setFocusedPath(row.path)}
        className={cn(
          'flex h-6 w-full items-center gap-1.5 truncate pr-2 text-left text-xs leading-none outline-none',
          'hover:bg-layer2 focus-visible:bg-layer2',
          selected ? 'bg-layer2 text-primary' : 'bg-transparent text-primary',
        )}
        // 缩进随层数变化，无法用静态类名表达，因此用行内样式
        style={{ paddingLeft: BASE_INDENT + row.depth * INDENT_WIDTH }}
      >
        {/* 展开箭头；文件行用等宽占位保持名称对齐 */}
        {row.directory ? chevronIcon(isExpanded) : <span className="w-2.5 shrink-0" aria-hidden="true" />}

        {/* 目录图标或按扩展名着色的文件角标 */}
        {row.directory ? folderIcon(isExpanded) : fileBadge(row.name)}

        {/* 文件名 */}
        <span className="truncate">{row.name}</span>
      </button>
    )
  }

  return (
    <div className="flex min-h-full flex-col">
      {/* 工具窗口标题栏：面板名称与目录浏览操作 */}
      <div className="sticky top-0 z-10 flex h-9 shrink-0 items-center justify-between gap-2 border-b border-line1 bg-layer1 px-3">
        {/* 面板名称 */}
        <span className="truncate text-xs font-medium text-primary">{t('title')}</span>

        {/* 目录操作：切换隐藏文件、全部折叠、刷新 */}
        <div className="flex items-center gap-0.5">
          {/* 隐藏文件开关：显示或隐藏点开头的文件 */}
          <IconButton
            label={t('toggleHidden')}
            disabled={actionsDisabled}
            onClick={() => setShowHidden((previous) => !previous)}
          >
            {hiddenIcon(showHidden)}
          </IconButton>

          {/* 全部折叠：收起所有已展开目录 */}
          <IconButton label={t('collapseAll')} disabled={actionsDisabled} onClick={() => setExpanded(new Set())}>
            {collapseAllIcon()}
          </IconButton>

          {/* 刷新：重新加载整棵树，展开状态回到根目录 */}
          <IconButton
            label={t('refresh')}
            disabled={actionsDisabled}
            onClick={() => setReloadToken((previous) => previous + 1)}
          >
            {refreshIcon()}
          </IconButton>
        </div>
      </div>

      {/* 会话未绑定 */}
      {sessionId === '' && (
        <div className="px-3 py-3 text-xs text-secondary">{t('noSession')}</div>
      )}

      {/* 宿主未提供 workspaceFiles 时的降级提示 */}
      {sessionId !== '' && remote === undefined && (
        <div className="px-3 py-3 text-xs text-secondary">{t('unavailable')}</div>
      )}

      {/* 树主体；键盘导航挂在容器上，避免每个行重复绑定 */}
      {sessionId !== '' && remote !== undefined && (
        <div role="tree" aria-label={t('title')} onKeyDown={handleKeyDown} className="flex-1 py-1">
          {rows.map(renderRow)}
        </div>
      )}

      {/* 行右键菜单；坐标来自指针，菜单自行收进视口 */}
      {menu !== null && (
        <ProjectTreeContextMenu
          t={t}
          position={menu.position}
          path={menu.row.path}
          onClose={closeMenu}
          onReload={actionsDisabled ? undefined : () => reloadParentOf(menu.row.path)}
        />
      )}
    </div>
  )
}
