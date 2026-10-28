/**
 * Git 面板的差异计算。
 *
 * 输入是两侧完整文本，输出是逐行数据、词级高亮片段与折叠段。差异库仍是懒加载
 * chunk：Git 面板打开时才会下载，不进主 bundle。
 */
import { loadLazyChunk } from '../../lazy/loader'
import type { Change } from '../../lazy/diff-kernel'

/** 差异 chunk 的形态。 */
interface DiffKernelChunk {
  /** 逐行比较。 */
  diffLines(left: string, right: string): Change[]
  /** 逐字符比较单行。 */
  diffChars(left: string, right: string): Change[]
}

/** 行内高亮片段：同一行里被改动与未被改动的字符段。 */
export interface DiffSegment {
  /** 片段文本。 */
  text: string
  /** 是否为改动部分。 */
  changed: boolean
}

/** 一行差异。 */
export interface DiffRow {
  /** 行类型。 */
  kind: 'equal' | 'added' | 'removed' | 'modified'
  /** 旧文件行号；该行不存在时为 null。 */
  leftNumber: number | null
  /** 新文件行号；该行不存在时为 null。 */
  rightNumber: number | null
  /** 旧内容。 */
  left: string
  /** 新内容。 */
  right: string
  /** 旧侧词级高亮；仅修改行有值。 */
  leftSegments?: DiffSegment[]
  /** 新侧词级高亮；仅修改行有值。 */
  rightSegments?: DiffSegment[]
}

/** 折叠段：中间有若干行未改动的内容被收起。 */
export interface DiffFold {
  /** 折叠的行数。 */
  count: number
  /** 折叠段在 rows 里的起始下标。 */
  from: number
}

/** 计算选项。 */
export interface DiffOptions {
  /** 是否忽略空白差异。 */
  ignoreWhitespace: boolean
  /** 是否忽略大小写差异。 */
  ignoreCase: boolean
}

/**
 * 把文本切成行，去掉末尾 split 产生的空串。
 * @param text 文本
 * @returns 行数组
 */
function linesOf(text: string): string[] {
  if (text === '') return []

  const lines = text.split('\n')

  return lines[lines.length - 1] === '' ? lines.slice(0, -1) : lines
}

/**
 * 把一行拆成词级高亮片段。
 * @param changes 字符级变更
 * @param side 取哪一侧
 * @returns 片段列表
 */
function segmentsOf(changes: Change[], side: 'left' | 'right'): DiffSegment[] {
  const segments: DiffSegment[] = []

  for (const change of changes) {
    if (side === 'left' && change.added === true) continue
    if (side === 'right' && change.removed === true) continue

    segments.push({
      text: change.value,
      changed: side === 'left' ? change.removed === true : change.added === true,
    })
  }

  return segments
}

/**
 * 把逐行变更摊平成可渲染的行。
 *
 * 相邻的「删除块 + 新增块」按位置配对成修改行，再对每对做字符级比较，得到行内
 * 高亮；多出来的部分才是纯删或纯增。
 * @param changes 行级变更
 * @param leftLines 原始旧文本行
 * @param rightLines 原始新文本行
 * @param chunk 差异内核
 * @returns 逐行数据
 */
