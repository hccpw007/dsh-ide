/**
 * Git 差异的表格渲染。
 *
 * 并排与单栏两种布局共用同一份逐行数据。并排模式由左右两栏各自横向滚动，
 * 单栏模式交给外层容器统一滚动。差异正文始终逐行全量显示，不做上下文折叠。
 *
 * 单元格内容交给 `CodeText`：语法着色来自编辑器内核的解析结果，词级改动只是
 * 其中一类标记，两者在同一段文本上叠加。
 */
import React from 'react'

import { cn } from '../../../common/cn'
import { CodeText } from '../../../common/CodeText'
import type { SyntaxLines } from '../../../common/syntax-highlight'

import type { DiffRow } from './diff-model'

/**
 * 并排差异表。
 *
 * 左右两栏各占一半宽度，横向滚动留在各自栏内：整表横向滚动会把另一侧推出
 * 视口，就没法并排对照了。两栏行数相同，垂直滚动按 scrollTop 直接对齐。
 */
export function DiffTable({
  rows,
  leftSyntax,
  rightSyntax,
  rowHeight,
  leftRef,
  rightRef,
}: {
  rows: DiffRow[]
  leftSyntax: SyntaxLines
  rightSyntax: SyntaxLines
  rowHeight: number
  leftRef: React.RefObject<HTMLDivElement>
  rightRef: React.RefObject<HTMLDivElement>
}): React.ReactElement {
  /** 正在同步滚动：两栏互写 scrollTop 时短暂上锁，避免来回推动。 */
  const syncing = React.useRef(false)

  /**
   * 把一栏的垂直位置同步到另一栏。
   * @param source 触发滚动的栏
   * @returns 该栏的 scroll 处理函数
   */
  const syncScroll = (source: 'left' | 'right') => (): void => {
    if (syncing.current) return

    const from = source === 'left' ? leftRef.current : rightRef.current
    const to = source === 'left' ? rightRef.current : leftRef.current
    if (from === null || to === null) return

    syncing.current = true
    to.scrollTop = from.scrollTop
    // 写 scrollTop 会再派发一次 scroll 事件，下一帧才解锁，两栏才不会互相推动
    window.requestAnimationFrame(() => {
      syncing.current = false
    })
  }

  return (
    <div className="flex h-full min-h-0 w-full">
      <div ref={leftRef} onScroll={syncScroll('left')} className="min-w-0 flex-1 overflow-auto overscroll-contain pb-2">
        <DiffPane side="left" rows={rows} syntax={leftSyntax} rowHeight={rowHeight} />
      </div>

      {/* 两栏之间的分隔线：各自滚动后仍要能看出左右对照关系 */}
      <div
        ref={rightRef}
        onScroll={syncScroll('right')}
        className="min-w-0 flex-1 overflow-auto overscroll-contain border-l border-line1 pb-2"
      >
        <DiffPane side="right" rows={rows} syntax={rightSyntax} rowHeight={rowHeight} />
      </div>
    </div>
  )
}

