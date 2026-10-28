/**
 * 差异两侧内容的取数。
 *
 * 编辑器里的差异标签与 Git 面板里的内嵌差异共用这一套取数：三种来源各自取
 * 两侧完整文本，而不是解析补丁 —— 补丁无法表达未跟踪文件的全文，也不方便
 * 判断二进制与超大文件。
 */
import { apiGet, apiPost } from '../../../common/api'
import type { DiffSource } from '../../shell/contract'

/** 差异正文可渲染的文件大小上限。 */
const MAX_DIFF_BYTES = 2 * 1024 * 1024

/** 差异两侧数据。 */
export interface DiffData {
  /** 旧文本。 */
  left: string
  /** 新文本。 */
  right: string
  /** 旧侧标题。 */
  leftTitle: string
  /** 新侧标题。 */
  rightTitle: string
}

/** 取数结果：正常两侧文本，或超出渲染上限的大小。 */
type DiffLoadResult = DiffData | { tooLarge: number }

/**
 * 读取某个提交里某个文件的正文。
 * @param root 工作区根
 * @param hash 提交或 ref
 * @param path 路径
 * @returns 文件正文；文件在该 ref 里不存在时为空串
 */
async function readBlob(root: string, hash: string, path: string): Promise<string> {
  const result = await apiPost<{ text: string }>('/git/exec', { method: 'showFileText', cwd: root, hash, path })

  // 文件在该提交里被删除是常见情况，不当作错误
  return result.ok ? result.value.text : ''
}

/**
 * 解析差异来源并取回两侧文本。
 * @param source 差异来源
 * @param root 工作区根
 * @returns 两侧文本或边界情况
 */
export async function loadDiffData(source: DiffSource, root: string): Promise<DiffLoadResult> {
  if (source.kind === 'files') {
    const [left, right] = await Promise.all([
      apiGet<{ text: string; bytes: number }>('/fs/read', { root, path: source.left }),
      apiGet<{ text: string; bytes: number }>('/fs/read', { root, path: source.right }),
    ])

    if (!left.ok) throw new Error(left.error.message)
    if (!right.ok) throw new Error(right.error.message)

    const bytes = Math.max(left.value.bytes, right.value.bytes)
    if (bytes > MAX_DIFF_BYTES) return { tooLarge: bytes }

    return { left: left.value.text, right: right.value.text, leftTitle: source.left, rightTitle: source.right }
  }

  if (source.kind === 'commits') {
    const target = source.path ?? ''
    const [leftText, rightText] = await Promise.all([
      readBlob(root, source.from, target),
      readBlob(root, source.to, target),
    ])

    return {
      left: leftText,
      right: rightText,
      leftTitle: `${source.from}${target === '' ? '' : ` · ${target}`}`,
      rightTitle: `${source.to}${target === '' ? '' : ` · ${target}`}`,
    }
  }

  // 工作区 vs HEAD：HEAD 侧用 git show，工作区侧读文件；暂存区模式读索引
  const [head, worktree] = await Promise.all([
    readBlob(root, 'HEAD', source.path),
    source.staged
      ? apiPost<{ text: string }>('/git/exec', { method: 'indexFileText', cwd: root, path: source.path })
      : apiGet<{ text: string; bytes: number }>('/fs/read', { root, path: source.path }),
  ])

  if (!worktree.ok) throw new Error(worktree.error.message)

  // 暂存区分支拿不到字节数，两种来源统一按文本重新计算，保证大小上限判断一致
  const worktreeText: string = worktree.value.text
  const bytes = new TextEncoder().encode(worktreeText).byteLength
  if (bytes > MAX_DIFF_BYTES) return { tooLarge: bytes }

  return {
    left: head,
    right: worktreeText,
    leftTitle: `HEAD · ${source.path}`,
    rightTitle: source.path,
  }
}
