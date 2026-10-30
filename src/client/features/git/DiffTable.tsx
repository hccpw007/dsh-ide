/**
 * Git 差异的表格渲染。
 *
 * 并排与单栏两种布局共用同一份逐行数据；并排表头放在表格内部，横向滚动时
 * 版本标题仍与内容列对齐。折叠段由父组件给出，这里只负责隐藏与展开按钮。
 *
 * 单元格内容交给 `CodeText`：语法着色来自编辑器内核的解析结果，词级改动只是
 * 其中一类标记，两者在同一段文本上叠加。
 */
import React from 'react'

import { cn } from '../../../common/cn'
import { CodeText } from '../../../common/CodeText'
import type { SyntaxLines, SyntaxSpan } from '../../../common/syntax-highlight'

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
  leftSyntax,
  rightSyntax,
  expandLabel,
  linesLabel,
  onExpand,
}: {
  rows: DiffRow[]
  folds: DiffFold[]
  opened: ReadonlySet<number>
  leftSyntax: SyntaxLines
  rightSyntax: SyntaxLines
  expandLabel: string
  linesLabel: string
  onExpand(index: number): void
}): React.ReactElement {
  return (
    <table className="w-full table-auto border-collapse font-mono">
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
                    className="flex w-full items-center gap-2 border-y border-dashed border-line2 bg-code px-2 py-[1px] text-left text-[10px] text-secondary transition-colors hover:bg-surface2 hover:text-primary"
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

          return (
            <DiffTableRow
              key={`row:${String(index)}`}
              row={row}
              index={index}
              leftSpans={row.leftNumber === null ? undefined : leftSyntax[row.leftNumber - 1]}
              rightSpans={row.rightNumber === null ? undefined : rightSyntax[row.rightNumber - 1]}
            />
          )
        })}
      </tbody>
    </table>
  )
}

/** 并排差异的一行。 */
function DiffTableRow({
  row,
  index,
  leftSpans,
  rightSpans,
}: {
  row: DiffRow
  index: number
  leftSpans?: SyntaxSpan[]
  rightSpans?: SyntaxSpan[]
}): React.ReactElement {
  const added = row.kind === 'added'
  const removed = row.kind === 'removed'
  const modified = row.kind === 'modified'

  return (
    // 变更底色只加在内容单元格上：行号列与空白列保持编辑区底色，整行染色会让新增文件看起来糊成一片
    <tr data-row={index}>
      {/* 左边缘的变更标记条 */}
      <td className={cn('p-0', added || modified ? 'bg-success' : removed ? 'bg-danger' : 'bg-transparent')} />

      <td className="select-none whitespace-nowrap border-r border-line1/60 px-2 text-right text-secondary">
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
        <CodeText text={row.left} spans={leftSpans} changes={row.leftSegments} changedClassName="rounded-[2px] bg-danger/40" />
      </td>

      <td className="select-none whitespace-nowrap border-l border-line1/60 px-2 text-right text-secondary">
        {row.rightNumber ?? ''}
      </td>

      <td className={cn('whitespace-pre px-2 text-primary', added && 'bg-success/15', modified && 'bg-success/10')}>
        <CodeText text={row.right} spans={rightSpans} changes={row.rightSegments} changedClassName="rounded-[2px] bg-success/40" />
      </td>
    </tr>
  )
}

/** 行内（单栏）差异表。 */
export function InlineDiff({
  rows,
  folds,
  opened,
  leftSyntax,
  rightSyntax,
  linesLabel,
  onExpand,
}: {
  rows: DiffRow[]
  folds: DiffFold[]
  opened: ReadonlySet<number>
  leftSyntax: SyntaxLines
  rightSyntax: SyntaxLines
  linesLabel: string
  onExpand(index: number): void
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
          const fold = foldAt(index, folds, opened)

          if (fold !== undefined) {
            if (index !== fold.from) return null

            return (
              <tr key={`fold:${String(fold.from)}`}>
                <td colSpan={4} className="p-0">
                  <button
                    type="button"
                    onClick={() => onExpand(fold.from)}
                    className="flex w-full items-center gap-2 border-y border-dashed border-line2 bg-code px-2 py-[1px] text-left text-[10px] text-secondary transition-colors hover:bg-surface2 hover:text-primary"
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
