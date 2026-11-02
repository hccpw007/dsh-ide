/**
 * Git 差异的表格渲染。
 *
 * 并排与单栏两种布局共用同一份逐行数据。并排模式由左右两栏各自横向滚动，
 * 单栏模式交给外层容器统一滚动。
 *
 * 正文按固定行高做虚拟滚动：只挂载可视区上下各一段的行，未渲染部分用等高的
 * 占位行撑出滚动条。几万行的差异因此既能完整滚动浏览，又不会一次挂出数万节点。
 *
 * 单元格内容交给 `CodeText`：语法着色来自编辑器内核的解析结果，词级改动只是
 * 其中一类标记，两者在同一段文本上叠加。
 */
import React, { useEffect, useMemo, useState } from 'react'

import { cn } from '../../../common/cn'
import { CodeText } from '../../../common/CodeText'
import type { SyntaxLines } from '../../../common/syntax-highlight'

import type { DiffRow } from './diff-model'

/** 回声判定窗口（毫秒）：写入另一栏后这段时间内，该栏的 scroll 事件视为回声。 */
const ECHO_WINDOW_MS = 150

/** 可视区外额外渲染的行数：快速拖动滚动条时留出缓冲，不露出空白。 */
const OVERSCAN_ROWS = 12

/** 首帧渲染的行数：此时还没测到视口高度，先给一段足以盖住常见面板高度的行。 */
const INITIAL_ROWS = 60

/** 虚拟窗口要渲染的行区间（左闭右开）。 */
interface RowWindow {
  /** 起始行下标。 */
  start: number
  /** 结束行下标（不含）。 */
  end: number
}

/**
 * 按滚动位置折算要渲染的行区间。
 * @param scrollTop 滚动位置
 * @param viewportHeight 可视高度
 * @param rowHeight 固定行高
 * @param total 总行数
 * @returns 行区间
 */
function rowWindow(scrollTop: number, viewportHeight: number, rowHeight: number, total: number): RowWindow {
  if (total === 0 || rowHeight <= 0) return { start: 0, end: 0 }

  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN_ROWS)
  const end = Math.min(total, Math.ceil((scrollTop + viewportHeight) / rowHeight) + OVERSCAN_ROWS)

  return { start, end: Math.max(start, end) }
}

/**
 * 取某一侧最长行的字符数。
 *
 * 内容列用它设成固定宽度：正文等宽渲染，`ch` 就是字符宽，横向滚动范围因此不随
 * 可视区内恰好出现的行变化，虚拟滚动不会让滚动条长度忽长忽短。
 * @param rows 逐行数据
 * @param side 取哪一侧
 * @returns 最长行的字符数
 */
function widestLine(rows: DiffRow[], side: 'left' | 'right'): number {
  let widest = 0

  for (const row of rows) widest = Math.max(widest, (side === 'left' ? row.left : row.right).length)

  return widest
}

/**
 * 监听滚动容器，返回当前应渲染的行区间。
 * @param refs 参与滚动的容器：并排模式两栏都要监听，任一栏滚动都可能改写窗口
 * @param rowHeight 固定行高
 * @param total 总行数
 * @returns 行区间
 */
