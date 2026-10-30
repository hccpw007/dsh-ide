/**
 * 项目树的状态编排。
 *
 * 目录加载在 use-directory-loader，展开/选中/焦点在 use-tree-navigation，Git 订阅在
 * use-git-status；这里把三者组合成三种视图（Project / Packages / All Changed Files）
 * 的可见行，并处理键盘导航、视图下拉与选中项上报。ProjectTree 只负责渲染这些行。
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { KeyboardEvent } from 'react'

import type { Translate } from '../../../types/plugin'
import type { IdeServices } from '../../shell/contract'

import { ROOT_PATH } from './data'
import {
  buildChangedRows,
  buildRows,
  isEntryRow,
  VIEW_OPTIONS,
  type ProjectView,
  type RootRow,
  type TreeRow,
} from './tree-model'
import { useDirectoryLoader } from './use-directory-loader'
import { useGitStatus, useIsIgnored } from './use-git-status'
import { useTreeNavigation } from './use-tree-navigation'

/**
 * 把绝对路径里的主目录缩成 ~。
 * @param absolutePath 工作区绝对路径
 * @returns 展示用路径；浏览器拿不到 home，按常见的家目录前缀推断
 */
function displayPathOf(absolutePath: string): string {
  return absolutePath.replace(/^\/(?:Users|home)\/[^/]+/u, '~')
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
  /** 是否显示被 .gitignore 忽略的项。 */
  showIgnored: boolean
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
  /** 切换被忽略项的显示。 */
  toggleIgnored(): void
  /** 收起全部目录。 */
  collapseAll(): void
  /** 展开全部目录。 */
  expandAll(): void
  /** 展开并滚动到编辑器当前打开的文件。 */
  locateActiveFile(): void
  /** 整树刷新。 */
  refresh(): void
  /** 重试失败的目录。 */
  retryDirectory(path: string): void
}

/**
 * 管理项目树的状态与数据加载。
 * @param options 见 ProjectTreeModelOptions
 * @returns 见 ProjectTreeModel
 */
export function useProjectTree({ t, services }: ProjectTreeModelOptions): ProjectTreeModel {
  const root = useSyncExternalStore(
    (listener) => services.subscribeRoot(listener),
    () => services.root,
    () => services.root,
  )
  const gitStatus = useGitStatus(services)
  const isIgnored = useIsIgnored(services)

  /** 当前视图模式，默认与 IDEA 一致显示带根节点的 Project 视图。 */
  const [view, setView] = useState<ProjectView>('project')
  /** 是否显示被 .gitignore 忽略的项；默认隐藏，与 IDEA 的默认视角一致。 */
  const [showIgnored, setShowIgnored] = useState(false)

  const loader = useDirectoryLoader({ services, root })

  /**
   * 判断目录是否已加载过：只有未加载过的目录才在展开时请求。
   * @param path 目录路径
   * @returns 已请求过时返回 true
   */
  const isDirectoryLoaded = useCallback(
    (path: string): boolean => loader.directories[path] !== undefined,
    [loader.directories],
  )

  const {
    expanded,
    collapsedChanged,
    selectedPath,
    focusedPath,
    isRowExpanded,
    toggleRow,
    selectRow,
    setFocused,
    focusRow,
    registerRowRef,
    activate,
    collapseAll,
    expandPaths,
    expandChangedAll,
    clearSelection,
    reset: resetNavigation,
  } = useTreeNavigation({ services, view, isDirectoryLoaded, loadDirectory: loader.loadDirectory })

  // 换根或整树刷新：目录由 loader 重建，这里把展开、选中与焦点恢复到初始状态
  useEffect(() => {
    resetNavigation()
  }, [loader.reloadToken, resetNavigation, root])

  /** 工作区目录名，作为 Project 视图根节点的标题。 */
  const rootName = useMemo(() => root.split('/').filter(Boolean).pop() ?? root, [root])
  /** 根节点右侧展示的路径，主目录缩成 ~。 */
  const rootDisplayPath = useMemo(() => displayPathOf(root), [root])

  const rows = useMemo((): TreeRow[] => {
    if (view === 'changed') return buildChangedRows(gitStatus, collapsedChanged, showIgnored, isIgnored)

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

      return [rootRow, ...buildRows({ directories: loader.directories, expanded, gitStatus, showIgnored, isIgnored }, ROOT_PATH, 1)]
    }

    return buildRows({ directories: loader.directories, expanded, gitStatus, showIgnored, isIgnored }, ROOT_PATH, 0)
  }, [collapsedChanged, expanded, gitStatus, isIgnored, loader.directories, rootDisplayPath, rootName, showIgnored, view])
  const entryRows = useMemo(() => rows.filter(isEntryRow), [rows])

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
      if (focusedPath !== null) setFocused(null)

      return
    }

    if (focusedPath === null || !entryRows.some((row) => row.path === focusedPath)) {
      setFocused(entryRows[0].path)
    }
  }, [entryRows, focusedPath, setFocused])

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
            clearSelection()
          },
        })),
      })
    },
    [clearSelection, services, t, view],
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
   * 全部展开：Project / Packages 视图递归加载并展开所有目录，Changed 视图展开全部虚拟目录。
   */
  const expandAll = useCallback((): void => {
    // Changed 视图的目录由 Git 状态合成，没有加载状态要同步，清空收起集合即可
    if (view === 'changed') {
      expandChangedAll()

      return
    }

    void (async (): Promise<void> => {
      // loadAllDirectories 内部兜底不抛错，这里只负责把结果交给展开状态
      expandPaths(await loader.loadAllDirectories())
    })()
  }, [expandChangedAll, expandPaths, loader, view])

  /**
   * 定位当前文件：逐级加载并展开它的父目录，再把焦点与滚动位置落到该文件行。
   */
  const locateActiveFile = useCallback((): void => {
    const file = services.activeFile()

    if (file === null || root === '') return

    // Changed 视图只列 Git 变更文件，未变更的文件不在其中，定位无从落地
    if (view === 'changed') return

    void (async (): Promise<void> => {
      try {
        /** 从工作区根到文件父目录的整条链路。 */
        const parents: string[] = []
        let prefix = ''

        for (const segment of file.split('/').slice(0, -1)) {
          prefix = prefix === '' ? segment : `${prefix}/${segment}`
          parents.push(prefix)
          await loader.loadDirectory(prefix)
        }

        expandPaths(parents)
        selectRow(file)
        // 行元素要等展开后的状态提交并渲染出来才存在，挪到下一轮事件循环再滚动
        window.setTimeout(() => focusRow(file), 0)
      } catch (error) {
        console.error('[project-tree] 定位当前文件失败:', error)
      }
    })()
  }, [expandPaths, focusRow, loader, root, selectRow, services, view])

  return {
    view,
    rows,
    showIgnored,
    selectedPath,
    focusedPath,
    gitStatusOf: (path) => gitStatus.get(path),
    isIgnored,
    isRowExpanded,
    registerRowRef,
    selectRow,
    setFocused: (path) => setFocused(path),
    toggleRow,
    handleKeyDown,
    openViewMenu,
    toggleIgnored: () => setShowIgnored((previous) => !previous),
    collapseAll: () => collapseAll(changedDirectories),
    expandAll,
    locateActiveFile,
    refresh: loader.refresh,
    retryDirectory: loader.retryDirectory,
  }
}
