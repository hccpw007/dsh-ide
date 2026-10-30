/**
 * 项目树的状态与数据逻辑。
 *
 * 目录懒加载、Git 状态订阅、三种视图（Project / Packages / All Changed Files）的
 * 行计算、展开集合、选中与键盘导航都放在这个 hook 里；ProjectTree 只负责把行渲染
 * 出来，因此组件的 JSX 不必被这些状态打理淹没。
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { KeyboardEvent } from 'react'

import type { Translate } from '../../../types/plugin'
import type { IdeServices } from '../../shell/contract'

import { fetchDirectory, parentPathOf, ROOT_PATH, type DirectoryState } from './data'
import {
  buildChangedRows,
  buildRows,
  isEntryRow,
  type EntryRow,
  type ProjectView,
  type RootRow,
  type TreeRow,
} from './tree-model'

/** 视图下拉的选项；顺序与 IDEA 的 Project 下拉一致，只保留三个视图。 */
const VIEW_OPTIONS: ReadonlyArray<{ id: ProjectView; labelKey: string }> = [
  { id: 'project', labelKey: 'viewProject' },
  { id: 'packages', labelKey: 'viewPackages' },
  { id: 'changed', labelKey: 'viewChanged' },
]

/**
 * 把绝对路径里的主目录缩成 ~。
 * @param absolutePath 工作区绝对路径
 * @returns 展示用路径；浏览器拿不到 home，按常见的家目录前缀推断
 */
function displayPathOf(absolutePath: string): string {
  return absolutePath.replace(/^\/(?:Users|home)\/[^/]+/u, '~')
}

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
 * 订阅被 .gitignore 忽略的路径集合；与 Git 状态同一批广播，因此复用同一个订阅。
 * @param services 服务总线
 * @returns 忽略路径集合，目录条目以 / 结尾
 */
function useGitIgnored(services: IdeServices): ReadonlySet<string> {
  return useSyncExternalStore(
    (listener) => services.subscribeGitStatus(listener),
    () => services.gitIgnored(),
    () => services.gitIgnored(),
  )
}

/** hook 入参。 */
export interface ProjectTreeModelOptions {
  /** 已绑定前缀的翻译函数。 */
  t: Translate
  /** 服务总线。 */
  services: IdeServices
}

/** 项目树 hook 交给组件的全部状态与操作。 */
export interface ProjectTreeModel {
  /** 当前视图。 */
  view: ProjectView
  /** 可见行。 */
  rows: TreeRow[]
  /** 是否显示隐藏项。 */
  showHidden: boolean
  /** 当前选中路径。 */
  selectedPath: string | null
  /** 当前键盘焦点路径。 */
  focusedPath: string | null
  /** 取某一行的 Git 状态字母。 */
  gitStatusOf(path: string): string | undefined
  /** 判断路径是否被 .gitignore 忽略。 */
  isIgnored(path: string): boolean
  /** 判断目录行是否展开。 */
  isRowExpanded(path: string): boolean
  /** 注册行元素引用。 */
  registerRowRef(path: string, element: HTMLButtonElement | null): void
  /** 选中并聚焦一行。 */
  selectRow(path: string): void
  /** 只更新键盘焦点。 */
  setFocused(path: string): void
  /** 展开或收起一行。 */
  toggleRow(path: string): void
  /** 键盘导航。 */
  handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void
  /** 打开视图切换下拉。 */
  openViewMenu(anchor: DOMRect): void
  /** 切换隐藏项显示。 */
  toggleHidden(): void
  /** 收起全部目录。 */
  collapseAll(): void
  /** 整树刷新。 */
  refresh(): void
  /** 重试失败的目录。 */
  retryDirectory(path: string): void
}

/**
 * 管理项目树的全部状态与数据加载。
 * @param options 见 ProjectTreeModelOptions
 * @returns 见 ProjectTreeModel
 */
