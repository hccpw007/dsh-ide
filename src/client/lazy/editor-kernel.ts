/**
 * 编辑器内核：CodeMirror 6 的封装。
 *
 * 本文件属于懒加载 chunk，不进主 bundle。它只暴露 `client/lazy/editor-api.ts` 里声明
 * 的窄接口，把 CodeMirror 的扩展装配（语言、搜索、快捷键、主题）全部留在 chunk 内，
 * 主 bundle 因此不需要认识任何 CodeMirror 类型。
 *
 * 语言按扩展名动态加载：`.ts` 走 TypeScript 解析、`.json` 走 JSON、`.css` 走 CSS，
 * 其余落到无高亮的纯文本。语法包本身也在 chunk 里，按需 `import()` 拆成子块。
 *
 * 语言装配与「整篇离线高亮」放在 `language-support.ts`：差异视图与编辑器共用同一份
 * 装配结果，配色与解析行为不会出现两套。
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
import { EditorState, Compartment, StateEffect, StateField, type Extension, type Range } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view'
import { tags as t } from '@lezer/highlight'

import type { SyntaxLines } from '../../common/syntax-highlight'

import type { EditorKernel, EditorKernelModule, EditorKernelOptions, EditorMarkRange } from './editor-api'
import { languageOf, syntaxLinesOf } from './language-support'

/** 结果栏的标记：已移入的行区间 + 内容为空的插入点。 */
interface MergeMarks {
  /** 已移入内容、需要圈出的行区间。 */
  applied: EditorMarkRange[]
  /** 内容为空的位置（0 起行号）。 */
  slots: number[]
}

/** 更新结果栏标记的 effect。 */
const setMarksEffect = StateEffect.define<MergeMarks>()



/**
 * 结果栏的标记区间。
 *
 * 文档一变动行号就失效（用户可能手动删掉几行），这时直接清空最安全：
 * 合并窗口每次布局变化都会重新下发一遍标记，不会长期缺标记。
 */
const marksField = StateField.define<MergeMarks>({
  create: () => ({ applied: [], slots: [] }),
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setMarksEffect)) return effect.value
    }

    return tr.docChanged ? { applied: [], slots: [] } : value
  },
  provide: (field) =>
    EditorView.decorations.compute([field], (state) => {
      const marks = state.field(field)
      const decorations: Range<Decoration>[] = []

      for (const range of marks.applied) {
        const first = Math.max(1, range.start + 1)
        const last = Math.min(state.doc.lines, Math.max(first, range.end))

        for (let line = first; line <= last; line += 1) {
          const classes = ['cm-merge-mark']

          // 首尾行各补一条横边，中间行只有左右两边，合起来就是一个完整的虚线框
          if (line === first) classes.push('cm-merge-mark-top')
          if (line === last) classes.push('cm-merge-mark-bottom')

          decorations.push(Decoration.line({ class: classes.join(' ') }).range(state.doc.line(line).from))
        }
      }

      // 插入点画成某一行的上/下边框阴影：不新增行、不占布局，也就不会多出一个空行。
      // 位置在文档中间时画在下一行的上边，在末尾时画在最后一行的下边。
      for (const slot of marks.slots) {
        const last = state.doc.lines

        if (slot < last) {
          decorations.push(Decoration.line({ class: 'cm-merge-slot-top' }).range(state.doc.line(slot + 1).from))

          continue
        }

        decorations.push(Decoration.line({ class: 'cm-merge-slot-bottom' }).range(state.doc.line(last).from))
      }

      return Decoration.set(decorations)
    }),
})

/**
 * 按扩展名取语言扩展。
 * @param path 文件路径
 * @returns 语言扩展；未知扩展名或加载失败时为空数组（纯文本）
 */
async function languageFor(path: string): Promise<Extension[]> {
  return (await languageOf(path))?.extensions ?? []
}

/**
 * 对整篇文本做语法高亮，供差异视图复用同一套语言与配色。
 * @param path 文件路径，决定用哪种语言解析
 * @param text 文本
 * @returns 按行索引的语法片段；不支持的类型返回空数组
 */
