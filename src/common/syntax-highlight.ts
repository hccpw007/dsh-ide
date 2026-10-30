/**
 * 差异视图的语法着色公共部分。
 *
 * 解析发生在懒加载的编辑器内核里（`chunks/editor-kernel.js`），主 bundle 只保留
 * 角色契约与渲染前的片段合并：内核按行给出「文本 + 角色」，视图再与词级变更标记
 * 合并成可直接渲染的片段。
 */

/**
 * 语法语义角色。
 *
 * 取值与 `input.css` 里的 `--ide-syn-*` 变量同名：换主题只换变量值，渲染代码不必改。
 */
export type SyntaxRole =
  | 'keyword'
  | 'string'
  | 'number'
  | 'comment'
  | 'function'
  | 'property'
  | 'type'
  | 'annotation'
  | 'tag'
  | 'attribute'
  | 'operator'
  | 'link'
  | 'invalid'
  | 'heading'

/** 行内语法片段。 */
export interface SyntaxSpan {
  /** 片段文本。 */
  text: string
  /** 语义角色；空串表示使用正文默认色。 */
  role: SyntaxRole | ''
}

/** 按行索引的语法片段；下标 = 行号 - 1，与差异行号直接对齐。 */
export type SyntaxLines = SyntaxSpan[][]

/** 词级变更片段；与 Git 差异行的 Segment 结构一致。 */
export interface ChangedSpan {
  /** 片段文本。 */
  text: string
  /** 是否为改动部分。 */
  changed: boolean
}

/** 渲染片段：语法角色与词级变更标记的组合。 */
export interface CodeSpan {
  /** 片段文本。 */
  text: string
  /** 语义角色。 */
  role: SyntaxRole | ''
  /** 是否属于词级改动。 */
  changed: boolean
}

/**
 * 取角色对应的前景色。
 * @param role 语义角色
 * @returns CSS 颜色；默认角色返回 undefined，交给外层文本色
 */
export function syntaxColor(role: SyntaxRole | ''): string | undefined {
  return role === '' ? undefined : `var(--ide-syn-${role})`
}

/**
 * 把词级变更片段摊成逐字符标记。
 * @param length 行文本长度
 * @param changes 词级变更片段
 * @returns 每个字符是否被标记为改动
 */
function changedFlagsOf(length: number, changes: readonly ChangedSpan[] | undefined): Uint8Array {
  const flags = new Uint8Array(length)

  if (changes === undefined) return flags

  let offset = 0

  for (const change of changes) {
    const end = Math.min(offset + change.text.length, length)

    if (change.changed) flags.fill(1, offset, end)
    offset = end
  }

  return flags
}

/**
 * 追加片段，相邻同色同标记的片段合并，减少 DOM 节点数量。
 * @param target 目标数组
 * @param span 待追加片段
 */
function appendSpan(target: CodeSpan[], span: CodeSpan): void {
  const last = target[target.length - 1]

  if (last !== undefined && last.role === span.role && last.changed === span.changed) {
    last.text += span.text

    return
  }

  target.push(span)
}

/**
 * 把一行的语法片段与词级变更标记合并成渲染片段。
 *
 * 两个来源都是字符区间：词级标记决定底色、语法角色决定前景色，按两者的边界切分
 * 即可。语法片段长度与行文本对不上时（例如解析结果来自另一版内容）忽略语法着色，
 * 只保留词级标记——颜色错位比没有颜色更难读。
 * @param text 行文本
 * @param spans 该行的语法片段
 * @param changes 该行的词级变更片段
 * @returns 渲染片段
 */
export function composeCodeSpans(
  text: string,
  spans: readonly SyntaxSpan[] | undefined,
  changes: readonly ChangedSpan[] | undefined,
): CodeSpan[] {
  if (text === '') return []

  const aligned =
    spans !== undefined && spans.reduce((total, span) => total + span.text.length, 0) === text.length
  const pieces: readonly SyntaxSpan[] = aligned && spans !== undefined ? spans : [{ text, role: '' }]

  const changedFlags = changedFlagsOf(text.length, changes)
  const result: CodeSpan[] = []
  /** 已消费的字符数：语法片段连续排列，用它把片内偏移换算成整行偏移。 */
  let cursor = 0

  for (const piece of pieces) {
    let offset = 0

    while (offset < piece.text.length) {
      const changed = changedFlags[cursor + offset] === 1
      let end = offset + 1

      while (end < piece.text.length && (changedFlags[cursor + end] === 1) === changed) end += 1

      appendSpan(result, { text: piece.text.slice(offset, end), role: piece.role, changed })
      offset = end
    }

    cursor += piece.text.length
  }

  return result
}
