/**
 * 带语法着色与词级变更标记的代码文本。
 *
 * 差异正文由表格渲染：行号对齐、折叠段与词级高亮都依赖逐行结构，换成 CodeMirror
 * 实例会全部丢失。因此高亮以「片段 + 内联颜色」的形式落在普通元素上，颜色取自
 * `--ide-syn-*` 变量，明暗主题切换无需重渲染。
 */
import React, { useMemo } from 'react'

import {
  composeCodeSpans,
  syntaxColor,
  type ChangedSpan,
  type SyntaxSpan,
} from './syntax-highlight'

/** 代码文本 props。 */
export interface CodeTextProps {
  /** 行文本。 */
  text: string
  /** 该行的语法片段；缺失时按纯文本渲染。 */
  spans?: readonly SyntaxSpan[]
  /** 该行的词级变更片段；缺失时只做语法着色。 */
  changes?: readonly ChangedSpan[]
  /** 词级变更片段的样式类；新增与删除由调用方给不同底色。 */
  changedClassName?: string
}

/**
 * 渲染一行带语法着色的代码。
 * @param props 见 CodeTextProps
 * @returns 片段序列
 */
export function CodeText({ text, spans, changes, changedClassName }: CodeTextProps): React.ReactElement {
  const pieces = useMemo(() => composeCodeSpans(text, spans, changes), [changes, spans, text])

  // 整行都是正文色时直接输出文本，不为普通行制造额外节点
  if (isPlainText(pieces)) return <>{text}</>

  return (
    <>
      {pieces.map((piece, index) => {
        const color = syntaxColor(piece.role)
        const style = color === undefined ? undefined : { color }
        const key = `code:${String(index)}`

        return piece.changed && changedClassName !== undefined ? (
          <span key={key} className={changedClassName} style={style}>
            {piece.text}
          </span>
        ) : (
          <span key={key} style={style}>
            {piece.text}
          </span>
        )
      })}
    </>
  )
}

/**
 * 判断是否只有一段默认色的文本。
 * @param pieces 渲染片段
 * @returns 无需额外元素时返回 true
 */
function isPlainText(pieces: readonly { role: string; changed: boolean }[]): boolean {
  const first = pieces[0]

  return pieces.length === 1 && first !== undefined && first.role === '' && !first.changed
}
