/**
 * 三栏合并窗口的左右两栏。
 *
 * 两栏都渲染完整的单侧文件（行号 + 单侧内容），冲突块用底色标出：未解决的块在
 * 我方一片蓝、在对方一片绿，已经被放弃的一侧转灰。每块首行右侧有一个接受按钮，
 * 点击即把该块换成这一侧的内容——逐块取舍的唯一入口。
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
 * @returns 带行号与冲突块高亮的行列表
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
        // 本侧内容是否被采纳：未解决时两侧都不算采纳，保留各自的提示色
        const adopted = choice === null ? null : choice === 'both' || choice === side
        const firstLineOfBlock = owner >= 0 && ranges[owner]?.start === lineIndex

        return (
          <div
            key={`${side}:${String(lineIndex)}`}
            className={cn(
              'flex items-start',
              owner < 0 && 'bg-transparent',
              owner >= 0 && choice === null && (side === 'ours' ? 'bg-info/15' : 'bg-success/15'),
              owner >= 0 && adopted === true && 'bg-transparent',
              owner >= 0 && adopted === false && 'bg-surface2',
            )}
            style={{ minHeight: `${String(lineHeight)}px`, lineHeight: `${String(lineHeight)}px` }}
          >
            {firstLineOfBlock && (
              <button
                type="button"
                title={acceptTitle}
                aria-label={acceptTitle}
                onClick={() => onAccept(owner)}
                className={cn(
                  'flex w-7 shrink-0 items-center justify-center self-stretch text-secondary hover:bg-surface2 hover:text-primary',
                  side === 'ours' ? 'order-last' : 'order-first',
                )}
              >
                {side === 'ours' ? acceptLeftIcon(13) : acceptRightIcon(13)}
              </button>
            )}

            <span
              className={cn(
                'w-11 shrink-0 select-none pr-2 text-right',
                owner >= 0 && adopted === false ? 'text-secondary' : 'text-secondary/70',
              )}
            >
              {lineIndex + 1}
            </span>

            <span
              className={cn(
                'min-w-0 flex-1 whitespace-pre pr-2',
                owner >= 0 && adopted === false ? 'text-secondary' : 'text-primary',
              )}
            >
              <CodeText text={line} spans={syntax[lineIndex]} />
            </span>
          </div>
        )
      })}
    </div>
  )
}
