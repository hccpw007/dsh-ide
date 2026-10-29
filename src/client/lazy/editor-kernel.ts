/**
 * 编辑器内核：CodeMirror 6 的封装。
 *
 * 本文件属于懒加载 chunk，不进主 bundle。它只暴露 `client/lazy/editor-api.ts` 里声明
 * 的窄接口，把 CodeMirror 的扩展装配（语言、搜索、快捷键、主题）全部留在 chunk 内，
 * 主 bundle 因此不需要认识任何 CodeMirror 类型。
 *
 * 语言按扩展名动态加载：`.ts` 走 TypeScript 解析、`.json` 走 JSON、`.css` 走 CSS，
 * 其余落到无高亮的纯文本。语法包本身也在 chunk 里，按需 `import()` 拆成子块。
 */
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import {
  HighlightStyle,
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language'
import { highlightSelectionMatches, openSearchPanel, search, searchKeymap } from '@codemirror/search'
import { EditorState, Compartment, type Extension } from '@codemirror/state'
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view'
import { tags as t } from '@lezer/highlight'

import type { EditorKernel, EditorKernelModule, EditorKernelOptions } from './editor-api'

/**
 * 按扩展名取语言扩展。
 *
 * 语言包用动态 `import()` 引入：打开 `.md` 时才拉 Markdown 解析器，
 * 大型语言包不会因为用户只开了一个 JSON 文件就全部下载。
 * @param path 文件路径
 * @returns 语言扩展；未知扩展名返回空数组（纯文本）
 */
async function languageFor(path: string): Promise<Extension[]> {
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase()

  try {
    if (extension === 'ts' || extension === 'tsx') {
      const { javascript } = await import('@codemirror/lang-javascript')

      return [javascript({ typescript: true, jsx: extension === 'tsx' })]
    }

    if (extension === 'js' || extension === 'jsx' || extension === 'mjs' || extension === 'cjs') {
      const { javascript } = await import('@codemirror/lang-javascript')

      return [javascript({ jsx: extension === 'jsx' })]
    }

    if (extension === 'json') {
      const { json } = await import('@codemirror/lang-json')

      return [json()]
    }

    if (extension === 'css' || extension === 'scss' || extension === 'less') {
      const { css } = await import('@codemirror/lang-css')

      return [css()]
    }

    if (extension === 'html' || extension === 'htm' || extension === 'vue' || extension === 'svelte') {
      const { html } = await import('@codemirror/lang-html')

      return [html()]
    }

    if (extension === 'md' || extension === 'mdx') {
      const { markdown } = await import('@codemirror/lang-markdown')

      return [markdown()]
    }

    if (extension === 'py') {
      const { python } = await import('@codemirror/lang-python')

      return [python()]
    }

    if (extension === 'go') {
      const { go } = await import('@codemirror/lang-go')

      return [go()]
    }

    if (extension === 'rs') {
      const { rust } = await import('@codemirror/lang-rust')

      return [rust()]
    }
  } catch (error) { // 语言包加载失败时降级为纯文本，不能让文件打不开
    console.error('[dsh-ide] 加载语法高亮失败，按纯文本展示:', path, error)
  }

  return []
}

/** 关闭括号 / 引号之外的自动补全，避免在没有 Language Server 时给出错误补全。 */
const completionKeys: Extension = keymap.of(closeBracketsKeymap)

/**
 * IDEA 的语法高亮配色。
 *
 * 颜色一律走 `--ide-syn-*` 变量：编辑器内核只持有这一份样式，变量由工作台根节点按
 * 明暗主题给出两套值（Light / Darcula），切换主题无需重建视图。
 *
 * tag 分组照 IDEA 的语义来：关键字与字面量同色（橙）、字符串绿、数字蓝、方法名黄、
 * 字段名紫，与默认主题把标识符统一染蓝的做法完全不同。
 */
const ideaHighlightStyle = HighlightStyle.define([
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: 'var(--ide-syn-comment)' },
  {
    tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.definitionKeyword, t.operatorKeyword, t.self],
    color: 'var(--ide-syn-keyword)',
  },
  { tag: [t.bool, t.null, t.atom, t.unit], color: 'var(--ide-syn-keyword)' },
  { tag: [t.string, t.docString, t.character, t.attributeValue, t.special(t.string)], color: 'var(--ide-syn-string)' },
  { tag: [t.number, t.integer, t.float], color: 'var(--ide-syn-number)' },
  {
    tag: [t.function(t.variableName), t.function(t.propertyName), t.function(t.name)],
    color: 'var(--ide-syn-function)',
  },
  { tag: [t.propertyName], color: 'var(--ide-syn-property)' },
  { tag: [t.typeName, t.className, t.namespace], color: 'var(--ide-syn-type)' },
  { tag: [t.annotation, t.modifier], color: 'var(--ide-syn-annotation)' },
  { tag: [t.tagName], color: 'var(--ide-syn-tag)' },
  { tag: [t.attributeName], color: 'var(--ide-syn-attribute)' },
  { tag: [t.operator, t.punctuation, t.separator, t.bracket], color: 'var(--ide-syn-operator)' },
  { tag: [t.link, t.url], color: 'var(--ide-syn-link)', textDecoration: 'underline' },
  { tag: t.heading, fontWeight: 'bold', color: 'var(--ide-syn-text)' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strong, fontWeight: 'bold' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.invalid, color: 'var(--ide-syn-invalid)' },
])

