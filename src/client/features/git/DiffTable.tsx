/**
 * Git 差异的表格渲染。
 *
 * 并排与单栏两种布局共用同一份逐行数据；并排表头放在表格内部，横向滚动时
 * 版本标题仍与内容列对齐。折叠段由父组件给出，这里只负责隐藏与展开按钮。
 */
import React from 'react'

import { cn } from '../../../common/cn'

import type { DiffFold, DiffRow } from './diff-model'

/**
 * 判断某行是否落在尚未展开的折叠段里。
 * @param index 行下标
 * @param folds 折叠段
 * @param opened 已展开的折叠段起始下标
 * @returns 命中的折叠段
 */
function foldAt(index: number, folds: DiffFold[], opened: ReadonlySet<number>): DiffFold | undefined {
  return folds.find((fold) => index >= fold.from && index < fold.from + fold.count && !opened.has(fold.from))
}

/** 并排差异表。 */
export function DiffTable({
  rows,
  folds,
  opened,
  expandLabel,
  linesLabel,
  onExpand,
}: {
  rows: DiffRow[]
  folds: DiffFold[]
  opened: ReadonlySet<number>
  expandLabel: string
  linesLabel: string
  onExpand(index: number): void
}): React.ReactElement {
  return (
    <table className="w-full table-auto border-collapse font-mono text-[12px] leading-[19px]">
      <colgroup>
        <col style={{ width: 3 }} />
        <col style={{ width: 44 }} />
        <col style={{ width: 'calc(50% - 45.5px)' }} />
        <col style={{ width: 44 }} />
        <col style={{ width: 'calc(50% - 45.5px)' }} />
      </colgroup>

      <tbody>
        {rows.map((row, index) => {
          const fold = foldAt(index, folds, opened)

          if (fold !== undefined) {
            if (index !== fold.from) return null

            return (
              <tr key={`fold:${String(fold.from)}`}>
                <td colSpan={5} className="p-0">
                  {/* 折叠段上下文提示：虚线边 + 行数，展开后回到普通行，与 IDEA 一致 */}
                  <button
                    type="button"
                    onClick={() => onExpand(fold.from)}
                    className="flex w-full items-center gap-2 border-y border-dashed border-line2 bg-surface1 px-2 py-[1px] text-left text-[10px] text-secondary transition-colors hover:bg-surface2 hover:text-primary"
                    title={`${expandLabel} ${String(fold.count)}`}
                  >
                    <span className="text-info">»</span>
                    <span>
                      {fold.count} {linesLabel}
                    </span>
                  </button>
                </td>
              </tr>
            )
          }

          return <DiffTableRow key={`row:${String(index)}`} row={row} index={index} />
        })}
      </tbody>
    </table>
  )
}

/** 并排差异的一行。 */
function DiffTableRow({ row, index }: { row: DiffRow; index: number }): React.ReactElement {
  const added = row.kind === 'added'
  const removed = row.kind === 'removed'
  const modified = row.kind === 'modified'

  return (
    <tr data-row={index} className={cn(added && 'bg-success/15', removed && 'bg-danger/15')}>
      {/* 左边缘的变更标记条 */}
      <td className={cn('p-0', added || modified ? 'bg-success' : removed ? 'bg-danger' : 'bg-transparent')} />

      <td className="select-none whitespace-nowrap border-r border-line1/60 bg-surface1/40 px-2 text-right text-[11px] text-secondary">
        {row.leftNumber ?? ''}
      </td>

      <td
        className={cn(
          'whitespace-pre px-2 text-primary',
          removed && 'bg-danger/15',
          modified && 'bg-danger/5',
          (added || modified) && 'border-r border-line1',
        )}
      >
        {modified && row.leftSegments !== undefined ? <Segments segments={row.leftSegments} tone="removed" /> : row.left}
      </td>

      <td className="select-none whitespace-nowrap border-l border-line1/60 bg-surface1/40 px-2 text-right text-[11px] text-secondary">
        {row.rightNumber ?? ''}
      </td>

      <td className={cn('whitespace-pre px-2 text-primary', added && 'bg-success/15', modified && 'bg-success/10')}>
        {modified && row.rightSegments !== undefined ? <Segments segments={row.rightSegments} tone="added" /> : row.right}
      </td>
    </tr>
  )
}

/** 词级高亮片段。 */
function Segments({
  segments,
  tone,
}: {
  segments: { text: string; changed: boolean }[]
  tone: 'added' | 'removed'
}): React.ReactElement {
  return (
    <>
      {segments.map((segment, index) =>
        segment.changed ? (
          <span
            key={`segment:${String(index)}`}
            className={cn('rounded-[2px]', tone === 'added' ? 'bg-success/40' : 'bg-danger/40')}
          >
            {segment.text}
          </span>
        ) : (
          <React.Fragment key={`segment:${String(index)}`}>{segment.text}</React.Fragment>
        ),
      )}
    </>
  )
}

/** 行内（单栏）差异表。 */
export function InlineDiff({
  rows,
  folds,
  opened,
  linesLabel,
  onExpand,
}: {
  rows: DiffRow[]
  folds: DiffFold[]
  opened: ReadonlySet<number>
  linesLabel: string
  onExpand(index: number): void
}): React.ReactElement {
  return (
    <table className="w-full table-auto border-collapse font-mono text-[12px] leading-[19px]">
      <colgroup>
        <col style={{ width: 3 }} />
        <col style={{ width: 42 }} />
        <col style={{ width: 18 }} />
        <col />
      </colgroup>

      <tbody>
        {rows.map((row, index) => {
          const fold = foldAt(index, folds, opened)

          if (fold !== undefined) {
            if (index !== fold.from) return null

            return (
              <tr key={`fold:${String(fold.from)}`}>
                <td colSpan={4} className="p-0">
                  <button
                    type="button"
                    onClick={() => onExpand(fold.from)}
                    className="flex w-full items-center gap-2 border-y border-dashed border-line2 bg-surface1 px-2 py-[1px] text-left text-[10px] text-secondary transition-colors hover:bg-surface2 hover:text-primary"
                  >
                    <span className="text-info">»</span>
                    <span>
                      {fold.count} {linesLabel}
                    </span>
                  </button>
                </td>
              </tr>
            )
          }

          const number = row.rightNumber ?? row.leftNumber
          const content = row.rightNumber === null ? row.left : row.right
          const tone =
            row.kind === 'added'
              ? 'bg-success/15'
              : row.kind === 'removed'
                ? 'bg-danger/15'
                : row.kind === 'modified'
                  ? 'bg-success/10'
                  : ''
          const sign = row.kind === 'added' ? '+' : row.kind === 'removed' ? '−' : ' '

          return (
            <tr key={`inline:${String(index)}`}>
              <td
                className={cn(
                  'p-0',
                  row.kind === 'added' ? 'bg-success' : row.kind === 'removed' ? 'bg-danger' : 'bg-transparent',
                )}
              />
              <td className="select-none border-r border-line1/60 bg-surface1/40 px-2 text-right text-[11px] text-secondary">
                {number ?? ''}
              </td>
              <td
                className={cn(
                  'select-none text-center text-[11px]',
                  row.kind === 'added' ? 'text-success' : row.kind === 'removed' ? 'text-danger' : 'text-secondary',
                )}
              >
                {sign}
              </td>
              <td className={cn('whitespace-pre px-2 text-primary', tone)}>
                {row.kind === 'modified' && row.rightSegments !== undefined ? (
                  <Segments segments={row.rightSegments} tone="added" />
                ) : (
                  content
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
