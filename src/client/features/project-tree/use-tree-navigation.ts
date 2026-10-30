/**
 * 项目树的展开集合、选中行与键盘焦点。
 *
 * 三者互相牵动：展开会改变可见行，可见行变化要纠正焦点，选中要落到服务总线，
 * 因此放在同一个 hook 里维护，避免同一份状态被拆到多处读写。可见行的计算与键盘
 * 导航留在 use-project-tree.ts：那里才同时拥有行数据。
 */
import { useCallback, useRef, useState } from 'react'

import type { IdeServices } from '../../shell/contract'

import { ROOT_PATH } from './data'
import type { EntryRow, ProjectView } from './tree-model'

/** hook 入参。 */
export interface TreeNavigationOptions {
  /** 服务总线：打开文件要用。 */
  services: IdeServices
  /** 当前视图；Changed 视图的目录是 Git 合成的虚拟节点。 */
  view: ProjectView
  /** 目录是否已加载过；只有未加载过的目录才在展开时请求。 */
  isDirectoryLoaded(path: string): boolean
  /** 加载一个目录的直接子项。 */
  loadDirectory(path: string): Promise<void>
}

/** 展开、选中与焦点交出的状态与操作。 */
export interface TreeNavigation {
  /** 已展开目录集合。 */
  expanded: ReadonlySet<string>
  /** Changed 视图里被收起的虚拟目录。 */
  collapsedChanged: ReadonlySet<string>
  /** 当前选中的行路径。 */
  selectedPath: string | null
  /** 当前键盘焦点所在行路径。 */
  focusedPath: string | null
  /** 判断一行的目录是否处于展开状态。 */
  isRowExpanded(path: string): boolean
  /** 按当前视图展开或收起一行目录。 */
  toggleRow(path: string): void
  /** 选中并聚焦一行。 */
  selectRow(path: string): void
  /** 只更新键盘焦点。 */
  setFocused(path: string | null): void
  /** 把焦点移到指定行，并滚进可视区。 */
  focusRow(path: string): void
  /** 注册行元素引用。 */
  registerRowRef(path: string, element: HTMLButtonElement | null): void
  /** 打开文件或切换目录。 */
  activate(row: EntryRow): void
  /** 收起全部目录。 */
  collapseAll(changedDirectories: ReadonlySet<string>): void
  /** 展开一批目录；传入全部目录即「全部展开」。 */
  expandPaths(paths: Iterable<string>): void
  /** 展开 Changed 视图的全部虚拟目录。 */
  expandChangedAll(): void
  /** 清空选中与焦点；切换视图时可见行整体换掉，旧选中没有意义。 */
  clearSelection(): void
  /** 回到初始展开状态并清空选中与焦点。 */
  reset(): void
}

/**
 * 维护项目树的展开、选中与焦点。
 * @param options 见 TreeNavigationOptions
 * @returns 见 TreeNavigation
 */
export function useTreeNavigation({
  services,
  view,
  isDirectoryLoaded,
  loadDirectory,
}: TreeNavigationOptions): TreeNavigation {
  /** 已展开目录集合；根目录（空串）也在其中，Project 视图默认展开项目根节点。 */
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set([ROOT_PATH]))
  /** All Changed Files 视图里被收起的虚拟目录。 */
  const [collapsedChanged, setCollapsedChanged] = useState<ReadonlySet<string>>(() => new Set())
  /** 当前选中的行路径。 */
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  /** 当前键盘焦点所在行路径。 */
  const [focusedPath, setFocusedPath] = useState<string | null>(null)

  /** 行元素引用，供键盘导航直接移动焦点。 */
  const rowRefs = useRef(new Map<string, HTMLButtonElement>())

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
      if (!isDirectoryLoaded(path)) void loadDirectory(path)
    },
    [expanded, isDirectoryLoaded, loadDirectory],
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
   * 选中并聚焦一行。
   * @param path 行路径
   */
  const selectRow = useCallback((path: string): void => {
    setSelectedPath(path)
    setFocusedPath(path)
  }, [])

  /**
   * 打开文件或切换目录。
   * @param row 目录项行
   */
  const activate = useCallback(
    (row: EntryRow): void => {
      setSelectedPath(row.path)
      setFocusedPath(row.path)

      if (row.directory) {
        // 空目录没有子项可展示，展开动作没有意义
        if (row.expandable) toggleRow(row.path)

        return
      }

      services.openFile(row.path)
    },
    [services, toggleRow],
  )

  /**
   * 注册行元素引用，卸载时清理。
   * @param path 行路径
   * @param element 行按钮
   */
  const registerRowRef = useCallback((path: string, element: HTMLButtonElement | null): void => {
    if (element === null) rowRefs.current.delete(path)
    else rowRefs.current.set(path, element)
  }, [])

  /**
   * 收起全部目录。
   * @param changedDirectories Changed 视图里的全部虚拟目录路径
   */
  const collapseAll = useCallback((changedDirectories: ReadonlySet<string>): void => {
    setExpanded(new Set())
    setCollapsedChanged(changedDirectories)
  }, [])

  /**
   * 追加展开若干目录，已有的展开状态保持不变。
   * @param paths 目录路径
   */
  const expandPaths = useCallback((paths: Iterable<string>): void => {
    setExpanded((previous) => {
      const next = new Set(previous)
      for (const path of paths) next.add(path)

      return next
    })
  }, [])

  /** 展开 Changed 视图的全部虚拟目录；这些目录由 Git 状态合成，没有加载状态需要同步。 */
  const expandChangedAll = useCallback((): void => {
    setCollapsedChanged(new Set())
  }, [])

  /** 清空选中与焦点；切换视图时可见行整体换掉，旧选中没有意义。 */
  const clearSelection = useCallback((): void => {
    setSelectedPath(null)
    setFocusedPath(null)
  }, [])

  /** 回到初始展开状态并清空选中与焦点；换根或整树刷新时使用。 */
  const reset = useCallback((): void => {
    setExpanded(new Set([ROOT_PATH]))
    setCollapsedChanged(new Set())
    setSelectedPath(null)
    setFocusedPath(null)
    rowRefs.current.clear()
  }, [])

  return {
    expanded,
    collapsedChanged,
    selectedPath,
    focusedPath,
    isRowExpanded,
    toggleRow,
    selectRow,
    setFocused: setFocusedPath,
    focusRow,
    registerRowRef,
    activate,
    collapseAll,
    expandPaths,
    expandChangedAll,
    clearSelection,
    reset,
  }
}
