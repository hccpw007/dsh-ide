/**
 * 差异渲染的公共组件。
 *
 * 输入是 `diff` 库产出的逐行变更，输出是并排 / 行内两种布局。两种布局共用同一份
 * 逐行数据，切换模式不重新计算差异。
 *
 * 差异按 hunk 折叠：默认只显示改动行与前后各 `context` 行，其余折成一条
 * 「展开 N 行」——大文件改了十行不该让人滚几千行上下文。
 */
import React, { useEffect, useMemo, useState } from 'react'

import { cn } from '../../../common/cn'
import { CodeText } from '../../../common/CodeText'
import type { SyntaxLines, SyntaxSpan } from '../../../common/syntax-highlight'
import type { Change } from '../../lazy/diff-kernel'
import { highlightLines } from '../../lazy/highlight'
import { loadLazyChunk } from '../../lazy/loader'
import type { Translate } from '../../../types/plugin'

/** 差异 chunk 的形态。 */
interface DiffChunk {
  /** 逐行比较。 */
  diffLines(left: string, right: string): Change[]
}

/** 逐行差异数据。 */
export interface DiffRow {
  /** 旧文件行号；该行不存在时为 null。 */
  leftNumber: number | null
  /** 新文件行号；该行不存在时为 null。 */
  rightNumber: number | null
  /** 旧文本。 */
  left: string
  /** 新文本。 */
  right: string
  /** 行类型。 */
  kind: 'equal' | 'removed' | 'added' | 'modified'
}

/** 折叠段：表示中间有 N 行未显示。 */
interface CollapsedSegment {
  /** 折叠的行数。 */
  count: number
  /** 折叠段在 rows 里的起始下标。 */
  from: number
}

/** 差异视图的布局模式。 */
export type DiffMode = 'inline' | 'side-by-side'

