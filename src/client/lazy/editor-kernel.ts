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
import { bracketMatching, indentOnInput, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
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
        highlightActiveLineGutter(),
        highlightActiveLine(),
        drawSelection(),
        history(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        highlightSelectionMatches(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
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
          indentWithTab,
        ]),
        completionKeys,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) options.onChange(update.state.doc.toString())

          if (update.selectionSet || update.docChanged) {
            const head = update.state.selection.main.head
            const line = update.state.doc.lineAt(head)
            options.onCursor(line.number, head - line.from + 1)
          }
        }),
        // 主题只用宿主令牌，明暗切换由变量值驱动，无需重建视图
        EditorView.theme({
          '&': {
            fontSize: `${String(options.fontSize)}px`,
            backgroundColor: 'transparent',
            color: 'var(--dsw-alias-label-primary)',
            height: '100%',
          },
          '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', lineHeight: '1.6' },
          '.cm-gutters': {
            backgroundColor: 'transparent',
            color: 'var(--dsw-alias-label-secondary)',
            border: 'none',
          },
          '.cm-activeLine': { backgroundColor: 'var(--dsw-alias-bg-layer-2)' },
          '.cm-activeLineGutter': { backgroundColor: 'var(--dsw-alias-bg-layer-2)' },
          '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
            backgroundColor: 'var(--dsw-alias-bg-layer-2)',
          },
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
