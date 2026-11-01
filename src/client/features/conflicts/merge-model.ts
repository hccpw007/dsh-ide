/**
 * 三栏合并的文本模型。
 *
 * Git 已经在工作区文件里用冲突标记把三路合并的结果写好了：标记之间的内容就是
 * 「我方块」与「对方块」，标记之外是三栏共有的内容。这里只做解析与布局计算，
 * 不碰界面：列表窗与三栏窗口都从同一份模型取数，冲突块的数量与位置不会出现两个版本。
 */

/** 一个冲突块的接受侧；`both` 表示两侧内容都保留。 */
export type MergeSide = 'ours' | 'theirs' | 'both'

/** 行区间：0 起、左闭右开。 */
export interface LineRange {
  /** 起始行。 */
  start: number
  /** 结束行（不含）。 */
  end: number
}

/** 一个冲突块两侧的内容行。 */
export interface ConflictBlock {
  /** 我方内容。 */
  ours: string[]
  /** 对方内容。 */
  theirs: string[]
}

/** 合并结构中的一段。 */
export type MergeSegment =
  | { kind: 'text'; lines: string[] }
  | { kind: 'conflict'; index: number }

/** 冲突标记解析结果。 */
export interface MergeModel {
  /** 段的顺序，决定结果文本的拼装顺序。 */
  segments: MergeSegment[]
  /** 冲突块。 */
  blocks: ConflictBlock[]
  /** 每块在我方文件中的行区间，用于左栏高亮。 */
  oursRanges: LineRange[]
  /** 每块在对方文件中的行区间，用于右栏高亮。 */
  theirsRanges: LineRange[]
}

/** 结果栏的布局。 */
export interface MergeLayout {
  /** 结果行。 */
  lines: string[]
  /** 每块在结果行中的区间。 */
  ranges: LineRange[]
  /** 每块的接受侧；null 表示还没做过选择。 */
  choices: (MergeSide | null)[]
}

/**
 * 判断一行是不是冲突标记。
 * @param line 行文本
 * @param marker 标记前缀
 * @returns 是否以该标记开头
 */
function isMarker(line: string, marker: string): boolean {
  return line.startsWith(marker)
}

/**
 * 解析工作区文件里的冲突标记。
 *
 * 支持普通二路标记（`<<<<<<<` / `=======` / `>>>>>>>`）与 diff3 的三路标记：
 * 后者多出一段 `|||||||` 基线，基线不属于任何一侧，解析时跳过。
 * @param text 工作区文件内容
 * @returns 段落、冲突块与两侧行区间
 */
export function parseMergeModel(text: string): MergeModel {
  const lines = text.split('\n')
  const segments: MergeSegment[] = []
  const blocks: ConflictBlock[] = []
  const oursRanges: LineRange[] = []
  const theirsRanges: LineRange[] = []
  let pending: string[] = []
  let oursCursor = 0
  let theirsCursor = 0
  let index = 0

  while (index < lines.length) {
    const line = lines[index] ?? ''

    if (!isMarker(line, '<<<<<<<')) {
      pending.push(line)
      oursCursor += 1
      theirsCursor += 1
      index += 1

      continue
    }

    // 冲突块之前的共有内容先落成一段，保证结果文本的拼装顺序与原文一致
    if (pending.length > 0) {
      segments.push({ kind: 'text', lines: pending })
      pending = []
    }

    const oursStart = oursCursor
    const theirsStart = theirsCursor
    const ours: string[] = []
    const theirs: string[] = []
    index += 1

    while (index < lines.length && !isMarker(lines[index] ?? '', '=======')) {
      // diff3 的基线段：整段跳过，它不是任何一侧的内容
      if (isMarker(lines[index] ?? '', '|||||||')) {
        while (index < lines.length && !isMarker(lines[index] ?? '', '=======')) index += 1

        continue
      }

      ours.push(lines[index] ?? '')
      index += 1
    }

    // 跳过 `=======` 分隔行
    index += 1

    while (index < lines.length && !isMarker(lines[index] ?? '', '>>>>>>>')) {
      theirs.push(lines[index] ?? '')
      index += 1
    }

    // 跳过 `>>>>>>>` 结束行
    index += 1

    oursRanges.push({ start: oursStart, end: oursStart + ours.length })
    theirsRanges.push({ start: theirsStart, end: theirsStart + theirs.length })
    blocks.push({ ours, theirs })
    segments.push({ kind: 'conflict', index: blocks.length - 1 })
    oursCursor += ours.length
    theirsCursor += theirs.length
  }

  if (pending.length > 0) segments.push({ kind: 'text', lines: pending })

  return { segments, blocks, oursRanges, theirsRanges }
}

/**
 * 取一块在指定接受侧下应写入结果的内容行。
 * @param block 冲突块
 * @param side 接受侧
 * @returns 内容行
 */
export function blockContent(block: ConflictBlock, side: MergeSide): string[] {
  if (side === 'ours') return block.ours
  if (side === 'theirs') return block.theirs

  // 两侧都要：按我方在上、对方在下的顺序拼接，与 IDEA 的 Accept Both 一致
  return [...block.ours, ...block.theirs]
}

