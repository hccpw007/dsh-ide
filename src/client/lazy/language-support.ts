/**
 * 语法支持：按扩展名装配 CodeMirror 语言，并提供整篇文本的离线高亮。
 *
 * 本文件属于编辑器内核 chunk，不进主 bundle。语言包用动态 `import()` 引入：打开
 * `.md` 时才拉 Markdown 解析器，大语言包不会因为用户只开了一个 JSON 文件就全部
 * 下载。差异视图复用同一份装配结果，配色因此与编辑器正文完全一致。
 */
import type { Language } from '@codemirror/language'
import type { Extension } from '@codemirror/state'
import { highlightCode, tagHighlighter, tags as t } from '@lezer/highlight'

import type { SyntaxLines, SyntaxRole } from '../../common/syntax-highlight'

/** 一种语言的装配结果。 */
export interface LanguageBinding {
  /** 编辑器用的语言扩展。 */
  extensions: Extension[]
  /** 语言对象；其 parser 用于整篇离线高亮。 */
  language: Language
}

/**
 * 语法角色到 lezer tag 的映射。
 *
 * 分组照 IDEA 的语义来：关键字与字面量同色、字符串绿、数字蓝、方法名黄、字段名紫，
 * 与默认主题把标识符统一染蓝的做法完全不同。每个 spec 只给一个角色名，角色名即
 * `--ide-syn-*` 变量名。
 */
const ROLE_HIGHLIGHTER = tagHighlighter([
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], class: 'comment' },
  {
    tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.definitionKeyword, t.operatorKeyword, t.self],
    class: 'keyword',
  },
  { tag: [t.bool, t.null, t.atom, t.unit], class: 'keyword' },
  { tag: [t.string, t.docString, t.character, t.attributeValue, t.special(t.string)], class: 'string' },
  { tag: [t.number, t.integer, t.float], class: 'number' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.function(t.name)], class: 'function' },
  { tag: [t.propertyName], class: 'property' },
  { tag: [t.typeName, t.className, t.namespace], class: 'type' },
  { tag: [t.annotation, t.modifier], class: 'annotation' },
  { tag: [t.tagName], class: 'tag' },
  { tag: [t.attributeName], class: 'attribute' },
  { tag: [t.operator, t.punctuation, t.separator, t.bracket], class: 'operator' },
  { tag: [t.link, t.url], class: 'link' },
  {
    tag: [t.heading, t.heading1, t.heading2, t.heading3, t.heading4, t.heading5, t.heading6],
    class: 'heading',
  },
  // 引用与 Markdown 标记符号压灰，行内代码与代码块用字符串绿，让文档也有层次
  { tag: [t.processingInstruction, t.contentSeparator, t.quote], class: 'comment' },
  { tag: [t.monospace, t.labelName], class: 'string' },
  { tag: [t.invalid], class: 'invalid' },
])

/**
 * 按扩展名取语言。
 * @param path 文件路径
 * @returns 语言装配结果；未知扩展名或加载失败时返回 null（按纯文本处理）
 */
export async function languageOf(path: string): Promise<LanguageBinding | null> {
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase()

  try {
    if (extension === 'ts' || extension === 'tsx') {
      const { javascript } = await import('@codemirror/lang-javascript')
      const support = javascript({ typescript: true, jsx: extension === 'tsx' })

      return { extensions: [support], language: support.language }
    }

    if (extension === 'js' || extension === 'jsx' || extension === 'mjs' || extension === 'cjs') {
      const { javascript } = await import('@codemirror/lang-javascript')
      const support = javascript({ jsx: extension === 'jsx' })

      return { extensions: [support], language: support.language }
    }

    if (extension === 'json') {
      const { json } = await import('@codemirror/lang-json')
      const support = json()

      return { extensions: [support], language: support.language }
    }

    if (extension === 'css' || extension === 'scss' || extension === 'less') {
      const { css } = await import('@codemirror/lang-css')
      const support = css()

      return { extensions: [support], language: support.language }
    }

    if (extension === 'html' || extension === 'htm' || extension === 'vue' || extension === 'svelte') {
      const { html } = await import('@codemirror/lang-html')
      const support = html()

      return { extensions: [support], language: support.language }
    }

    if (extension === 'md' || extension === 'mdx') {
      const { markdown } = await import('@codemirror/lang-markdown')
      const support = markdown()

      return { extensions: [support], language: support.language }
    }

    if (extension === 'py') {
      const { python } = await import('@codemirror/lang-python')
      const support = python()

      return { extensions: [support], language: support.language }
    }

    if (extension === 'go') {
      const { go } = await import('@codemirror/lang-go')
      const support = go()

      return { extensions: [support], language: support.language }
    }

    if (extension === 'rs') {
      const { rust } = await import('@codemirror/lang-rust')
      const support = rust()

      return { extensions: [support], language: support.language }
    }
  } catch (error) { // 语言包加载失败时降级为纯文本，不能让文件打不开
    console.error('[dsh-ide] 加载语法高亮失败，按纯文本处理:', path, error)
  }

  return null
}

/**
 * 对整篇文本做语法高亮，按行返回片段。
 *
 * 解析在调用线程同步完成，调用方需按文本规模控制是否值得高亮（见
 * `client/lazy/editor-api.ts` 的长度上限）。
 * @param text 文本
 * @param language 语言对象
 * @returns 按行索引的语法片段
 */
export function syntaxLinesOf(text: string, language: Language): SyntaxLines {
  const lines: SyntaxLines = [[]]

  highlightCode(
    text,
    language.parser.parse(text),
    ROLE_HIGHLIGHTER,
    (piece, role) => {
      // 未匹配到角色的文本同样要保留，否则行内容会缺字
      const line = lines[lines.length - 1]
      if (line === undefined) return

      line.push({ text: piece, role: roleOf(role) })
    },
    () => {
      lines.push([])
    },
  )

  return lines
}

/**
 * 把高亮器给出的类名收敛成单一角色。
 *
 * 高亮器按最具体的 tag 匹配，正常情况下只会给一个类名；这里做一次兜底切分，
 * 避免多类名拼出非法的 CSS 变量名。
 * @param classes 空格分隔的类名串
 * @returns 语义角色；空串表示未匹配
 */
function roleOf(classes: string): SyntaxRole | '' {
  return (classes.split(' ')[0] ?? '') as SyntaxRole | ''
}