/**
 * 创建编辑器实例。
 * @param options 创建参数
 * @returns 内核实例
 */
async function create(options: EditorKernelOptions): Promise<EditorKernel> {
  const language = new Compartment()
  const readOnly = new Compartment()
  const metrics = new Compartment()

  const view = new EditorView({
    parent: options.parent,
    state: EditorState.create({
      doc: options.doc,
      extensions: [
        lineNumbers(),
        // 折叠标记排在行号右侧，与 IDEA 的 gutter 顺序一致
        foldGutter(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        drawSelection(),
        history(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        highlightSelectionMatches(),
        syntaxHighlighting(ideaHighlightStyle, { fallback: true }),
        search({ top: true }),
        keymap.of([
          {
            key: 'Mod-s',
            run: () => {
              options.onSave()

              return true
            },
          },
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
          ...foldKeymap,
          indentWithTab,
        ]),
        completionKeys,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) options.onChange(update.state.doc.toString())
        }),
        // 配色走 --ide-* 变量：明暗主题各一套值，切换时无需重建视图
        EditorView.theme({
          '&': {
            fontSize: `${String(options.fontSize)}px`,
            backgroundColor: 'transparent',
            color: 'var(--ide-syn-text)',
            height: '100%',
          },
          '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', lineHeight: '1.6' },
          '.cm-gutters': {
            backgroundColor: 'transparent',
            color: 'var(--ide-gutter-fg)',
            border: 'none',
          },
          // 行号右对齐并留出 IDEA 那样的左侧缩进
          '.cm-lineNumbers .cm-gutterElement': { paddingLeft: '14px', paddingRight: '4px' },
          // 折叠标记：可折叠行显示箭头，不可折叠处留白
          '.cm-foldGutter .cm-gutterElement': { color: 'var(--ide-gutter-fg)', padding: '0 2px', cursor: 'pointer' },
          '.cm-foldGutter .cm-gutterElement:hover': { color: 'var(--ide-syn-text)' },
          '.cm-activeLine': { backgroundColor: 'var(--ide-active-line-bg)' },
          '.cm-activeLineGutter': { backgroundColor: 'var(--ide-active-line-bg)', color: 'var(--ide-syn-text)' },
          '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
            backgroundColor: 'var(--ide-selection-bg)',
          },
          '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--ide-caret)' },
          '.cm-content': { padding: '4px 0' },
          '.cm-tooltip': {
            backgroundColor: 'var(--dsw-alias-bg-overlay)',
            border: '1px solid var(--dsw-alias-border-l2)',
          },
        }),
        metrics.of([
          EditorState.tabSize.of(options.tabSize),
          EditorView.theme({ '&': { fontSize: `${String(options.fontSize)}px` } }),
        ]),
        readOnly.of(options.readOnly ? EditorState.readOnly.of(true) : []),
        language.of([]),
      ],
    }),
  })

  // 语言包异步到位后通过 compartment 注入，不重建视图，滚动位置与游标都保留
  void languageFor(options.path).then((extensions) => {
    if (extensions.length === 0) return

    try {
      view.dispatch({ effects: language.reconfigure(extensions) })
    } catch (error) { // 视图已销毁时 reconfigure 会抛错，属于正常竞态
      console.error('[dsh-ide] 注入语法高亮失败:', error)
    }
  })

  return {
    setValue(text: string) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } })
    },
    getValue() {
      return view.state.doc.toString()
    },
    revealLine(line: number) {
      const target = Math.min(Math.max(line, 1), view.state.doc.lines)
      const position = view.state.doc.line(target)

      view.dispatch({ selection: { anchor: position.from }, effects: EditorView.scrollIntoView(position.from, { y: 'center' }) })
      view.focus()
    },
    openSearch() {
      openSearchPanel(view)
      view.focus()
    },
    setReadOnly(value: boolean) {
      view.dispatch({ effects: readOnly.reconfigure(value ? EditorState.readOnly.of(true) : []) })
    },
    setMetrics(fontSize: number, tabSize: number) {
      view.dispatch({
        effects: metrics.reconfigure([
          EditorState.tabSize.of(tabSize),
          EditorView.theme({ '&': { fontSize: `${String(fontSize)}px` } }),
        ]),
      })
    },
    destroy() {
      view.destroy()
    },
  }
}

/** chunk 的默认导出。 */
const module: EditorKernelModule = { create }

export default module