/**
 * 生成结果栏的初始布局。
 *
 * 未解决的块先按我方内容占位：中间栏直接显示可编辑文本，用户能立刻看到结果长什么样，
 * 再逐块换成对方或双方内容。选择状态另存在 `choices` 里，左右栏据此画未解决标记。
 * @param model 解析结果
 * @returns 初始布局
 */
export function createLayout(model: MergeModel): MergeLayout {
  const lines: string[] = []
  const ranges: LineRange[] = []

  for (const segment of model.segments) {
    if (segment.kind === 'text') {
      lines.push(...segment.lines)

      continue
    }

    const block = model.blocks[segment.index]
    if (block === undefined) continue

    const start = lines.length
    lines.push(...block.ours)
    ranges.push({ start, end: lines.length })
  }

  return { lines, ranges, choices: model.blocks.map(() => null) }
}

/**
 * 对某一块做出接受选择。
 *
 * 结果行按块区间替换，其后所有块的区间随行数差值平移——这样连续接受多块时，
 * 后面块的位置始终有效，不需要每次重新在全文里搜索。
 * @param model 解析结果
 * @param layout 当前布局
 * @param index 块序号
 * @param side 接受侧
 * @returns 新布局
 */
export function applyChoice(model: MergeModel, layout: MergeLayout, index: number, side: MergeSide): MergeLayout {
  const block = model.blocks[index]
  const range = layout.ranges[index]

  if (block === undefined || range === undefined) return layout

  const content = blockContent(block, side)
  const delta = content.length - (range.end - range.start)
  const lines = [...layout.lines.slice(0, range.start), ...content, ...layout.lines.slice(range.end)]
  const ranges = layout.ranges.map((item, itemIndex) => {
    if (itemIndex === index) return { start: range.start, end: range.start + content.length }

    // 当前块之后的区间整体平移；之前的区间不受影响
    return item.start >= range.end ? { start: item.start + delta, end: item.end + delta } : item
  })
  const choices = layout.choices.map((item, itemIndex) => (itemIndex === index ? side : item))

  return { lines, ranges, choices }
}

/**
 * 在结果行里找一段连续行首次出现的位置。
 * @param lines 结果行
 * @param target 待查找的行序列
 * @param from 起始搜索位置
 * @returns 找到的区间；找不到或目标为空时返回 null
 */
function findRange(lines: string[], target: string[], from: number): LineRange | null {
  if (target.length === 0) return null

  const last = lines.length - target.length

  for (let start = Math.max(from, 0); start <= last; start += 1) {
    let matched = true

    for (let offset = 0; offset < target.length; offset += 1) {
      if (lines[start + offset] !== target[offset]) {
        matched = false
        break
      }
    }

    if (matched) return { start, end: start + target.length }
  }

  return null
}

/**
 * 用户在结果栏里手动编辑后，重新对齐各块的区间。
 *
 * 手改会改变行数，之前记录的区间随之失效。这里按「每块当前内容在结果里出现的位置」
 * 重新定位；被手工改过的块找不到锚点，保留原区间，接受操作仍会替换那段位置。
 * @param model 解析结果
 * @param layout 当前布局
 * @returns 区间修正后的布局
 */
export function relocateLayout(model: MergeModel, layout: MergeLayout): MergeLayout {
  const ranges: LineRange[] = []
  let cursor = 0

  for (let index = 0; index < model.blocks.length; index += 1) {
    const block = model.blocks[index]
    const previous = layout.ranges[index] ?? { start: cursor, end: cursor }
    const choice = layout.choices[index] ?? null
    const found = block === undefined ? null : findRange(layout.lines, choice === null ? block.ours : blockContent(block, choice), cursor)

    if (found !== null) {
      ranges.push(found)
      cursor = found.end

      continue
    }

    ranges.push(previous)
    cursor = Math.max(cursor, previous.end)
  }

  return { lines: layout.lines, ranges, choices: layout.choices }
}

/**
 * 判断一块是否属于「简单冲突」。
 *
 * 简单冲突指不需要人来判断语义的情况：只有一侧有内容，或两侧内容除空白外完全一致。
 * `Resolve All Simple Conflicts` 只处理这些块，真正的语义冲突仍然留给用户。
 * @param block 冲突块
 * @returns 可以直接采用的接受侧；需要人工判断时返回 null
 */
export function simpleChoice(block: ConflictBlock): MergeSide | null {
  const ours = block.ours.join('\n').trim()
  const theirs = block.theirs.join('\n').trim()

  if (ours === '' && theirs === '') return 'ours'
  if (ours === '') return 'theirs'
  if (theirs === '') return 'ours'
  if (ours === theirs) return 'ours'
  // 只差空白：取我方，内容语义一致
  if (ours.replace(/\s+/g, ' ') === theirs.replace(/\s+/g, ' ')) return 'ours'

  return null
}

/**
 * 把结果行拼回文本。
 * @param layout 布局
 * @returns 结果文本
 */
export function layoutText(layout: MergeLayout): string {
  return layout.lines.join('\n')
}
