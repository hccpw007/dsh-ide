/**
 * 差异来源与两侧内容的取数。
 *
 * 编辑器里的差异标签与 Git 面板的内嵌差异共用这一套取数：三种来源各自取两侧
 * 完整文本，而不是解析补丁 —— 补丁无法表达未跟踪文件的全文，也不方便判断
 * 二进制与超大文件。
 *
 * 放在公共层而不是某个 feature 里：Git 面板与差异标签是两个 feature，取数规则
 * 必须只有一份，否则同一份差异会在两处给出不同的边界判断。
 */
import { apiGet, apiPost } from './api'

/** 差异来源：三种来源共用同一套渲染器。 */
export type DiffSource =
  | { kind: 'worktree'; path: string; staged: boolean }
  | { kind: 'commits'; from: string; to: string; path?: string }
  | { kind: 'files'; left: string; right: string }

/** 差异正文可渲染的文件大小上限。 */
const MAX_DIFF_BYTES = 2 * 1024 * 1024

/** 差异两侧数据。 */
export interface DiffData {
  /** 旧文本。 */
  left: string
  /** 新文本。 */
  right: string
  /** 旧侧说明；旧侧不存在时为空串。 */
  leftTitle: string
  /** 新侧说明。 */
  rightTitle: string
  /** 是否为二进制内容；为 true 时两侧文本为空。 */
  binary: boolean
  /** 较大一侧的字节数。 */
  bytes: number
  /** 旧侧版本里没有该路径（仅工作区来源可能为 true）。 */
  isNew: boolean
}

/** 取数结果：正常两侧文本，或超出渲染上限的大小。 */
export type DiffLoadResult = DiffData | { tooLarge: number }

/**
 * 计算文本字节数。
 * @param text 文本
 * @returns UTF-8 字节数
 */
function byteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength
}

/**
 * 按 NUL 字符判断二进制：文本文件里不会出现 0x00。
 * @param text 文本
 * @returns 是否像二进制
 */
function looksBinary(text: string): boolean {
  return text.includes('\u0000')
}

/**
 * 读取某个版本里某个文件的正文。
 * @param root 工作区根
 * @param hash 提交或 ref
 * @param path 路径
 * @returns 文件正文；文件在该版本里不存在时为空串
 */
async function readBlob(root: string, hash: string, path: string): Promise<string> {
  const result = await apiPost<{ text: string }>('/git/exec', { method: 'showFileText', cwd: root, hash, path })

  // 文件在该提交里被删除是常见情况，不当作错误
  return result.ok ? result.value.text : ''
}

/**
 * 工作区差异：HEAD 与工作区（或索引区）比较，二进制与「新增文件」由宿主判定。
 * @param source 工作区来源
 * @param root 工作区根
 * @returns 两侧文本或超出上限的大小
 */
async function loadWorktreeDiff(
  source: Extract<DiffSource, { kind: 'worktree' }>,
  root: string,
): Promise<DiffLoadResult> {
  const result = await apiPost<{ binary: boolean; bytes: number; left: string; right: string; isNew: boolean }>(
    '/git/exec',
    { method: 'diffWorktree', cwd: root, path: source.path, staged: String(source.staged) },
  )

  if (!result.ok) throw new Error(result.error.message)
  if (result.value.bytes > MAX_DIFF_BYTES) return { tooLarge: result.value.bytes }

  return {
    left: result.value.left,
    right: result.value.right,
    // 新增文件没有旧版本，标题只标当前版本
    leftTitle: result.value.isNew ? '' : `HEAD · ${source.path}`,
    rightTitle: source.staged ? `Index · ${source.path}` : source.path,
    binary: result.value.binary,
    bytes: result.value.bytes,
    isNew: result.value.isNew,
  }
}

/**
 * 两个版本之间的差异（历史提交、跨提交比较）。
 * @param source 提交来源
 * @param root 工作区根
 * @returns 两侧文本或超出上限的大小
 */
async function loadCommitsDiff(
  source: Extract<DiffSource, { kind: 'commits' }>,
  root: string,
): Promise<DiffLoadResult> {
  const target = source.path ?? ''
  const [left, right] = await Promise.all([
    readBlob(root, source.from, target),
    readBlob(root, source.to, target),
  ])

  const bytes = Math.max(byteLength(left), byteLength(right))
  if (bytes > MAX_DIFF_BYTES) return { tooLarge: bytes }

  return {
    left,
    right,
    // 两侧版本就是两个提交：路径属于标题栏的另一个位置，不在这里重复
    leftTitle: source.from,
    rightTitle: source.to,
    binary: looksBinary(left) || looksBinary(right),
    bytes,
    isNew: false,
  }
}

/**
 * 两个工作区文件之间的差异。
 * @param source 文件来源
 * @param root 工作区根
 * @returns 两侧文本或超出上限的大小
 */
async function loadFilesDiff(
  source: Extract<DiffSource, { kind: 'files' }>,
  root: string,
): Promise<DiffLoadResult> {
  const [left, right] = await Promise.all([
    apiGet<{ text: string; bytes: number }>('/fs/read', { root, path: source.left }),
    apiGet<{ text: string; bytes: number }>('/fs/read', { root, path: source.right }),
  ])

  if (!left.ok) throw new Error(left.error.message)
  if (!right.ok) throw new Error(right.error.message)

  const bytes = Math.max(left.value.bytes, right.value.bytes)
  if (bytes > MAX_DIFF_BYTES) return { tooLarge: bytes }

  return {
    left: left.value.text,
    right: right.value.text,
    leftTitle: source.left,
    rightTitle: source.right,
    binary: looksBinary(left.value.text) || looksBinary(right.value.text),
    bytes,
    isNew: false,
  }
}

/**
 * 解析差异来源并取回两侧文本。
 * @param source 差异来源
 * @param root 工作区根
 * @returns 两侧文本或边界情况
 */
export async function loadDiffData(source: DiffSource, root: string): Promise<DiffLoadResult> {
  if (source.kind === 'worktree') return loadWorktreeDiff(source, root)
  if (source.kind === 'commits') return loadCommitsDiff(source, root)

  return loadFilesDiff(source, root)
}

/**
 * 差异来源的稳定身份，用作标签去重键与持久化 id。
 * @param source 差异来源
 * @returns 可比较的字符串
 */
export function diffSourceId(source: DiffSource): string {
  if (source.kind === 'worktree') return `worktree:${source.staged ? 'staged' : 'unstaged'}:${source.path}`
  if (source.kind === 'commits') return `commits:${source.from}..${source.to}:${source.path ?? ''}`

  return `files:${source.left}:${source.right}`
}
