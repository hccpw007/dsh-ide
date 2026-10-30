/**
 * 项目树的树模型与行渲染。
 *
 * 把「已加载目录 + 展开集合」摊平成一行行可见节点，是纯函数：组件只负责状态与事件。
 * 摊平而不是嵌套组件，是为了让键盘上下移动能直接按可见顺序走，也让虚拟化的接入点
 * 只有一个。All Changed Files 视图的目录树由 Git 状态直接合成，同样复用这套行模型。
 */

import { compareEntries, entryPathOf, isSafeEntryName, ROOT_PATH, type DirectoryState } from './data'

/** 每层缩进像素。 */
export const INDENT_WIDTH = 14

/** 行首基础缩进像素。 */
export const BASE_INDENT = 8

/** 递归展开的最大层数，防止异常数据造成无限递归。 */
const MAX_DEPTH = 64

/** 树中的一行。 */
export type TreeRow =
  | {
      /** 可聚焦的目录项。 */
      kind: 'entry'
      /** React key。 */
      key: string
      /** 相对路径。 */
      path: string
      /** 文件名。 */
      name: string
      /** 是否目录。 */
      directory: boolean
      /** 层数。 */
      depth: number
    }
  | {
      /** Project 视图顶部的项目根节点。 */
      kind: 'root'
      /** React key。 */
      key: string
      /** 目录名。 */
      name: string
      /** 展示用路径，主目录已缩成 ~。 */
      displayPath: string
      /** 是否展开。 */
      expanded: boolean
      /** 层数固定为 0。 */
      depth: number
    }
  | { kind: 'loading' | 'empty' | 'truncated'; key: string; depth: number }
  | { kind: 'error'; key: string; depth: number; retryPath: string; message: string }

/** 可聚焦的目录项行。 */
export type EntryRow = Extract<TreeRow, { kind: 'entry' }>

/** Project 视图顶部的根节点行。 */
export type RootRow = Extract<TreeRow, { kind: 'root' }>

/**
 * 项目树视图模式，对应 IDEA Project 工具窗口下拉里的三个选项。
 * - project：带项目根节点的完整树；
 * - packages：直接列工作区内容，与改造前的行为一致；
 * - changed：只显示 Git 变更文件。
 */
export type ProjectView = 'project' | 'packages' | 'changed'

/** 视图下拉的选项；顺序与 IDEA 的 Project 下拉一致，只保留三个视图。 */
export const VIEW_OPTIONS: ReadonlyArray<{ id: ProjectView; labelKey: string }> = [
  { id: 'project', labelKey: 'viewProject' },
  { id: 'packages', labelKey: 'viewPackages' },
  { id: 'changed', labelKey: 'viewChanged' },
]

/**
 * 取视图对应的语言包 key。
 *
 * 工具条标题要显示当前视图名而不是固定的面板名，否则切换视图后标题不变，
 * 用户无从判断当前处在哪个视图。
 * @param view 当前视图
 * @returns 语言包 key
 */
export function viewLabelKey(view: ProjectView): string {
  return VIEW_OPTIONS.find((option) => option.id === view)?.labelKey ?? 'viewProject'
}

/**
 * 判断一行是否为可聚焦的目录项。
 * @param row 树行
 * @returns 目录项行返回 true
 */
export function isEntryRow(row: TreeRow): row is EntryRow {
  return row.kind === 'entry'
}

/** 把目录状态摊平成可见行的参数。 */
export interface BuildRowsOptions {
  /** 各目录的加载状态。 */
  directories: Record<string, DirectoryState>
  /** 已展开目录集合。 */
  expanded: ReadonlySet<string>
  /** 是否显示点开头的隐藏项。 */
  showHidden: boolean
  /** Git 状态映射，用于给文件名着色。 */
  gitStatus: ReadonlyMap<string, string>
}

/**
 * 把目录状态摊平成可见行。
 *
 * 只遍历已展开的目录，未展开目录的子项根本不会被访问——这既是性能要求，
 * 也是「未展开不请求」的实现基础。
 * @param options 见 BuildRowsOptions
 * @param parent 当前目录相对路径
 * @param depth 当前层数
 * @returns 可见行
 */
