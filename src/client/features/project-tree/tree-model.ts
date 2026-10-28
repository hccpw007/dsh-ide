/**
 * 项目树的树模型与行渲染。
 *
 * 把「已加载目录 + 展开集合」摊平成一行行可见节点，是纯函数：组件只负责状态与事件。
 * 摊平而不是嵌套组件，是为了让键盘上下移动能直接按可见顺序走，也让虚拟化的接入点
 * 只有一个。
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
  | { kind: 'loading' | 'empty' | 'truncated'; key: string; depth: number }
  | { kind: 'error'; key: string; depth: number; retryPath: string; message: string }

/** 可聚焦的目录项行。 */
export type EntryRow = Extract<TreeRow, { kind: 'entry' }>

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