function useVirtualRows(
  refs: ReadonlyArray<React.RefObject<HTMLDivElement>>,
  rowHeight: number,
  total: number,
): RowWindow {
  const [range, setRange] = useState<RowWindow>(() => ({ start: 0, end: Math.min(total, INITIAL_ROWS) }))

  useEffect(() => {
    const elements = refs.map((ref) => ref.current).filter((el): el is HTMLDivElement => el !== null)
    const first = elements[0]
    if (first === undefined) return

    /**
     * 按某个容器的当前位置重算窗口。
     * @param el 滚动容器
     */
    const update = (el: HTMLDivElement): void => {
      setRange(rowWindow(el.scrollTop, el.clientHeight, rowHeight, total))
    }

    const listeners = elements.map((el) => {
      const listener = (): void => update(el)
      el.addEventListener('scroll', listener, { passive: true })

      return { el, listener }
    })

    // 面板拖拽、窗口缩放只改视口高度，不产生 scroll 事件，需要单独观察
    const observer = new ResizeObserver(() => update(first))
    for (const el of elements) observer.observe(el)

    // 挂载或换文件后按当前视口校正一次，否则首帧停在默认行数上
    update(first)

    return () => {
      for (const { el, listener } of listeners) el.removeEventListener('scroll', listener)
      observer.disconnect()
    }
  }, [refs, rowHeight, total])

  return range
}

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
  /** 刚被另一栏写入过的目标栏与写入时刻；用于识别同步自己造成的回声事件。 */
  const echo = React.useRef<{ pane: 'left' | 'right' | null; at: number }>({ pane: null, at: 0 })
  // 数组身份要稳定，否则虚拟滚动的监听会在每次渲染时重装
  const refs = useMemo(() => [leftRef, rightRef], [leftRef, rightRef])
  const range = useVirtualRows(refs, rowHeight, rows.length)
  const leftColumns = useMemo(() => widestLine(rows, 'left'), [rows])
  const rightColumns = useMemo(() => widestLine(rows, 'right'), [rows])

  /**
   * 把一栏的垂直位置同步到另一栏。
   * @param source 触发滚动的栏
   * @returns 该栏的 scroll 处理函数
   */
  const syncScroll = (source: 'left' | 'right') => (): void => {
    const now = performance.now()

    // 上一次写入让这一栏派发的 scroll 事件：直接跳过。否则平滑滚动会被逐帧拉回原位，
    // 表现成点「上一处 / 下一处」毫无反应
    if (echo.current.pane === source && now - echo.current.at < ECHO_WINDOW_MS) return

    const from = source === 'left' ? leftRef.current : rightRef.current
    const to = source === 'left' ? rightRef.current : leftRef.current
    if (from === null || to === null) return
    if (Math.abs(to.scrollTop - from.scrollTop) < 1) return

    echo.current = { pane: source === 'left' ? 'right' : 'left', at: now }
    to.scrollTop = from.scrollTop
  }

  return (
    <div className="flex h-full min-h-0 w-full">
      <div ref={leftRef} onScroll={syncScroll('left')} className="min-w-0 flex-1 overflow-auto overscroll-contain pb-2">
        <DiffPane
          side="left"
          rows={rows}
          syntax={leftSyntax}
          rowHeight={rowHeight}
          range={range}
          columns={leftColumns}
        />
      </div>

      {/* 两栏之间的分隔线：各自滚动后仍要能看出左右对照关系 */}
      <div
        ref={rightRef}
        onScroll={syncScroll('right')}
        className="min-w-0 flex-1 overflow-auto overscroll-contain border-l border-line1 pb-2"
      >
        <DiffPane
          side="right"
          rows={rows}
          syntax={rightSyntax}
          rowHeight={rowHeight}
          range={range}
          columns={rightColumns}
        />
      </div>
    </div>
  )
}

/**
 * 虚拟滚动的占位行：把未渲染的行压成一条等高空白，滚动条长度仍对应全部行。
 * @param props 占位高度与跨列数
 * @returns 占位行
 */
function SpacerRow({ height, colSpan }: { height: number; colSpan: number }): React.ReactElement {
  return (
    <tr aria-hidden="true" style={{ height: `${String(height)}px` }}>
      <td className="p-0" colSpan={colSpan} />
    </tr>
  )
}