async function highlight(path: string, text: string): Promise<SyntaxLines> {
  const binding = await languageOf(path)

  return binding === null ? [] : syntaxLinesOf(text, binding.language)
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
  /*
   * Markdown：@lezer/markdown 把标题拆成 heading1..heading6 六个独立 tag，
   * 只写 t.heading 一个都匹配不到，标题因此完全没有样式。这里逐个列出，
   * 并给标记符号（#、**、-、>、```）压成注释灰、行内代码与代码块用字符串绿，
   * 让 Markdown 也像 IDEA 那样有层次，而不是整屏同色的正文。
   */
  {
    tag: [t.heading, t.heading1, t.heading2, t.heading3, t.heading4, t.heading5, t.heading6],
    fontWeight: 'bold',
    color: 'var(--ide-syn-heading)',
  },
  { tag: [t.processingInstruction, t.contentSeparator], color: 'var(--ide-syn-comment)' },
  // 引用整段压灰；顺序必须排在行内代码之前，否则引用里的 `code` 也会被染成灰色
  { tag: [t.quote], color: 'var(--ide-syn-comment)' },
  { tag: [t.monospace, t.labelName], color: 'var(--ide-syn-string)' },
  { tag: [t.emphasis], fontStyle: 'italic' },
  { tag: [t.strong], fontWeight: 'bold' },
  { tag: [t.strikethrough], textDecoration: 'line-through' },
  { tag: [t.invalid], color: 'var(--ide-syn-invalid)' },
])

/**
 * 取视口顶部的行号。
 * @param view 编辑器视图
 * @returns 顶部可见行（1 起）
 */
function topLineOf(view: EditorView): number {
  const rect = view.scrollDOM.getBoundingClientRect()
  // 用视口左上角反查文档位置：visibleRanges 带 overscan，顶部行会偏出好几行
  const position = view.posAtCoords({ x: rect.left + 1, y: rect.top + 1 })

  return position === null ? 1 : view.state.doc.lineAt(position).number
}

/**
 * 求两段文本真正变化的中间段。
 *
 * 远端同步时如果整篇替换，光标与滚动位置都会被重置；先剥掉公共前后缀，
 * 只把差异部分交给 CodeMirror，用户的选区就能被正确映射到新位置。
 * @param current 当前文本
 * @param next 目标文本
 * @returns 起始偏移、当前文本的结束偏移与目标文本的结束偏移
 */
function changedRange(current: string, next: string): { start: number; endCurrent: number; endNext: number } {
  const limit = Math.min(current.length, next.length)
  let start = 0

  while (start < limit && current.charCodeAt(start) === next.charCodeAt(start)) start += 1

  let endCurrent = current.length
  let endNext = next.length

  while (endCurrent > start && endNext > start && current.charCodeAt(endCurrent - 1) === next.charCodeAt(endNext - 1)) {
    endCurrent -= 1
    endNext -= 1
  }

  return { start, endCurrent, endNext }
}

/**
 * 创建编辑器实例。
 * @param options 创建参数
 * @returns 内核实例
 */
