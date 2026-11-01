/**
 * 三栏合并的文本模型。
 *
 * Git 已经在工作区文件里用冲突标记把三路合并的结果写好了：标记之间的内容就是
 * 「我方块」与「对方块」，标记之外是三栏共有的内容。这里只做解析与布局计算，
 * 不碰界面：冲突列表窗与三栏窗口都从同一份模型取数，冲突块的数量与位置不会出现两个版本。
 *
 * 结果栏按 IDEA 的语义建模：初始是空的（只有行号占位），点箭头才把某一侧内容放进去，
 * 两侧都点则两份内容依次叠进结果——因此每块要分别记录左右两种接受状态，而不是二选一。
 */
/** 行区间：0 起、左闭右开。 */
export interface LineRange {
  /** 起始行。 */
  start: number
  /** 结束行（不含）。 */
  end: number
}

/** 一侧；`ours` 是当前分支，`theirs` 是正在合进来的版本。 */
export type MergeSide = 'ours' | 'theirs'

/** 一个冲突块的接受状态。 */
export interface BlockChoice {
  /** 左侧（我方）内容是否已放进结果。 */
  ours: boolean
  /** 右侧（对方）内容是否已放进结果。 */
  theirs: boolean
  /** 是否已被处理过；没处理过的块计入「未解决」，结果栏里也没有它的内容。 */
  touched: boolean
}

/** 一个冲突块两侧的内容行。 */
export interface ConflictBlock {
  /** 我方内容。 */
  ours: string[]
  /** 对方内容。 */
  theirs: string[]
}

/** 合并结构中的一段：共有文本或冲突块。 */
export type MergeSegment = { kind: 'text'; index: number } | { kind: 'conflict'; index: number }

/** 冲突标记解析结果。 */
export interface MergeModel {
  /** 段的顺序，决定结果文本的拼装顺序。 */
  segments: MergeSegment[]
  /** 冲突块。 */
  blocks: ConflictBlock[]
  /** 共有文本段的内容。 */
  texts: string[][]
  /** 每块在我方文本中的行区间，用于左栏高亮。 */
  oursRanges: LineRange[]
  /** 每块在对方文本中的行区间，用于右栏高亮。 */
  theirsRanges: LineRange[]
  /** 每个共有文本段在我方文本中的行区间。 */
  textRanges: LineRange[]
  /** 我方文本的总行数；结果栏用它决定初始占多少行空行。 */
  oursLineCount: number
}

