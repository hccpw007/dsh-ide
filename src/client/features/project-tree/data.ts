/**
 * 项目树的数据层。
 *
 * 目录列表来源是插件自己的 `/fs/list` 路由，而不是宿主的 workspaceFiles Remote：
 * 项目树需要列工作区之外的符号链接目标、需要在文件被删除后立刻看到变化，而且
 * 后面的重命名 / 删除 / 新建都要落到同一套路径语义上。统一走插件路由，项目树与
 * 其余 feature（搜索、Git、编辑器）就能共用同一套工作区边界。
 */
import { apiGet } from '../../../common/api'

/** 目录项。 */
export interface TreeEntry {
  /** 文件名。 */
  name: string
  /** 条目类型。 */
  type: 'file' | 'directory' | 'other'
  /** 字节数，仅文件。 */
  size?: number
  /** 目录是否有子项；宿主探测，缺省表示未探测或已跳过。 */
  hasChildren?: boolean
}

/** 一次目录列举的结果。 */
export interface TreeListing {
  /** 绝对路径。 */
  path: string
  /** 子项。 */
  entries: TreeEntry[]
  /** 是否被截断。 */
  truncated: boolean
}

/** 一个目录的加载状态。 */
export interface DirectoryState {
  /** 状态。 */
  status: 'loading' | 'ready' | 'error'
  /** 子项。 */
  entries: TreeEntry[]
  /** 是否被截断。 */
  truncated: boolean
  /** 错误信息。 */
  error?: string
}

/** 根目录在树内部用空串表示。 */
export const ROOT_PATH = ''

/**
 * Git 自己的元数据目录名。
 *
 * 它不会出现在 .gitignore 里，但语义上总是「被忽略」：默认模式下整目录收起，
 * 显示模式下与其他忽略项一样灰显。
 */
export const GIT_METADATA_DIRECTORY = '.git'

/**
 * 拼接子项的相对路径。
 * @param parent 父目录相对路径；根为空串
 * @param name 子项名称
 * @returns 子项相对路径
 */
export function entryPathOf(parent: string, name: string): string {
  return parent === ROOT_PATH ? name : `${parent}/${name}`
}

/**
 * 取父目录路径。
 * @param path 相对路径
 * @returns 父目录相对路径；顶层条目返回空串
 */
export function parentPathOf(path: string): string {
  const index = path.lastIndexOf('/')

  return index < 0 ? ROOT_PATH : path.slice(0, index)
}

/**
 * 判断条目名能否安全拼进相对路径。
 * @param name 条目标名
 * @returns 合法时返回 true
 */
export function isSafeEntryName(name: string): boolean {
  return name !== '' && name !== '.' && name !== '..' && !name.includes('/') && !name.includes('\0')
}

/**
 * 目录优先、自然序、忽略大小写排序。
 * @param left 前一项
 * @param right 后一项
 * @returns 比较结果
 */
export function compareEntries(left: TreeEntry, right: TreeEntry): number {
  const leftDirectory = left.type === 'directory'
  const rightDirectory = right.type === 'directory'

  // 与 IDEA 一致：目录排在文件之前
  if (leftDirectory !== rightDirectory) return leftDirectory ? -1 : 1

  return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' })
}

/**
 * 请求一个目录的直接子项。
 * @param root 工作区根
 * @param path 相对路径；根为空串
 * @param signal 取消信号
 * @returns 加载结果
 */
export async function fetchDirectory(
  root: string,
  path: string,
  signal?: AbortSignal,
): Promise<DirectoryState> {
  const result = await apiGet<TreeListing>('/fs/list', { root, path: path === ROOT_PATH ? '.' : path }, signal)

  if (!result.ok) {
    return { status: 'error', entries: [], truncated: false, error: result.error.message }
  }

  // 宿主可能返回额外类型；只保留名称与类型都是字符串的条目，避免渲染时崩
  const entries = result.value.entries.filter(
    (entry) => typeof entry.name === 'string' && typeof entry.type === 'string',
  )

  return { status: 'ready', entries, truncated: result.value.truncated }
}
