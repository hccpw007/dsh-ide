/**
 * 三栏合并窗口的左右两栏。
 *
 * 版式照 IDEA 的 Merge Revisions：两栏的 gutter（行号 + 操作图标）都靠着中间栏，
 * 左栏在最右、右栏在最左，箭头指向中间——按箭头就是把这一侧的代码送进结果。
 * 箭头旁边的叉表示「这一侧不要」：点了之后该块不再包含这一侧的内容。
 *
 * 行底色也按 IDEA 分三种状态：还没处理的块两侧标冲突色；已放进结果的一侧恢复常态；
 * 被叉掉的一侧转灰，一眼能看出这块最终保留了哪边。
 */
import React, { useMemo } from 'react'

import { cn } from '../../../common/cn'
import { CodeText } from '../../../common/CodeText'
import type { SyntaxLines } from '../../../common/syntax-highlight'

import { acceptLeftIcon, acceptRightIcon, ignoreIcon } from './icons'
import type { BlockChoice, LineRange } from './merge-model'

/** 单侧栏 props。 */
export interface MergePaneProps {
  /** 这一栏展示哪一侧。 */
  side: 'ours' | 'theirs'
  /** 该侧完整文本行。 */
  lines: string[]
  /** 该侧每个冲突块的行区间。 */
  ranges: LineRange[]
  /** 每块的接受状态。 */
  choices: BlockChoice[]
  /** 把该块这一侧的内容放进结果。 */
  onAccept(index: number): void
  /** 不要这一侧的内容。 */
  onIgnore(index: number): void
  /** 语法着色。 */
  syntax: SyntaxLines
  /** 字号（px）。 */
  fontSize: number
  /** 行高（px）。 */
  lineHeight: number
  /** 接受箭头与叉的悬停提示。 */
  acceptTitle: string
  /** 叉的悬停提示。 */
  ignoreTitle: string
  /** 滚动容器的挂载回调；三栏联动滚动要用它。 */
  scrollRef?: React.RefCallback<HTMLDivElement>
  /** 滚动时通知外壳，外壳据此同步另外两栏。 */
  onScroll?(event: React.UIEvent<HTMLDivElement>): void
}

/**
 * 计算每一行所属的冲突块序号。
 * @param ranges 块区间
 * @param lineCount 行数
 * @returns 行 → 块序号；不在任何块内时为 -1
 */
function blockOwnersOf(ranges: LineRange[], lineCount: number): Int32Array {
  const owners = new Int32Array(lineCount).fill(-1)

  ranges.forEach((range, index) => {
    for (let line = range.start; line < Math.min(range.end, lineCount); line += 1) owners[line] = index
  })

  return owners
}

/**
 * 渲染单侧栏。
 * @param props 见 MergePaneProps
 * @returns 带行号、接受/忽略按钮与状态底色的行列表
 */
export function MergePane({
  side,
  lines,
  ranges,
  choices,
  onAccept,
  onIgnore,
  syntax,
  fontSize,
  lineHeight,
  acceptTitle,
  ignoreTitle,
  scrollRef,
  onScroll,
}: MergePaneProps): React.ReactElement {
  const owners = useMemo(() => blockOwnersOf(ranges, lines.length), [lines.length, ranges])

  return (
    <div ref={scrollRef} onScroll={onScroll} className="min-w-0 flex-1 overflow-auto font-mono" style={{ fontSize: `${String(fontSize)}px` }}>
      {lines.map((line, lineIndex) => {
        const owner = owners[lineIndex] ?? -1
        const choice = owner >= 0 ? choices[owner] : undefined
        const firstLineOfBlock = owner >= 0 && ranges[owner]?.start === lineIndex
        const lastLineOfBlock = owner >= 0 && ranges[owner]?.end === lineIndex + 1
        // 这一侧的内容没被采用（还没处理，或者被叉掉了）：保持冲突底色，
        // 叉掉等于把这块还原，不能变成「已解决」的灰底
        const conflicting = choice !== undefined && !choice[side]

        // 接受箭头：把这一侧的内容放进结果栏
        const acceptButton = firstLineOfBlock ? (
          <button
            type="button"
            title={acceptTitle}
            aria-label={acceptTitle}
            onClick={() => onAccept(owner)}
            className="flex w-6 items-center justify-center self-stretch text-secondary hover:bg-surface2 hover:text-primary"
          >
            {side === 'ours' ? acceptLeftIcon(13) : acceptRightIcon(13)}
          </button>
        ) : null

        // 叉：这一侧的内容不要
        const ignoreButton = firstLineOfBlock ? (
          <button
            type="button"
            title={ignoreTitle}
            aria-label={ignoreTitle}
            onClick={() => onIgnore(owner)}
            className="flex w-6 items-center justify-center self-stretch text-secondary hover:bg-surface2 hover:text-primary"
          >
            {ignoreIcon(13)}
          </button>
        ) : null

        // 图标槽始终占满两个按钮的宽度：只有块首行有按钮，槽宽固定，行号才不会错位
        const iconCell = (
          <span className="flex w-12 shrink-0 select-none items-stretch justify-center">
            {side === 'ours' ? (
              <>
                {ignoreButton}
                {acceptButton}
              </>
            ) : (
              <>
                {acceptButton}
                {ignoreButton}
              </>
            )}
          </span>
        )

        // 行号列固定宽度：左栏贴右边缘、右栏贴左边缘，与 IDEA 的 gutter 位置一致
        const numberCell = (
          <span
            className={cn(
              'w-9 shrink-0 select-none text-right',
              side === 'ours' ? 'pr-2' : 'pl-2',
              'text-secondary/70',
            )}
          >
            {lineIndex + 1}
          </span>
        )

        // 代码列：底色只铺在这一列，行号与图标列保持编辑区底色
        const codeCell = (
          <span
            className={cn(
              'min-w-0 flex-1 self-stretch whitespace-pre px-2',
              // 冲突块始终带虚线框：内容移走之后框也留着，用来标出这块冲突在原文里的位置
              // （中间行只有左右两边，首尾行补横边）
              owner >= 0 && 'merge-block',
              owner >= 0 && firstLineOfBlock && 'merge-block-top',
              owner >= 0 && lastLineOfBlock && 'merge-block-bottom',
              conflicting && 'bg-[color:var(--ide-merge-conflict-bg)]',
              'text-primary',
            )}
          >
            <CodeText text={line} spans={syntax[lineIndex]} />
          </span>
        )

        return (
          <div
            key={`${side}:${String(lineIndex)}`}
            className="flex items-stretch"
            style={{ minHeight: `${String(lineHeight)}px`, lineHeight: `${String(lineHeight)}px` }}
          >
            {side === 'ours' ? (
              <>
                {codeCell}
                {iconCell}
                {numberCell}
              </>
            ) : (
              <>
                {numberCell}
                {iconCell}
                {codeCell}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