/** 结果栏的布局。 */
export interface MergeLayout {
  /** 结果行。 */
  lines: string[]
  /** 每块在结果行中的区间。 */
  ranges: LineRange[]
  /** 每个共有文本段在结果行中的区间。 */
  textRanges: LineRange[]
  /** 每块的接受状态。 */
  choices: BlockChoice[]
  /** 共有文本是否已通过「应用非冲突更改」放进结果。 */
  textApplied: boolean
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
 * @returns 段落、冲突块、共有文本与两侧行区间
 */
export function parseMergeModel(text: string): MergeModel {
  const lines = text.split('\n')
  const segments: MergeSegment[] = []
  const blocks: ConflictBlock[] = []
  const texts: string[][] = []
  const oursRanges: LineRange[] = []
  const theirsRanges: LineRange[] = []
  const textRanges: LineRange[] = []
  let pending: string[] = []
  let oursCursor = 0
  let theirsCursor = 0
  let index = 0

  /** 把累积的共有文本落成一个文本段，并记下它在我方文本里的位置。 */
  const flushPending = (): void => {
    if (pending.length === 0) return

    segments.push({ kind: 'text', index: texts.length })
    texts.push(pending)
    textRanges.push({ start: oursCursor - pending.length, end: oursCursor })
    pending = []
  }

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
    flushPending()

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

  flushPending()

  return { segments, blocks, texts, oursRanges, theirsRanges, textRanges, oursLineCount: oursCursor }
}

/**
 * 取一块在指定接受侧下应写入结果的内容行。
 * @param block 冲突块
 * @param side 接受侧
 * @returns 内容行
 */
export function blockContent(block: ConflictBlock, side: MergeSide): string[] {
  return side === 'ours' ? block.ours : block.theirs
}

/**
 * 取一块按当前接受状态应写入结果的内容行。
 *
 * 两侧都接受时按「我方在上、对方在下」拼接，与 IDEA 中先后点两个箭头的效果一致。
 * @param block 冲突块
 * @param choice 接受状态
 * @returns 内容行；两侧都不接受时为空
 */
export function blockText(block: ConflictBlock, choice: BlockChoice): string[] {
  const lines: string[] = []

  if (choice.ours) lines.push(...block.ours)
  if (choice.theirs) lines.push(...block.theirs)

  return lines
}

/**
 * 生成结果栏的初始布局。
 *
 * 与 IDEA 一致：结果栏一开始只有空行占位（行数与我方文本相同），
 * 段与块的区间先按我方文本的位置记下，之后的应用操作都按区间替换。
 * @param model 解析结果
 * @returns 初始布局
 */
export function createLayout(model: MergeModel): MergeLayout {
  const lines: string[] = []

  for (let i = 0; i < model.oursLineCount; i += 1) lines.push('')

  return {
    lines,
    ranges: model.oursRanges.map((range) => ({ ...range })),
    textRanges: model.textRanges.map((range) => ({ ...range })),
    choices: model.blocks.map(() => ({ ours: false, theirs: false, touched: false })),
    textApplied: false,
  }
}

/**
 * 把指定区间替换成新内容，并平移其后所有区间。
 * @param layout 当前布局
 * @param range 被替换的区间
 * @param content 新内容行
 * @param patch 需要一并改写的区间（当前区间自身）
 * @returns 新布局的行与平移后的区间
 */
function replaceRange(
  layout: MergeLayout,
  range: LineRange,
  content: string[],
  patch: 'block' | 'text',
  patchIndex: number,
): { lines: string[]; ranges: LineRange[]; textRanges: LineRange[] } {
  const delta = content.length - (range.end - range.start)
  const lines = [...layout.lines.slice(0, range.start), ...content, ...layout.lines.slice(range.end)]

  /** 区间在替换点之后时整体平移；被替换的那一个改写为新长度。 */
  const shift = (item: LineRange, index: number, kind: 'block' | 'text'): LineRange => {
    if (kind === patch && index === patchIndex) return { start: range.start, end: range.start + content.length }
    if (item.start >= range.end) return { start: item.start + delta, end: item.end + delta }

    return item
  }

  return {
    lines,
    ranges: layout.ranges.map((item, index) => shift(item, index, 'block')),
    textRanges: layout.textRanges.map((item, index) => shift(item, index, 'text')),
  }
}

/**
 * 接受或取消某一块的某一侧。
 * @param model 解析结果
 * @param layout 当前布局
 * @param index 块序号
 * @param side 侧
 * @param applied 是否把该侧内容放进结果
 * @returns 新布局
 */
export function applySide(
  model: MergeModel,
  layout: MergeLayout,
  index: number,
  side: MergeSide,
  applied: boolean,
): MergeLayout {
  const block = model.blocks[index]
  const range = layout.ranges[index]
  const previous = layout.choices[index]

  if (block === undefined || range === undefined || previous === undefined) return layout

  const choice: BlockChoice =
    side === 'ours' ? { ...previous, ours: applied, touched: true } : { ...previous, theirs: applied, touched: true }
  const content = blockText(block, choice)
  const next = replaceRange(layout, range, content, 'block', index)

  return {
    lines: next.lines,
    ranges: next.ranges,
    textRanges: next.textRanges,
    choices: layout.choices.map((item, itemIndex) => (itemIndex === index ? choice : item)),
    textApplied: layout.textApplied,
  }
}

/**
 * 把某一侧的内容应用到全部冲突块（工具条上的「接受全部」）。
 * @param model 解析结果
 * @param layout 当前布局
 * @param side 侧
 * @returns 新布局
 */
export function applyAllBlocks(model: MergeModel, layout: MergeLayout, side: MergeSide): MergeLayout {
  let next = layout

  for (let index = 0; index < model.blocks.length; index += 1) next = applySide(model, next, index, side, true)

  return next
}

/**
 * 应用非冲突更改：把冲突标记之外的共有内容放进结果栏。
 *
 * 三路合并里共有内容两侧一致，因此应用哪一侧结果相同；这里从后往前替换，
 * 免得前面的替换改变后面文本段的位置。
 * @param model 解析结果
 * @param layout 当前布局
 * @returns 新布局
 */
export function applyNonConflicting(model: MergeModel, layout: MergeLayout): MergeLayout {
  if (layout.textApplied) return layout

  let next = layout

  for (let index = model.texts.length - 1; index >= 0; index -= 1) {
    const range = next.textRanges[index]
    const content = model.texts[index]

    if (range === undefined || content === undefined) continue

    const replaced = replaceRange(next, range, content, 'text', index)

    next = { ...next, lines: replaced.lines, ranges: replaced.ranges, textRanges: replaced.textRanges }
  }

  return { ...next, textApplied: true }
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
    const choice = layout.choices[index]
    const target = block === undefined || choice === undefined ? [] : blockText(block, choice)
    const found = findRange(layout.lines, target, cursor)

    if (found !== null) {
      ranges.push(found)
      cursor = found.end

      continue
    }

    ranges.push(previous)
    cursor = Math.max(cursor, previous.end)
  }

  return { ...layout, ranges }
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

/**
 * 按每块的接受状态拼出完整文本。
 *
 * 与 layoutText 的区别：这里总是把共有内容算进去，不看结果栏的当前状态，
 * 供「自动解决简单冲突」这类不需要用户手动拼装的场景使用。
 * @param model 解析结果
 * @param choices 每块的接受状态
 * @returns 完整文本
 */
export function resolvedText(model: MergeModel, choices: BlockChoice[]): string {
  const lines: string[] = []

  for (const segment of model.segments) {
    if (segment.kind === 'text') {
      lines.push(...(model.texts[segment.index] ?? []))

      continue
    }

    const block = model.blocks[segment.index]
    const choice = choices[segment.index]

    if (block !== undefined && choice !== undefined) lines.push(...blockText(block, choice))
  }

  return lines.join('\n')
}

/**
 * 统计还没处理过的冲突块数量。
 * @param layout 布局
 * @returns 未解决块数
 */
export function unresolvedCount(layout: MergeLayout): number {
  return layout.choices.filter((choice) => !choice.touched).length
}
