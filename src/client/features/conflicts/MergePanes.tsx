/**
 * 三栏合并窗口的左右两栏。
 *
 * 版式照 IDEA 的 Merge Revisions：左右两栏的 gutter（行号 + 接受箭头）都靠着中间栏，
 * 左栏的 gutter 在最右、右栏的在最左，于是箭头指的方向就是它会把内容送到哪一边。
 * 冲突块的行底色只铺在代码列上，gutter 保持编辑区底色，与 IDEA 一致。
 */
import React, { useMemo } from 'react'

import { cn } from '../../../common/cn'
import { CodeText } from '../../../common/CodeText'
import type { SyntaxLines } from '../../../common/syntax-highlight'

import { acceptLeftIcon, acceptRightIcon } from './icons'
import type { LineRange, MergeSide } from './merge-model'

/** 单侧栏 props。 */
export interface MergePaneProps {
  /** 这一栏展示哪一侧。 */
  side: 'ours' | 'theirs'
  /** 该侧完整文本行。 */
  lines: string[]
  /** 该侧每个冲突块的行区间。 */
  ranges: LineRange[]
  /** 每块的接受侧；null 表示未解决。 */
  choices: (MergeSide | null)[]
  /** 该侧是否有待接受的语义（左栏出现箭头，右栏出现另一枚）。 */
  onAccept(index: number): void
  /** 语法着色。 */
  syntax: SyntaxLines
  /** 字号（px）。 */
  fontSize: number
  /** 行高（px）。 */
  lineHeight: number
  /** 接受按钮的悬停提示。 */
  acceptTitle: string
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
 * @returns 带行号、接受按钮与冲突块底色的行列表
 */
export function MergePane({
  side,
  lines,
  ranges,
  choices,
  onAccept,
  syntax,
  fontSize,
  lineHeight,
  acceptTitle,
}: MergePaneProps): React.ReactElement {
  const owners = useMemo(() => blockOwnersOf(ranges, lines.length), [lines.length, ranges])

  return (
    <div className="min-w-0 flex-1 overflow-auto font-mono" style={{ fontSize: `${String(fontSize)}px` }}>
      {lines.map((line, lineIndex) => {
        const owner = owners[lineIndex] ?? -1
        const choice = owner >= 0 ? (choices[owner] ?? null) : null
        // 本侧内容是否被采纳：未解决时两侧都不算采纳，保留各自的冲突底色
        const adopted = choice === null ? null : choice === 'both' || choice === side
        const firstLineOfBlock = owner >= 0 && ranges[owner]?.start === lineIndex
        // 未解决：整块铺 IDEA 的冲突底色；被放弃：转成面板灰，让采纳的那一侧更醒目
        const conflicting = owner >= 0 && choice === null
        const dropped = adopted === false

        // 图标槽始终占位：只有块首行有按钮，但槽宽固定，行号才不会因为多出按钮而向右错开
        const iconCell = (
          <span className="flex w-6 shrink-0 select-none items-stretch justify-center">
            {firstLineOfBlock && (
              <button
                type="button"
                title={acceptTitle}
                aria-label={acceptTitle}
                onClick={() => onAccept(owner)}
                className="flex w-6 items-center justify-center self-stretch text-secondary hover:bg-surface2 hover:text-primary"
              >
                {side === 'ours' ? acceptLeftIcon(13) : acceptRightIcon(13)}
              </button>
            )}
          </span>
        )

        // 行号列固定宽度：左栏贴右边缘、右栏贴左边缘，与 IDEA 的 gutter 位置一致
        const numberCell = (
          <span
            className={cn(
              'w-9 shrink-0 select-none text-right',
              side === 'ours' ? 'pr-2' : 'pl-2',
              dropped ? 'text-secondary' : 'text-secondary/70',
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
              conflicting && 'bg-[color:var(--ide-merge-conflict-bg)]',
              dropped && 'bg-surface2',
              dropped ? 'text-secondary' : 'text-primary',
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