/** 差异视图 props。 */
export interface DiffViewProps {
  /** 已绑定 feature 前缀的翻译函数。 */
  t: Translate
  /** 旧文本。 */
  left: string
  /** 新文本。 */
  right: string
  /** 决定语法高亮的文件路径；缺失时只显示纯文本。 */
  path?: string
  /** 布局模式。 */
  mode: DiffMode
  /** 上下文行数；0 表示只显示改动行。 */
  context: number
  /** 是否忽略空白差异。 */
  ignoreWhitespace: boolean
  /** 是否忽略大小写。 */
  ignoreCase: boolean
  /** 正文字号（px）；由调用方从设置传入，缺省 12。 */
  fontSize?: number
  /** 正文行距，相对字号的倍数；由调用方从设置传入，缺省 1.2。 */
  lineHeight?: number
  /** 差异段数变化时的回调；Git 面板用它显示「N 处差异」。 */
  onChangeCount?(count: number): void
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
 * 把 `diff` 的变更块摊平成逐行数据。
 *
 * 相邻的「删除块 + 新增块」按位置配对成「修改」，读起来比先删后增直观；
 * 多出来的部分才是纯删或纯增。
 * @param changes 变更块
 * @returns 逐行数据
 */
export function toRows(changes: Change[]): DiffRow[] {
  const rows: DiffRow[] = []
  let leftNumber = 1
  let rightNumber = 1

  for (let index = 0; index < changes.length; index += 1) {
    const change = changes[index]
    const content = linesOf(change.value)

    if (change.removed === true) {
      const next = changes[index + 1]
      const addedLines = next?.added === true ? linesOf(next.value) : []
      const paired = Math.min(content.length, addedLines.length)

      for (let offset = 0; offset < paired; offset += 1) {
        rows.push({
          leftNumber,
          rightNumber,
          left: content[offset],
          right: addedLines[offset],
          kind: content[offset] === addedLines[offset] ? 'equal' : 'modified',
        })
        leftNumber += 1
        rightNumber += 1
      }

      for (let offset = paired; offset < content.length; offset += 1) {
        rows.push({ leftNumber, rightNumber: null, left: content[offset], right: '', kind: 'removed' })
        leftNumber += 1
      }

      for (let offset = paired; offset < addedLines.length; offset += 1) {
        rows.push({ leftNumber: null, rightNumber, left: '', right: addedLines[offset], kind: 'added' })
        rightNumber += 1
      }

      // 已消费紧随其后的新增块
      if (next?.added === true) index += 1

      continue
    }

    if (change.added === true) {
      for (const line of content) {
        rows.push({ leftNumber: null, rightNumber, left: '', right: line, kind: 'added' })
        rightNumber += 1
      }

      continue
    }

    for (const line of content) {
      rows.push({ leftNumber, rightNumber, left: line, right: line, kind: 'equal' })
      leftNumber += 1
      rightNumber += 1
    }
  }

  return rows
}

/**
 * 计算需要折叠的区段。
 *
 * 未被任何改动行「上下各 context 行」覆盖的连续等值行会被折叠；落单的一两行
 * 不值得单独折，因此只有长度超过 2 的才折叠。
 * @param rows 逐行数据
 * @param context 上下文行数
 * @returns 折叠段列表，按起始下标升序
 */
export function findCollapsed(rows: DiffRow[], context: number): CollapsedSegment[] {
  /** 每个下标是否在某个改动行的上下文窗口内。 */
  const visible = new Uint8Array(rows.length)

  for (let index = 0; index < rows.length; index += 1) {
    if (rows[index].kind === 'equal') continue

    const from = Math.max(0, index - context)
    const to = Math.min(rows.length - 1, index + context)

    for (let offset = from; offset <= to; offset += 1) visible[offset] = 1
  }

  const segments: CollapsedSegment[] = []
  let start = -1

  for (let index = 0; index <= rows.length; index += 1) {
    const hidden = index < rows.length && visible[index] === 0

    if (hidden && start < 0) start = index

    if (!hidden && start >= 0) {
      if (index - start > 1) segments.push({ count: index - start, from: start })
      start = -1
    }
  }

  return segments
}

/**
 * 渲染差异视图。
 * @param props 见 DiffViewProps
 * @returns 逐行差异表
 */
export function DiffBody({
  t,
  left,
  right,
  path,
  mode,
  context,
  ignoreWhitespace,
  ignoreCase,
  fontSize = 12,
  lineHeight = 1.2,
  onChangeCount,
}: DiffViewProps): React.ReactElement {
  /** 已展开的折叠段起始下标。 */
  const [opened, setOpened] = useState<ReadonlySet<number>>(() => new Set())
  /** 差异结果；chunk 未到位时为空。 */
  const [rows, setRows] = useState<DiffRow[]>([])
  /** 差异 chunk 是否已加载。 */
  const [ready, setReady] = useState(false)
  /** 两侧语法片段；解析到位前为空，正文以默认色显示。 */
  const [syntax, setSyntax] = useState<{ left: SyntaxLines; right: SyntaxLines }>({ left: [], right: [] })

  // 差异库走懒加载 chunk：只在真正打开差异视图时才下载
  useEffect(() => {
    let alive = true

    void loadLazyChunk<DiffChunk>('diff-kernel')
      .then((chunk) => {
        if (!alive) return

        // 归一化在比较前完成，两个选项才真正影响结果，而不是只影响显示
        const normalize = (text: string): string =>
          ignoreCase ? text.toLowerCase() : ignoreWhitespace ? text.replace(/[ \t]+/g, ' ') : text

        setRows(toRows(chunk.diffLines(normalize(left), normalize(right))))
        setReady(true)
      })
      .catch((error: unknown) => {
        console.error('[dsh-ide] 加载差异内核失败:', error)
      })

    return () => {
      alive = false
    }
  }, [ignoreCase, ignoreWhitespace, left, right])

  // 高亮只依赖两侧文本与路径：先清空再加载，避免上一份内容的颜色套到新行上
  useEffect(() => {
    let alive = true
    const target = path ?? ''

    setSyntax({ left: [], right: [] })

    void Promise.all([highlightLines(target, left), highlightLines(target, right)])
      .then(([leftLines, rightLines]) => {
        if (!alive) return

        setSyntax({ left: leftLines, right: rightLines })
      })
      .catch((error: unknown) => {
        console.error('[dsh-ide] 差异语法高亮失败:', error)
      })

    return () => {
      alive = false
    }
  }, [left, path, right])

  const collapsed = useMemo(() => findCollapsed(rows, context), [context, rows])

  /** 差异段数：连续的非等值行算一段，与 IDEA 的「N difference」口径一致。 */
  const changeCount = useMemo(() => {
    let count = 0
    let inChange = false

    for (const row of rows) {
      const changed = row.kind !== 'equal'
      if (changed && !inChange) count += 1
      inChange = changed
    }

    return count
  }, [rows])

  // 计数在渲染结果之外，交给外层显示；回调必须稳定，否则会反复触发
  useEffect(() => {
    onChangeCount?.(changeCount)
  }, [changeCount, onChangeCount])

  if (!ready) return <div className="p-3 text-xs text-secondary">{t('loading')}</div>

  if (rows.length === 0) {
    return <div className="p-3 text-xs text-secondary">{t('identical')}</div>
  }

  /**
   * 判断某行是否被折叠且未展开。
   * @param index 行下标
   * @returns 需要隐藏时返回该行所在的折叠段
   */
  function hiddenBy(index: number): CollapsedSegment | undefined {
    return collapsed.find((segment) => index >= segment.from && index < segment.from + segment.count)
  }

  return (
    <div
      className={cn(
        'min-h-0 flex-1 overflow-auto font-mono',
        // 差异正文属于内容区：全局禁选之下单独放开，便于复制代码片段
        'ide-selectable',
      )}
      // 字号与行距跟随设置里的编辑器度量：改设置后正文立即按新度量排版
      style={{ fontSize: `${String(fontSize)}px`, lineHeight }}
    >
      <table className="w-full border-collapse">
        <tbody>
          {rows.map((row, index) => {
            const segment = hiddenBy(index)

            if (segment !== undefined) {
              // 折叠段只在第一行渲染一条展开条，其余行整段跳过
              if (opened.has(segment.from)) return null
              if (index !== segment.from) return null

              return (
                <tr key={`collapsed:${segment.from}`}>
                  <td colSpan={mode === 'side-by-side' ? 4 : 3} className="border-y border-line1 bg-surface1 px-3 py-1 text-center text-secondary">
                    {/* 折叠段：点击展开它覆盖的全部行 */}
                    <button
                      type="button"
                      onClick={() => setOpened((previous) => new Set(previous).add(segment.from))}
                      className="bg-transparent text-info hover:underline"
                    >
                      {t('expandLines')} {segment.count}
                    </button>
                  </td>
                </tr>
              )
            }

            const added = row.kind === 'added'
            const removed = row.kind === 'removed'
            const modified = row.kind === 'modified'

            // 语法片段按行号索引：rows 保留了原文行号，直接取对应行即可
            const leftSpans: SyntaxSpan[] | undefined =
              row.leftNumber === null ? undefined : syntax.left[row.leftNumber - 1]
            const rightSpans: SyntaxSpan[] | undefined =
              row.rightNumber === null ? undefined : syntax.right[row.rightNumber - 1]

            if (mode === 'inline') {
              // 行内模式：修改行拆成「删」「增」两行，与常见 diff 输出一致
              if (modified) {
                return (
                  <React.Fragment key={`row:${index}`}>
                    <tr className="bg-danger/10">
                      <td className="w-12 select-none border-r border-line1 px-2 text-right text-secondary">{row.leftNumber}</td>
                      <td className="w-4 select-none text-center text-danger">−</td>
                      <td className="whitespace-pre-wrap break-all px-2 text-primary">
                        <CodeText text={row.left} spans={leftSpans} />
                      </td>
                    </tr>
                    <tr className="bg-success/10">
                      <td className="w-12 select-none border-r border-line1 px-2 text-right text-secondary">{row.rightNumber}</td>
                      <td className="w-4 select-none text-center text-success">+</td>
                      <td className="whitespace-pre-wrap break-all px-2 text-primary">
                        <CodeText text={row.right} spans={rightSpans} />
                      </td>
                    </tr>
                  </React.Fragment>
                )
              }

              return (
                <tr key={`row:${index}`} className={cn(added ? 'bg-success/10' : removed ? 'bg-danger/10' : '')}>
                  <td className="w-12 select-none border-r border-line1 px-2 text-right text-secondary">
                    {row.leftNumber ?? row.rightNumber}
                  </td>
                  <td className={cn('w-4 select-none text-center', added ? 'text-success' : removed ? 'text-danger' : 'text-secondary')}>
                    {added ? '+' : removed ? '−' : ' '}
                  </td>
                  <td className="whitespace-pre-wrap break-all px-2 text-primary">
                    <CodeText text={added ? row.right : row.left} spans={added ? rightSpans : leftSpans} />
                  </td>
                </tr>
              )
            }

            return (
              <tr
                key={`row:${index}`}
                className={cn(added ? 'bg-success/10' : removed ? 'bg-danger/10' : modified ? 'bg-warn/10' : '')}
              >
                {/* 旧行号 */}
                <td className="w-12 select-none border-r border-line1 px-2 text-right text-secondary">
                  {row.leftNumber ?? ''}
                </td>
                {/* 旧内容 */}
                <td className={cn('w-1/2 whitespace-pre-wrap break-all border-r border-line1 px-2 text-primary', removed && 'line-through opacity-70')}>
                  <CodeText text={row.left} spans={leftSpans} />
                </td>
                {/* 新行号 */}
                <td className="w-12 select-none border-r border-line1 px-2 text-right text-secondary">
                  {row.rightNumber ?? ''}
                </td>
                {/* 新内容 */}
                <td className="w-1/2 whitespace-pre-wrap break-all px-2 text-primary">
                  <CodeText text={row.right} spans={rightSpans} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {opened.size > 0 && (
        <div className="border-t border-line1 px-3 py-1 text-center text-secondary">
          {/* 恢复默认折叠 */}
          <button type="button" onClick={() => setOpened(new Set())} className="bg-transparent text-info hover:underline">
            {t('collapseAll')}
          </button>
        </div>
      )}
    </div>
  )
}
