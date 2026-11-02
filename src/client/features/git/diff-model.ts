/**
 * Git 面板的差异计算。
 *
 * 输入是两侧完整文本，输出是逐行数据、词级高亮片段与折叠段。差异库仍是懒加载
 * chunk：Git 面板打开时才会下载，不进主 bundle。
 */
import { loadLazyChunk } from '../../lazy/loader'
import type { Change } from '../../lazy/diff-kernel'

/** 差异 chunk 的形态；两个入口超出时间预算时返回 undefined。 */
interface DiffKernelChunk {
  /** 逐行比较。 */
  diffLines(left: string, right: string): Change[] | undefined
  /** 逐字符比较单行。 */
  diffChars(left: string, right: string): Change[] | undefined
}

/** 行内高亮片段：同一行里被改动与未被改动的字符段。 */
export interface DiffSegment {
  /** 片段文本。 */
  text: string
  /** 是否为改动部分。 */
  changed: boolean
}

/**
 * 单行字符级比较的长度上限。
 *
 * 字符级 diff 的代价随行长接近平方增长：minified JS、单行 JSON、base64 这类整文件
 * 一行的内容（宿主允许到 2 MiB）一旦进来，主线程会卡死数十秒。超限的行按整行修改
 * 处理——行内着色少一层，但界面不会失去响应。
 */
const MAX_CHAR_DIFF_LINE = 2000

/**
 * 一次差异视图内字符级比较可消费的字符总数。
 *
 * 行级配对可能产生上千对修改行，每对单独看几十毫秒，累计起来同样能拖住主线程；
 * 预算由整次比较共享，用尽后剩余行按整行标改——词级高亮停在这里，内容照常显示。
 */
const MAX_CHAR_DIFF_CHARS = 1_500_000

/** 差异视图里当前选中的变更文件。 */
export interface SelectedChange {
  /** 相对仓库根的路径。 */
  path: string
  /** 右侧取索引区还是工作区。 */
  staged: boolean
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

/** 计算选项。 */
export interface DiffOptions {
  /** 是否忽略空白差异。 */
  ignoreWhitespace: boolean
  /** 是否忽略大小写差异。 */
  ignoreCase: boolean
}

/** 一次差异计算的结果。 */
export interface DiffResult {
  /** 逐行数据。 */
  rows: DiffRow[]
  /** 是否因超出计算预算退化为按行号对齐；调用方据此提示用户。 */
  degraded: boolean
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
  /** 字符级比较的剩余预算；用尽后剩余修改行整行标改。 */
  let charBudget = MAX_CHAR_DIFF_CHARS

  /**
   * 生成一对整行标改的修改行：字符级比较被跳过（超长、预算耗尽或超时）时的统一出口。
   * @param left 旧行
   * @param right 新行
   * @param leftNumber 旧侧行号
   * @param rightNumber 新侧行号
   * @returns 差异行
   */
  const changedRow = (left: string, right: string, leftNumber: number, rightNumber: number): DiffRow => ({
    kind: 'modified',
    leftNumber,
    rightNumber,
    left,
    right,
    leftSegments: [{ text: left, changed: true }],
    rightSegments: [{ text: right, changed: true }],
  })

  for (let index = 0; index < changes.length; index += 1) {
    const change = changes[index]
    if (change === undefined) continue

    if (change.removed === true) {
      const next = changes[index + 1]
      // 变更块的行数必须先求出来：写在 for 条件里会按迭代次数反复 split 整块，退化成 O(n²)
      const removedLines = linesOf(change.value)
      const addedLines = next?.added === true ? linesOf(next.value) : []
      const paired = Math.min(removedLines.length, addedLines.length)

      for (let offset = 0; offset < paired; offset += 1) {
        const left = leftLines[leftIndex] ?? ''
        const right = rightLines[rightIndex] ?? ''
        leftIndex += 1
        rightIndex += 1

        if (left === right) {
          rows.push({ kind: 'equal', leftNumber: leftIndex, rightNumber: rightIndex, left, right })
          continue
        }

        // 单行超长或预算用尽时跳过字符级比较：整行标改，保住界面响应
        const cost = left.length + right.length
        const overBudget = left.length > MAX_CHAR_DIFF_LINE || right.length > MAX_CHAR_DIFF_LINE || cost > charBudget
        if (overBudget) {
          rows.push(changedRow(left, right, leftIndex, rightIndex))
          continue
        }

        charBudget -= cost
        const chars = chunk.diffChars(left, right)
        rows.push(
          chars === undefined
            ? // 单行比较超时：同样整行标改
              changedRow(left, right, leftIndex, rightIndex)
            : {
                kind: 'modified',
                leftNumber: leftIndex,
                rightNumber: rightIndex,
                left,
                right,
                leftSegments: segmentsOf(chars, 'left'),
                rightSegments: segmentsOf(chars, 'right'),
              },
        )
      }

      for (let offset = paired; offset < removedLines.length; offset += 1) {
        const line = leftLines[leftIndex] ?? ''
        leftIndex += 1
        rows.push({ kind: 'removed', leftNumber: leftIndex, rightNumber: null, left: line, right: '' })
      }

      for (let offset = paired; offset < addedLines.length; offset += 1) {
        const line = rightLines[rightIndex] ?? ''
        rightIndex += 1
        rows.push({ kind: 'added', leftNumber: null, rightNumber: rightIndex, left: '', right: line })
      }

      // 已消费紧随其后的新增块
      if (next?.added === true) index += 1

      continue
    }

    if (change.added === true) {
      const addedLines = linesOf(change.value)

      for (let offset = 0; offset < addedLines.length; offset += 1) {
        const line = rightLines[rightIndex] ?? ''
        rightIndex += 1
        rows.push({ kind: 'added', leftNumber: null, rightNumber: rightIndex, left: '', right: line })
      }

      continue
    }

    const equalLines = linesOf(change.value)

    for (let offset = 0; offset < equalLines.length; offset += 1) {
      const line = leftLines[leftIndex] ?? ''
      leftIndex += 1
      rightIndex += 1
      rows.push({ kind: 'equal', leftNumber: leftIndex, rightNumber: rightIndex, left: line, right: line })
    }
  }