function buildRows(
  changes: Change[],
  leftLines: string[],
  rightLines: string[],
  chunk: DiffKernelChunk,
): DiffRow[] {
  const rows: DiffRow[] = []
  let leftIndex = 0
  let rightIndex = 0

  for (let index = 0; index < changes.length; index += 1) {
    const change = changes[index]
    if (change === undefined) continue

    if (change.removed === true) {
      const next = changes[index + 1]
      const removedCount = linesOf(change.value).length
      const addedCount = next?.added === true ? linesOf(next.value).length : 0
      const paired = Math.min(removedCount, addedCount)

      for (let offset = 0; offset < paired; offset += 1) {
        const left = leftLines[leftIndex] ?? ''
        const right = rightLines[rightIndex] ?? ''
        leftIndex += 1
        rightIndex += 1

        if (left === right) {
          rows.push({ kind: 'equal', leftNumber: leftIndex, rightNumber: rightIndex, left, right })
        } else {
          const chars = chunk.diffChars(left, right)
          rows.push({
            kind: 'modified',
            leftNumber: leftIndex,
            rightNumber: rightIndex,
            left,
            right,
            leftSegments: segmentsOf(chars, 'left'),
            rightSegments: segmentsOf(chars, 'right'),
          })
        }
      }

      for (let offset = paired; offset < removedCount; offset += 1) {
        const line = leftLines[leftIndex] ?? ''
        leftIndex += 1
        rows.push({ kind: 'removed', leftNumber: leftIndex, rightNumber: null, left: line, right: '' })
      }

      for (let offset = paired; offset < addedCount; offset += 1) {
        const line = rightLines[rightIndex] ?? ''
        rightIndex += 1
        rows.push({ kind: 'added', leftNumber: null, rightNumber: rightIndex, left: '', right: line })
      }

      // 已消费紧随其后的新增块
      if (next?.added === true) index += 1

      continue
    }

    if (change.added === true) {
      for (let offset = 0; offset < linesOf(change.value).length; offset += 1) {
        const line = rightLines[rightIndex] ?? ''
        rightIndex += 1
        rows.push({ kind: 'added', leftNumber: null, rightNumber: rightIndex, left: '', right: line })
      }

      continue
    }

    for (let offset = 0; offset < linesOf(change.value).length; offset += 1) {
      const line = leftLines[leftIndex] ?? ''
      leftIndex += 1
      rightIndex += 1
      rows.push({ kind: 'equal', leftNumber: leftIndex, rightNumber: rightIndex, left: line, right: line })
    }
  }

  return rows
}

/**
 * 计算差异行。
 * @param left 旧文本
 * @param right 新文本
 * @param options 忽略空白 / 大小写
 * @returns 逐行数据
 */
export async function computeDiffRows(left: string, right: string, options: DiffOptions): Promise<DiffRow[]> {
  const chunk = await loadLazyChunk<DiffKernelChunk>('diff-kernel')
  const leftLines = linesOf(left)
  const rightLines = linesOf(right)

  // 归一化只作用于比较，展示仍用原文；否则面板里会显示被改写过的内容
  const normalize = (line: string): string =>
    options.ignoreCase ? line.toLowerCase() : options.ignoreWhitespace ? line.replace(/[ \t]+/g, ' ') : line
  const changes = chunk.diffLines(leftLines.map(normalize).join('\n'), rightLines.map(normalize).join('\n'))

  return buildRows(changes, leftLines, rightLines, chunk)
}

/**
 * 计算需要折叠的未改动区段。
 *
 * 距离改动行超过 `context` 行的连续等值行会被收起；长度不足 3 的区段不值得折叠，
 * 直接显示。与 IDEA 的折叠粒度一致。
 * @param rows 逐行数据
 * @param context 上下文行数
 * @returns 折叠段，按起始下标升序
 */
export function findFolds(rows: DiffRow[], context: number): DiffFold[] {
  const visible = new Uint8Array(rows.length)

  for (let index = 0; index < rows.length; index += 1) {
    if (rows[index]?.kind === 'equal') continue

    const from = Math.max(0, index - context)
    const to = Math.min(rows.length - 1, index + context)

    for (let offset = from; offset <= to; offset += 1) visible[offset] = 1
  }

  const folds: DiffFold[] = []
  let start = -1

  for (let index = 0; index <= rows.length; index += 1) {
    const hidden = index < rows.length && visible[index] === 0

    if (hidden && start < 0) start = index

    if (!hidden && start >= 0) {
      if (index - start > 2) folds.push({ count: index - start, from: start })
      start = -1
    }
  }

  return folds
}

/**
 * 找出每处差异块的起始行下标；用于工具栏的上一处 / 下一处导航。
 * @param rows 逐行数据
 * @returns 差异块起始下标
 */
export function changeStarts(rows: DiffRow[]): number[] {
  const starts: number[] = []
  let inChange = false

  for (let index = 0; index < rows.length; index += 1) {
    const changed = rows[index]?.kind !== 'equal'

    if (changed && !inChange) starts.push(index)
    inChange = changed
  }

  return starts
}