async function create(options: EditorKernelOptions): Promise<EditorKernel> {
  const language = new Compartment()
  const readOnly = new Compartment()
  const metrics = new Compartment()
  /** 是否正在写入其它承载面传来的文本：这种更新不再回传 onChange。 */
  let applyingRemote = false

  /**
   * 待回传的最新文档状态。
   *
   * 每次击键都做一次 `doc.toString()` 是 O(n)，长文件上输入成本随文件大小线性增长；
   * 合并到一帧一次后，连续输入（含输入法上屏、连续粘贴）只取一次快照。
   */
  let latestState: EditorState | null = null
  /** 已排队的内容回传帧；null 表示没有待回传的变化。 */
  let changeFrame: number | null = null
  /** 已排队的滚动上报帧。 */
  let scrollFrame: number | null = null
  /** 待上报的视图；同一帧内只取最后一个。 */
  let scrollView: EditorView | null = null

  /**
   * 按帧合并滚动上报。
   *
   * 上报需要读一次几何位置（`getBoundingClientRect` + `posAtCoords`），逐帧读会
   * 在滚动时反复触发强制布局；合并到一帧一次即可，跨承载面的跟随肉眼无差别。
   * @param target 发生视口变化的视图
   */
  function scheduleScrollReport(target: EditorView): void {
    scrollView = target

    if (scrollFrame !== null) return

    scrollFrame = window.requestAnimationFrame(() => {
      scrollFrame = null

      const view = scrollView
      scrollView = null

      if (view !== null) options.onScroll(topLineOf(view))
    })
  }

  /**
   * 登记一次内容变化，按帧合并后回传给宿主组件。
   * @param state 本次更新后的编辑器状态
   */
  function scheduleChange(state: EditorState): void {
    latestState = state

    if (changeFrame !== null) return

    changeFrame = window.requestAnimationFrame(() => {
      changeFrame = null

      const latest = latestState
      latestState = null

      if (latest !== null) options.onChange(latest.doc.toString())
    })
  }

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
        marksField,
        EditorView.updateListener.of((update) => {
          // 其它承载面同步过来的文本不再回传，否则两端会把对方的输入当成新改动来回弹
          if (update.docChanged && !applyingRemote) scheduleChange(update.state)

          // 视口变化即滚动位置变化：上报顶部行号，供其它承载面跟随
          if (update.viewportChanged) scheduleScrollReport(update.view)
        }),
        // 配色走 --ide-* 变量：明暗主题各一套值，切换时无需重建视图
        EditorView.theme({
          '&': {
            fontSize: `${String(options.fontSize)}px`,
            backgroundColor: 'transparent',
            color: 'var(--ide-syn-text)',
            height: '100%',
          },
          '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
          '.cm-gutters': {
            // 行号区必须自带不透明底色：它是 sticky 定位，横向滚动时正文会滑到它下面，
            // 透明底会直接透出代码字符，与行号叠在一起
            backgroundColor: 'var(--ide-code-bg)',
            color: 'var(--ide-gutter-fg)',
            // 只保留右边一条分隔线，行号区不再有上下边框
            border: 'none',
            borderRight: '1px solid var(--ide-gutter-border)',
          },
          // 行号右对齐并留出 IDEA 那样的左侧缩进
          '.cm-lineNumbers .cm-gutterElement': { paddingLeft: '14px', paddingRight: '4px' },
          // 折叠标记：可折叠行显示箭头，不可折叠处留白
          '.cm-foldGutter .cm-gutterElement': { color: 'var(--ide-gutter-fg)', padding: '0 2px', cursor: 'pointer' },
          '.cm-foldGutter .cm-gutterElement:hover': { color: 'var(--ide-syn-text)' },

          // 活动行底色必须画在选区层之下：选区层是 z-index 为负的绝对定位层，
          // 行上直接设不透明底色会把行内选区整块盖住。跨行选中时只有光标所在行被盖，
          // 其余行照常显色，看起来就成了「跨行有底色、单行选几个字符没底色」
          '.cm-activeLine': { backgroundColor: 'transparent', position: 'relative' },
          '.cm-activeLine::before': {
            content: '""',
            position: 'absolute',
            inset: '0',
            zIndex: '-3',
            backgroundColor: 'var(--ide-active-line-bg)',
            pointerEvents: 'none',
          },
          '.cm-activeLineGutter': { backgroundColor: 'var(--ide-active-line-bg)', color: 'var(--ide-syn-text)' },
          // 选区：CodeMirror 的默认焦点态选择器特异性很高（#d7d4f0 淡紫），
          // 只在 `.cm-selectionBackground` 上设色会被它盖掉，必须用同结构的规则覆盖
          '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
            backgroundColor: 'var(--ide-selection-bg)',
          },
          '& > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
            backgroundColor: 'var(--ide-selection-bg)',
          },
          // 非 drawSelection 路径（如输入法候选）下的原生选区
          '& ::selection': { backgroundColor: 'var(--ide-selection-bg)' },
          '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--ide-caret)' },
          '.cm-content': { padding: '4px 0' },
          '.cm-tooltip': {
            backgroundColor: 'var(--dsw-alias-bg-overlay)',
            border: '1px solid var(--dsw-alias-border-l2)',
          },
        }),
        // 字号与行距合在 metrics 里：设置页改动只需 reconfigure 这一段，不必重建视图
        metrics.of([
          EditorState.tabSize.of(options.tabSize),
          EditorView.theme({
            '&': { fontSize: `${String(options.fontSize)}px` },
            '.cm-scroller': { lineHeight: String(options.lineHeight) },
          }),
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
    applyText(text: string) {
      const current = view.state.doc.toString()
      if (current === text) return

      const { start, endCurrent, endNext } = changedRange(current, text)

      applyingRemote = true

      try {
        view.dispatch({ changes: { from: start, to: endCurrent, insert: text.slice(start, endNext) } })
      } finally {
        applyingRemote = false
      }
    },
    getTopLine() {
      return topLineOf(view)
    },
    setTopLine(line: number) {
      const target = Math.min(Math.max(line, 1), view.state.doc.lines)

      view.dispatch({ effects: EditorView.scrollIntoView(view.state.doc.line(target).from, { y: 'start' }) })
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
    setMarks(ranges: EditorMarkRange[], slots: number[]) {
      view.dispatch({ effects: setMarksEffect.of({ applied: ranges, slots }) })
    },
    setMetrics(fontSize: number, lineHeight: number, tabSize: number) {
      view.dispatch({
        effects: metrics.reconfigure([
          EditorState.tabSize.of(tabSize),
          EditorView.theme({
            '&': { fontSize: `${String(fontSize)}px` },
            '.cm-scroller': { lineHeight: String(lineHeight) },
          }),
        ]),
      })
    },
    destroy() {
      // 卸载时撤销待回传的帧，避免回调落到已经销毁的视图上
      if (changeFrame !== null) window.cancelAnimationFrame(changeFrame)
      if (scrollFrame !== null) window.cancelAnimationFrame(scrollFrame)

      changeFrame = null
      scrollFrame = null
      scrollView = null
      latestState = null
      view.destroy()
    },
  }
}

/** chunk 的默认导出。 */
const module: EditorKernelModule = { create, highlight }

export default module