/** 并排差异的一栏：行号与内容在同一栏内横向滚动。 */
function DiffPane({
  side,
  rows,
  syntax,
  rowHeight,
}: {
  side: 'left' | 'right'
  rows: DiffRow[]
  syntax: SyntaxLines
  rowHeight: number
}): React.ReactElement {
  return (
    // min-w-full：内容窄时表格仍铺满本栏，内容宽时由本栏横向滚动
    <table className="min-w-full table-auto border-collapse font-mono">
      <colgroup>
        <col style={{ width: 3 }} />
        <col style={{ width: 44 }} />
        <col />
      </colgroup>

      <tbody>
        {rows.map((row, index) => {
          const added = row.kind === 'added'
          const removed = row.kind === 'removed'
          const modified = row.kind === 'modified'
          const number = side === 'left' ? row.leftNumber : row.rightNumber
          const content = side === 'left' ? row.left : row.right
          const spans = number === null ? undefined : syntax[number - 1]

          return (
            // height 是行高下限：两侧行数相同，空行也必须占同样高度，
            // 否则两栏累计高度不同，垂直滚动同步会逐步错位
            <tr key={`${side}:${String(index)}`} data-row={index} style={{ height: `${String(rowHeight)}px` }}>
              {/* 左边缘的变更标记条 */}
              <td className={cn('p-0', added || modified ? 'bg-success' : removed ? 'bg-danger' : 'bg-transparent')} />

              <td className="select-none whitespace-nowrap border-r border-line1/60 px-2 text-right text-secondary">
                {number ?? ''}
              </td>

              {side === 'left' ? (
                // 变更底色只加在内容单元格上：行号列与空白列保持编辑区底色，整行染色会让新增文件看起来糊成一片
                <td className={cn('whitespace-pre px-2 text-primary', removed && 'bg-danger/15', modified && 'bg-danger/5')}>
                  {content === '' ? (
                    <EmptyCell />
                  ) : (
                    <CodeText
                      text={content}
                      spans={spans}
                      changes={row.leftSegments}
                      changedClassName="rounded-[2px] bg-danger/40"
                    />
                  )}
                </td>
              ) : (
                <td className={cn('whitespace-pre px-2 text-primary', added && 'bg-success/15', modified && 'bg-success/10')}>
                  {content === '' ? (
                    <EmptyCell />
                  ) : (
                    <CodeText
                      text={content}
                      spans={spans}
                      changes={row.rightSegments}
                      changedClassName="rounded-[2px] bg-success/40"
                    />
                  )}
                </td>
              )}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/**
 * 空行的行盒占位。
 *
 * 完全空白的单元格不生成行盒，会比另一侧同序号的行矮一截；两栏累计高度随即
 * 错位，垂直滚动同步就对不上了。零宽字符只撑出行高，肉眼不可见。
 */
function EmptyCell(): React.ReactElement {
  return (
    <span aria-hidden="true" className="select-none">
      {'\u200B'}
    </span>
  )
}

/** 行内（单栏）差异表。 */
export function InlineDiff({
  rows,
  leftSyntax,
  rightSyntax,
}: {
  rows: DiffRow[]
  leftSyntax: SyntaxLines
  rightSyntax: SyntaxLines
}): React.ReactElement {
  return (
    <table className="w-full table-auto border-collapse font-mono">
      <colgroup>
        <col style={{ width: 3 }} />
        <col style={{ width: 42 }} />
        <col style={{ width: 18 }} />
        <col />
      </colgroup>

      <tbody>
        {rows.map((row, index) => {
          const number = row.rightNumber ?? row.leftNumber
          const content = row.rightNumber === null ? row.left : row.right
          const spans =
            row.rightNumber === null
              ? row.leftNumber === null
                ? undefined
                : leftSyntax[row.leftNumber - 1]
              : rightSyntax[row.rightNumber - 1]
          const tone =
            row.kind === 'added'
              ? 'bg-success/15'
              : row.kind === 'removed'
                ? 'bg-danger/15'
                : row.kind === 'modified'
                  ? 'bg-success/10'
                  : ''
          const sign = row.kind === 'added' ? '+' : row.kind === 'removed' ? '−' : ' '

          // 单栏布局同样要能跳到上一处/下一处：差异块导航靠 data-row 定位目标行
          return (
            <tr key={`inline:${String(index)}`} data-row={index}>
              <td
                className={cn(
                  'p-0',
                  row.kind === 'added' ? 'bg-success' : row.kind === 'removed' ? 'bg-danger' : 'bg-transparent',
                )}
              />
              <td className="select-none border-r border-line1/60 px-2 text-right text-secondary">
                {number ?? ''}
              </td>
              <td
                className={cn(
                  'select-none text-center',
                  row.kind === 'added' ? 'text-success' : row.kind === 'removed' ? 'text-danger' : 'text-secondary',
                )}
              >
                {sign}
              </td>
              <td className={cn('whitespace-pre px-2 text-primary', tone)}>
                <CodeText
                  text={content}
                  spans={spans}
                  changes={row.kind === 'modified' ? row.rightSegments : undefined}
                  changedClassName="rounded-[2px] bg-success/40"
                />
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