export function buildRows(
  options: BuildRowsOptions,
  parent: string = ROOT_PATH,
  depth: number = 0,
): TreeRow[] {
  const state = options.directories[parent]

  if (state === undefined || state.status === 'loading') {
    return [{ kind: 'loading', key: `loading:${parent}`, depth }]
  }

  if (state.status === 'error') {
    return [
      { kind: 'error', key: `error:${parent}`, depth, retryPath: parent, message: state.error ?? '' },
    ]
  }

  const entries = state.entries
    .filter((entry) => (options.showHidden || !entry.name.startsWith('.')) && isSafeEntryName(entry.name))
    .sort(compareEntries)

  if (entries.length === 0) return [{ kind: 'empty', key: `empty:${parent}`, depth }]

  const rows: TreeRow[] = []

  for (const entry of entries) {
    const path = entryPathOf(parent, entry.name)
    const directory = entry.type === 'directory'

    rows.push({ kind: 'entry', key: `entry:${path}`, path, name: entry.name, directory, depth })

    // 只展开用户点开过的目录；符号链接若指向目录，宿主已按目标类型报告
    if (directory && options.expanded.has(path) && depth < MAX_DEPTH) {
      rows.push(...buildRows(options, path, depth + 1))
    }
  }

  if (state.truncated) rows.push({ kind: 'truncated', key: `truncated:${parent}`, depth })

  return rows
}

/** Git 变更文件构造成的目录节点。 */
interface ChangedNode {
  /** 子目录。 */
  directories: Map<string, ChangedNode>
  /** 该目录下的变更文件。 */
  files: Array<{ name: string; path: string }>
}

/**
 * 把 Git 变更文件摊平成行，供 All Changed Files 视图使用。
 *
 * 变更文件来自宿主返回的「相对路径 → 状态」映射，不需要再请求目录；目录节点按
 * 路径分段合成，默认全部展开，收起状态由调用方记录。
 * @param gitStatus Git 状态映射
 * @param collapsed 已收起的目录集合
 * @param showHidden 是否显示点开头的项
 * @returns 可见行；没有变更时为空数组
 */
export function buildChangedRows(
  gitStatus: ReadonlyMap<string, string>,
  collapsed: ReadonlySet<string>,
  showHidden: boolean,
): TreeRow[] {
  const tree: ChangedNode = { directories: new Map(), files: [] }

  for (const path of gitStatus.keys()) {
    const segments = path.split('/').filter((segment) => segment !== '')

    if (segments.length === 0 || !segments.every(isSafeEntryName)) continue
    if (!showHidden && segments.some((segment) => segment.startsWith('.'))) continue

    let node = tree
    let parent = ROOT_PATH

    for (const segment of segments.slice(0, -1)) {
      parent = entryPathOf(parent, segment)

      let child = node.directories.get(segment)
      if (child === undefined) {
        child = { directories: new Map(), files: [] }
        node.directories.set(segment, child)
      }

      node = child
    }

    node.files.push({ name: segments[segments.length - 1], path })
  }

  return flattenChanged(tree, ROOT_PATH, 0, collapsed, [])
}

/**
 * 递归摊平变更目录树。
 * @param node 当前目录节点
 * @param parent 当前目录相对路径
 * @param depth 当前层数
 * @param collapsed 已收起的目录集合
 * @param rows 结果行
 * @returns 结果行
 */
function flattenChanged(
  node: ChangedNode,
  parent: string,
  depth: number,
  collapsed: ReadonlySet<string>,
  rows: TreeRow[],
): TreeRow[] {
  const directories = [...node.directories.keys()].sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }),
  )

  for (const name of directories) {
    const path = entryPathOf(parent, name)
    rows.push({ kind: 'entry', key: `entry:${path}`, path, name, directory: true, depth })

    const child = node.directories.get(name)
    if (child !== undefined && !collapsed.has(path) && depth < MAX_DEPTH) {
      flattenChanged(child, path, depth + 1, collapsed, rows)
    }
  }

  const files = [...node.files].sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }),
  )

  for (const file of files) {
    rows.push({ kind: 'entry', key: `entry:${file.path}`, path: file.path, name: file.name, directory: false, depth })
  }

  return rows
}