  return rows
}

/**
 * 按行号逐行对齐两侧文本，不做 Myers 对齐。
 *
 * 行级比较超出时间预算时的降级路径：大改动本来就接近整体重写，逐行对齐给出的
 * 结果与精确比对几乎一致，而成本只有 O(行数)，不会让界面失去响应。
 * @param leftLines 旧文本行
 * @param rightLines 新文本行
 * @returns 逐行数据；不产生词级片段
 */
function alignedRows(leftLines: string[], rightLines: string[]): DiffRow[] {
  const rows: DiffRow[] = []
  const total = Math.max(leftLines.length, rightLines.length)

  for (let index = 0; index < total; index += 1) {
    const left = leftLines[index]
    const right = rightLines[index]
    const number = index + 1

    if (left !== undefined && right !== undefined) {
      rows.push(
        left === right
          ? { kind: 'equal', leftNumber: number, rightNumber: number, left, right }
          : {
              kind: 'modified',
              leftNumber: number,
              rightNumber: number,
              left,
              right,
              leftSegments: [{ text: left, changed: true }],
              rightSegments: [{ text: right, changed: true }],
            },
      )

      continue
    }

    if (left !== undefined) {
      rows.push({ kind: 'removed', leftNumber: number, rightNumber: null, left, right: '' })

      continue
    }

    if (right !== undefined) {
      rows.push({ kind: 'added', leftNumber: null, rightNumber: number, left: '', right })
    }
  }

  return rows
}

/**
 * 计算差异行。
 * @param left 旧文本
 * @param right 新文本
 * @param options 忽略空白 / 大小写
 * @returns 逐行数据与是否发生降级
 */
export async function computeDiffRows(left: string, right: string, options: DiffOptions): Promise<DiffResult> {
  const chunk = await loadLazyChunk<DiffKernelChunk>('diff-kernel')
  const leftLines = linesOf(left)
  const rightLines = linesOf(right)

  // 归一化只作用于比较，展示仍用原文；否则面板里会显示被改写过的内容
  const normalize = (line: string): string =>
    options.ignoreCase ? line.toLowerCase() : options.ignoreWhitespace ? line.replace(/[ \t]+/g, ' ') : line
  const changes = chunk.diffLines(leftLines.map(normalize).join('\n'), rightLines.map(normalize).join('\n'))

  // 行级比较超出时间预算：jsdiff 弃权，改按行号对齐。先把内容显示出来，比让面板冻住更可取
  if (changes === undefined) return { rows: alignedRows(leftLines, rightLines), degraded: true }

  return { rows: buildRows(changes, leftLines, rightLines, chunk), degraded: false }
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

/**
 * 折叠未变更片段：只保留每处改动前后的若干行上下文。
 *
 * 折叠只影响渲染，行号仍取各行自带的值，因此跳过的那段在界面上表现为行号跳号，
 * 与 IDEA 折叠后「只看到改动附近」的观感一致。
 * @param rows 逐行数据
 * @param context 改动前后各保留多少行
 * @returns 折叠后的逐行数据
 */
export function collapseUnchanged(rows: DiffRow[], context: number): DiffRow[] {
  if (rows.length === 0) return rows

  return rows.filter((row, index) => {
    if (row.kind !== 'equal') return true

    const from = Math.max(0, index - context)
    const to = Math.min(rows.length - 1, index + context)

    for (let offset = from; offset <= to; offset += 1) {
      if (rows[offset]?.kind !== 'equal') return true
    }

    return false
  })
}