/** 并排差异的一栏：行号与内容在同一栏内横向滚动。 */
function DiffPane({
  side,
  rows,
  syntax,
  rowHeight,
  range,
  columns,
}: {
  side: 'left' | 'right'
  rows: DiffRow[]
  syntax: SyntaxLines
  rowHeight: number
  range: RowWindow
  columns: number
}): React.ReactElement {
  const topHeight = range.start * rowHeight
  const bottomHeight = (rows.length - range.end) * rowHeight

  return (
    // min-w-full：内容窄时表格仍铺满本栏，内容宽时由本栏横向滚动
    <table className="min-w-full table-auto border-collapse font-mono">
      <colgroup>
        <col style={{ width: 3 }} />
        <col style={{ width: 44 }} />
        {/* 内容列锁到最长行：横向滚动范围不随可视行变化 */}
        <col style={{ width: `${String(columns)}ch`, minWidth: `${String(columns)}ch` }} />
      </colgroup>

      <tbody>
        {topHeight > 0 && <SpacerRow height={topHeight} colSpan={3} />}

        {rows.slice(range.start, range.end).map((row, offset) => {
          const index = range.start + offset
          const added = row.kind === 'added'
          const removed = row.kind === 'removed'
          const modified = row.kind === 'modified'
          const number = side === 'left' ? row.leftNumber : row.rightNumber
          const content = side === 'left' ? row.left : row.right
          const spans = number === null ? undefined : syntax[number - 1]

          return (
            // height 只是行高下限：单元格默认带上下各 1px 的 padding，会把行撑高 2px。
            // 虚拟滚动的占位高度按 rowHeight 折算，行高一旦偏离，总高度与滚动位置就跟着失真，
            // 所以下面每个单元格都带 py-0，让实际行高恰好等于 rowHeight
            <tr key={`${side}:${String(index)}`} data-row={index} style={{ height: `${String(rowHeight)}px` }}>
              {/* 左边缘的变更标记条 */}
              <td className={cn('p-0', added || modified ? 'bg-success' : removed ? 'bg-danger' : 'bg-transparent')} />

              <td className="select-none whitespace-nowrap border-r border-line1/60 px-2 py-0 text-right text-secondary">
                {number ?? ''}
              </td>

              {side === 'left' ? (
                // 变更底色只加在内容单元格上：行号列与空白列保持编辑区底色，整行染色会让新增文件看起来糊成一片
                <td className={cn('whitespace-pre px-2 py-0 text-primary', removed && 'bg-danger/15', modified && 'bg-danger/5')}>
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
                <td className={cn('whitespace-pre px-2 py-0 text-primary', added && 'bg-success/15', modified && 'bg-success/10')}>
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

        {bottomHeight > 0 && <SpacerRow height={bottomHeight} colSpan={3} />}
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
  rowHeight,
  scrollRef,
}: {
  rows: DiffRow[]
  leftSyntax: SyntaxLines
  rightSyntax: SyntaxLines
  rowHeight: number
  scrollRef: React.RefObject<HTMLDivElement>
}): React.ReactElement {
  // 单栏由外层容器统一滚动，虚拟窗口跟着它走
  const refs = useMemo(() => [scrollRef], [scrollRef])
  const range = useVirtualRows(refs, rowHeight, rows.length)
  // 单栏里左右两侧的行混排在同一列，列宽取两侧的最长行
  const columns = useMemo(() => Math.max(widestLine(rows, 'left'), widestLine(rows, 'right')), [rows])
  const topHeight = range.start * rowHeight
  const bottomHeight = (rows.length - range.end) * rowHeight

  return (
    <table className="w-full table-auto border-collapse font-mono">
      <colgroup>
        <col style={{ width: 3 }} />
        <col style={{ width: 42 }} />
        <col style={{ width: 18 }} />
        <col style={{ width: `${String(columns)}ch`, minWidth: `${String(columns)}ch` }} />
      </colgroup>

      <tbody>
        {topHeight > 0 && <SpacerRow height={topHeight} colSpan={4} />}

        {rows.slice(range.start, range.end).map((row, offset) => {
          const index = range.start + offset
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

          return (
            // 与并排模式同一约束：行高必须等于 rowHeight，单元格因此都带 py-0
            <tr key={`inline:${String(index)}`} data-row={index} style={{ height: `${String(rowHeight)}px` }}>
              <td
                className={cn(
                  'p-0',
                  row.kind === 'added' ? 'bg-success' : row.kind === 'removed' ? 'bg-danger' : 'bg-transparent',
                )}
              />
              <td className="select-none border-r border-line1/60 px-2 py-0 text-right text-secondary">
                {number ?? ''}
              </td>
              <td
                className={cn(
                  'select-none py-0 text-center',
                  row.kind === 'added' ? 'text-success' : row.kind === 'removed' ? 'text-danger' : 'text-secondary',
                )}
              >
                {sign}
              </td>
              <td className={cn('whitespace-pre px-2 py-0 text-primary', tone)}>
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

        {bottomHeight > 0 && <SpacerRow height={bottomHeight} colSpan={4} />}
      </tbody>
    </table>
  )
}