export function useProjectTree({ t, services }: ProjectTreeModelOptions): ProjectTreeModel {
  const gitStatus = useGitStatus(services)
  const ignoredPaths = useGitIgnored(services)
  const root = useSyncExternalStore(
    (listener) => services.subscribeRoot(listener),
    () => services.root,
    () => services.root,
  )

  /** 各目录的加载状态；缺省表示尚未请求。 */
  const [directories, setDirectories] = useState<Record<string, DirectoryState>>({})
  /** 已展开目录集合；根目录（空串）也在其中，Project 视图默认展开项目根节点。 */
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set([ROOT_PATH]))
  /** All Changed Files 视图里被收起的虚拟目录。 */
  const [collapsedChanged, setCollapsedChanged] = useState<ReadonlySet<string>>(() => new Set())
  /** 当前视图模式，默认与 IDEA 一致显示带根节点的 Project 视图。 */
  const [view, setView] = useState<ProjectView>('project')
  /** 当前选中的行路径。 */
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  /** 当前键盘焦点所在行路径。 */
  const [focusedPath, setFocusedPath] = useState<string | null>(null)
  /** 是否显示点开头的隐藏项。 */
  const [showHidden, setShowHidden] = useState(false)
  /** 递增后整棵树重新加载。 */
  const [reloadToken, setReloadToken] = useState(0)

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
    setExpanded(new Set([ROOT_PATH]))
    setCollapsedChanged(new Set())
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

  /** 工作区目录名，作为 Project 视图根节点的标题。 */
  const rootName = useMemo(() => root.split('/').filter(Boolean).pop() ?? root, [root])
  /** 根节点右侧展示的路径，主目录缩成 ~。 */
  const rootDisplayPath = useMemo(() => displayPathOf(root), [root])

  const rows = useMemo((): TreeRow[] => {
    if (view === 'changed') return buildChangedRows(gitStatus, collapsedChanged, showHidden)

    if (view === 'project') {
      const rootRow: RootRow = {
        kind: 'root',
        key: 'root',
        name: rootName,
        displayPath: rootDisplayPath,
        expanded: expanded.has(ROOT_PATH),
        depth: 0,
      }

      // 根节点收起时连子行都不生成，与 IDEA 折叠项目节点的行为一致
      if (!rootRow.expanded) return [rootRow]

      return [rootRow, ...buildRows({ directories, expanded, showHidden, gitStatus }, ROOT_PATH, 1)]
    }

    return buildRows({ directories, expanded, showHidden, gitStatus }, ROOT_PATH, 0)
  }, [collapsedChanged, directories, expanded, gitStatus, rootDisplayPath, rootName, showHidden, view])
  const entryRows = useMemo(() => rows.filter(isEntryRow), [rows])

  /** 把忽略集合拆成「精确文件」与「目录前缀」两类，判断时不用每次遍历全部条目。 */
  const ignoredMatcher = useMemo(() => {
    const files = new Set<string>()
    const directories: string[] = []

    for (const entry of ignoredPaths) {
      // 目录条目带尾斜杠，去掉后再与行路径（不带斜杠）比较
      if (entry.endsWith('/')) directories.push(entry.slice(0, -1))
      else files.add(entry)
    }

    return { files, directories }
  }, [ignoredPaths])

  /**
   * 判断一行是否被 .gitignore 忽略：精确命中文件，或位于被忽略的目录之下。
   * @param path 相对路径
   * @returns 被忽略时返回 true
   */
  const isIgnored = useCallback(
    (path: string): boolean =>
      ignoredMatcher.files.has(path) ||
      ignoredMatcher.directories.some((directory) => path === directory || path.startsWith(`${directory}/`)),
    [ignoredMatcher],
  )

  /** Changed 视图里的全部虚拟目录路径；「全部折叠」要一次性收起它们。 */
  const changedDirectories = useMemo(() => {
    const paths = new Set<string>()

    for (const path of gitStatus.keys()) {
      const segments = path.split('/')
      let prefix = ''

      for (const segment of segments.slice(0, -1)) {
        prefix = prefix === '' ? segment : `${prefix}/${segment}`
        paths.add(prefix)
      }
    }

    return paths
  }, [gitStatus])

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

  // 选中项同步到服务总线：顶部工具栏据此判断能否对当前选中项执行 Git 操作
  useEffect(() => {
    if (selectedPath === null) {
      services.setSelection(null)

      return
    }

    // 项目根不是行条目，按目录处理；其余行从行数据里取类型
    const row = entryRows.find((item) => item.path === selectedPath)
    services.setSelection({ path: selectedPath, directory: selectedPath === ROOT_PATH || row?.directory === true })
  }, [entryRows, selectedPath, services])

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
   * 判断一行的目录是否处于展开状态；两种视图用不同的状态集合。
   * @param path 行路径
   * @returns 展开时返回 true
   */
  const isRowExpanded = useCallback(
    (path: string): boolean => (view === 'changed' ? !collapsedChanged.has(path) : expanded.has(path)),
    [collapsedChanged, expanded, view],
  )

  /**
   * 按当前视图展开或收起一行目录。
   * @param path 目录路径
   */
  const toggleRow = useCallback(
    (path: string): void => {
      // Changed 视图的目录是虚拟节点，只需要记录收起状态，不发起目录请求
      if (view === 'changed') {
        setCollapsedChanged((previous) => {
          const next = new Set(previous)
          if (next.has(path)) next.delete(path)
          else next.add(path)

          return next
        })

        return
      }

      toggleDirectory(path)
    },
    [toggleDirectory, view],
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
        toggleRow(row.path)

        return
      }

      services.openFile(row.path)
    },
    [services, toggleRow],
  )

  /**
   * 打开视图切换下拉，选中项用 IDEA 同款的蓝底白字标出。
   * @param anchor 标题按钮的位置
   */
  const openViewMenu = useCallback(
    (anchor: DOMRect): void => {
      services.openContextMenu({
        x: anchor.left,
        y: anchor.bottom + 2,
        // IDEA 的视图下拉比右键菜单宽一些，留出 All Changed Files 的长度
        minWidth: 220,
        items: VIEW_OPTIONS.map((option) => ({
          id: option.id,
          label: t(option.labelKey),
          selected: view === option.id,
          run: () => {
            setView(option.id)
            setSelectedPath(null)
            setFocusedPath(null)
          },
        })),
      })
    },
    [services, t, view],
  )

  /**
   * 键盘导航：上下移动、首尾跳转、左右展开与折叠。
   * @param event 键盘事件
   */
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>): void => {
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

        if (!isRowExpanded(current.path)) {
          toggleRow(current.path)

          return
        }

        const child = entryRows[index + 1]
        if (child !== undefined && child.depth === current.depth + 1) focusRow(child.path)

        return
      }

      // 左键：收起目录；已收起时回到父目录
      if (event.key === 'ArrowLeft') {
        event.preventDefault()

        if (current.directory && isRowExpanded(current.path)) {
          toggleRow(current.path)

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
    [activate, entryRows, focusRow, focusedPath, isRowExpanded, toggleRow],
  )

  /**
   * 选中并聚焦一行。
   * @param path 行路径
   */
  const selectRow = useCallback((path: string): void => {
    setSelectedPath(path)
    setFocusedPath(path)
  }, [])

  /**
   * 注册行元素引用，卸载时清理。
   * @param path 行路径
   * @param element 行按钮
   */
  const registerRowRef = useCallback((path: string, element: HTMLButtonElement | null): void => {
    if (element === null) rowRefs.current.delete(path)
    else rowRefs.current.set(path, element)
  }, [])

  return {
    view,
    rows,
    showHidden,
    selectedPath,
    focusedPath,
    gitStatusOf: (path) => gitStatus.get(path),
    isIgnored,
    isRowExpanded,
    registerRowRef,
    selectRow,
    setFocused: setFocusedPath,
    toggleRow,
    handleKeyDown,
    openViewMenu,
    toggleHidden: () => setShowHidden((previous) => !previous),
    collapseAll: () => {
      setExpanded(new Set())
      setCollapsedChanged(changedDirectories)
    },
    refresh: () => setReloadToken((previous) => previous + 1),
    retryDirectory: (path) => void loadDirectory(path),
  }
}
