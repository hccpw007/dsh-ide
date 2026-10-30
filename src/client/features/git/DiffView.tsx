/**
 * 差异视图。
 *
 * 与 IDEA 的差异页对齐：工具栏含差异块导航、编辑器入口、文件导航、差异数量、
 * 布局切换与设置；正文是带行号、词级高亮与折叠段的并排/行内差异。
 *
 * 三种差异来源（工作区与 HEAD、两个提交、两个文件）共用这一个组件：Git 面板的
 * 内嵌差异、Commit 弹窗与编辑器里的差异标签渲染的都是它，观感与交互因此只有一份。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

import { cn } from '../../../common/cn'
import { diffSourceId, loadDiffData, type DiffData, type DiffSource } from '../../../common/diff-source'
import type { SyntaxLines } from '../../../common/syntax-highlight'
import type { Translate } from '../../../types/plugin'
import type { IdeServices } from '../../shell/contract'
import { highlightLines } from '../../lazy/highlight'

import { changeStarts, computeDiffRows, type DiffRow } from './diff-model'
import { DiffTable, InlineDiff } from './DiffTable'
import { DiffToolbar, type DiffMode } from './DiffToolbar'
import { lockIcon } from './icons'
import { ContextMenu, type MenuItem, type MenuState } from './menu'

/** 差异视图 props。 */
export interface DiffViewProps {
  /** 已绑定前缀的翻译函数。 */
  t: Translate
  /** 工作台服务总线。 */
  services: IdeServices
  /** 工作区根。 */
  root: string
  /** 当前查看的差异来源；null 时显示空态。 */
  source: DiffSource | null
  /** 同组可见差异，用于「2/2 files」导航。 */
  files: DiffSource[]
  /** 切换到另一处差异；只有一处时不会触发。 */
  onSelect?(source: DiffSource): void
  /** 关闭差异视图。 */
  onClose(): void
  /** 变更组数量或写操作后递增，触发重新取数；无写操作的调用方可省略。 */
  revision?: number
  /** HEAD 短 hash，显示在工作区差异的标题里。 */
  headShort?: string
}

/** 差异取数状态。 */
type LoadState =
  | { kind: 'empty' }
  | { kind: 'loading' }
  | { kind: 'binary' }
  | { kind: 'too-large'; bytes: number }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; rows: DiffRow[]; data: DiffData }

/** 两侧语法高亮片段，按行号索引。 */
interface DiffSyntax {
  /** 旧侧片段。 */
  left: SyntaxLines
  /** 新侧片段。 */
  right: SyntaxLines
}

/** 尚无高亮结果时的空值。 */
const NO_SYNTAX: DiffSyntax = { left: [], right: [] }

/**
 * 差异视图一次渲染的行数上限。
 *
 * 宿主允许 2 MiB 的差异文本，换算成行可达数万；并排模式还要渲染两栏，
 * 一次全量挂载会让主线程阻塞数秒。超出部分不渲染并在顶部提示。
 */
const MAX_DIFF_RENDERED_ROWS = 2000

/** 提交标识的缩写长度：与宿主的 `git log --abbrev=8` 一致，同一提交在两处显示同一个短 hash。 */
const SHORT_HASH_LENGTH = 8

/**
 * 把提交标识缩成短 hash。
 *
 * 引用名（HEAD、分支名、`HEAD~2`）保持原样：它们本来就短，截断反而丢含义。
 * @param ref 提交标识
 * @returns 短 hash 或原样的引用名
 */
function shortRef(ref: string): string {
  return /^[0-9a-f]{9,}$/i.test(ref) ? ref.slice(0, SHORT_HASH_LENGTH) : ref
}

/**
 * 差异来源对应的文件路径：用于语法高亮与「在编辑器中打开」。
 * @param source 差异来源
 * @returns 相对路径；没有具体文件时为空串
 */
function sourcePath(source: DiffSource): string {
  if (source.kind === 'worktree') return source.path
  if (source.kind === 'commits') return source.path ?? ''

  return source.right
}

/**
 * 渲染差异。
 * @param props 见 DiffViewProps
 * @returns 工具栏、标题与逐行差异
 */
export function DiffView({
  t,
  services,
  root,
  source,
  files,
  onSelect,
  onClose,
  revision = 0,
  headShort = '',
}: DiffViewProps): React.ReactElement {
  const [state, setState] = useState<LoadState>({ kind: 'empty' })
  const [mode, setMode] = useState<DiffMode>('side-by-side')
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false)
  const [ignoreCase, setIgnoreCase] = useState(false)
  const [menu, setMenu] = useState<MenuState | null>(null)
  /** 两侧语法高亮；解析到位前为空，正文先以默认色显示。 */
  const [syntax, setSyntax] = useState<DiffSyntax>(NO_SYNTAX)
  /** 当前差异块序号，供上下箭头循环跳转。 */
  const [changeIndex, setChangeIndex] = useState(-1)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  /** 并排模式左右两栏的滚动容器：两栏各自横向滚动，垂直方向互相跟随。 */
  const leftPaneRef = useRef<HTMLDivElement>(null)
  const rightPaneRef = useRef<HTMLDivElement>(null)
  /** 上次套用默认布局的来源键，用于只在切换来源时重置布局：改忽略选项或刷新不应打断已选布局。 */
  const layoutSourceRef = useRef('')

  // 订阅设置：字号与行距改了要立刻作用到 diff 正文；不订阅时组件不重渲染，正文停在旧度量
  const settings = useSyncExternalStore(
    (listener) => services.subscribeSettings(listener),
    () => services.settings(),
    () => services.settings(),
  )
  const fontSize = settings.fontSize
  const lineHeight = settings.lineHeight

  // 来源或写操作变化后重新取数；折叠状态一并重置，避免把旧下标套到新内容上
  useEffect(() => {
    if (source === null) {
      setState({ kind: 'empty' })

      return
    }

    let alive = true

    setState({ kind: 'loading' })
    setChangeIndex(-1)
    setSyntax(NO_SYNTAX)

    void loadDiffData(source, root)
      .then(async (result) => {
        if (!alive) return

        if ('tooLarge' in result) {
          setState({ kind: 'too-large', bytes: result.tooLarge })

          return
        }

        if (result.binary) {
          setState({ kind: 'binary' })

          return
        }

        const rows = await computeDiffRows(result.left, result.right, { ignoreWhitespace, ignoreCase })

        if (!alive) return

        setState({ kind: 'ready', rows, data: result })

        // 未提交过的新文件（HEAD 里没有该路径）没有旧版本，并排比较只剩空左栏：默认切到单列，
        // 与 IDEA 对未纳入版本控制文件的展示一致
        const sourceKey = diffSourceId(source)
        if (layoutSourceRef.current !== sourceKey) {
          layoutSourceRef.current = sourceKey
          setMode(result.isNew ? 'inline' : 'side-by-side')
        }

        // 高亮比差异计算慢，单独一轮补齐：先让正文出现，颜色到位后再覆盖，
        // 打开面板时不必等语法解析
        const path = sourcePath(source)
        void Promise.all([highlightLines(path, result.left), highlightLines(path, result.right)])
          .then(([left, right]) => {
            if (!alive) return

            setSyntax({ left, right })
          })
          .catch((error: unknown) => {
            console.error('[dsh-ide] Git 差异语法高亮失败:', error)
          })
      })
      .catch((error: unknown) => {
        console.error('[dsh-ide] Failed to load Git diff:', error)
        if (alive) setState({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
      })

    return () => {
      alive = false
    }
  }, [ignoreCase, ignoreWhitespace, revision, root, source])

  const rows = state.kind === 'ready' ? state.rows : []
  /** 实际渲染的行；超过上限时只取前一段，避免一次挂载数万个节点。 */
  const visibleRows = useMemo(
    () => (rows.length > MAX_DIFF_RENDERED_ROWS ? rows.slice(0, MAX_DIFF_RENDERED_ROWS) : rows),
    [rows],
  )
  // 变更位置按实际渲染的行计算，否则「下一处差异」可能跳到没有渲染的行上
  const starts = useMemo(() => changeStarts(visibleRows), [visibleRows])

  /**
   * 跳到上一处 / 下一处差异。
   * @param step 方向
   */
  const gotoChange = useCallback(
    (step: 1 | -1): void => {
      if (starts.length === 0) return

      const next = (changeIndex + step + starts.length) % starts.length
      setChangeIndex(next)

      // 并排模式滚左栏，右栏由两栏之间的滚动同步跟上；单栏模式由外层容器统一滚动
      const scroller = mode === 'side-by-side' ? leftPaneRef.current : scrollRef.current
      const target = scroller?.querySelector<HTMLElement>(`[data-row="${String(starts[next])}"]`)
      if (scroller === null || scroller === undefined || target === null || target === undefined) return

      // 只在差异正文内部滚动：scrollIntoView 会连带滚动宿主会话区，面板变矮时会把整个工作台顶出视口
      const scrollerRect = scroller.getBoundingClientRect()
      const targetRect = target.getBoundingClientRect()
      const offset = targetRect.top - scrollerRect.top - (scroller.clientHeight - targetRect.height) / 2

      scroller.scrollTo({ top: scroller.scrollTop + offset, behavior: 'smooth' })
    },
    [changeIndex, mode, starts],
  )

  /** 当前来源在同组里的下标；-1 表示不在列表中。 */
  const fileIndex = useMemo(() => {
    if (source === null) return -1

    const key = diffSourceId(source)

    return files.findIndex((item) => diffSourceId(item) === key)
  }, [files, source])

  /**
   * 切换到相邻差异。
   * @param step 方向
   */
  const gotoFile = useCallback(
    (step: 1 | -1): void => {
      if (files.length === 0 || fileIndex < 0) return

      const target = files[(fileIndex + step + files.length) % files.length]
      if (target !== undefined) onSelect?.(target)
    },
    [fileIndex, files, onSelect],
  )

  /** 打开差异设置菜单。 */
  const openSettings = useCallback(
    (event: React.MouseEvent): void => {
      const items: MenuItem[] = [
        {
          id: 'whitespace',
          label: `${ignoreWhitespace ? '✓ ' : ''}${t('ignoreWhitespace')}`,
          run: () => setIgnoreWhitespace((previous) => !previous),
        },
        {
          id: 'case',
          label: `${ignoreCase ? '✓ ' : ''}${t('ignoreCase')}`,
          run: () => setIgnoreCase((previous) => !previous),
        },
      ]

      setMenu({ x: event.clientX - 150, y: event.clientY + 12, items })
    },
    [ignoreCase, ignoreWhitespace, t],
  )

  /** 在编辑器里打开当前差异对应的文件；没有具体文件时不响应。 */
  const openInEditor = useCallback((): void => {
    if (source === null) return

    const path = sourcePath(source)
    if (path === '') return

    services.openFile(path)
  }, [services, source])

  /** 差异标题两侧的版本说明：工作区来源按 IDEA 的方式标 HEAD 与当前版本。 */
  const ready = state.kind === 'ready' ? state.data : null
  const filePath = source === null ? '' : sourcePath(source)
  const canOpenInEditor = filePath !== ''

  return (
    <div className="flex h-full min-h-0 flex-col bg-code">
      {source !== null && (
        <DiffToolbar
          t={t}
          mode={mode}
          changeCount={starts.length}
          fileCount={files.length}
          fileIndex={fileIndex}
          onPreviousChange={() => gotoChange(-1)}
          onNextChange={() => gotoChange(1)}
          onPreviousFile={() => gotoFile(-1)}
          onNextFile={() => gotoFile(1)}
          // 「在编辑器中打开」在没有具体文件时不可用：把按钮置灰比点了没反应清楚
          canOpenInEditor={canOpenInEditor}
          onOpenInEditor={openInEditor}
          onClose={onClose}
          onSettings={openSettings}
          onModeChange={setMode}
        />
      )}

      {source !== null && ready !== null && (
        // 差异标题：新增文件没有旧版本，只标出当前版本；其余给出比较基准与两侧版本名
        <div className="flex h-7 shrink-0 items-center gap-1.5 bg-code px-2 text-[11px]">
          {source.kind === 'worktree' ? (
            ready.isNew ? (
              <>
                {/* 新增文件：只标当前版本 */}
                <span className="shrink-0 font-mono text-primary">{t('currentVersion')}</span>

                <span className="min-w-0 flex-1 truncate text-secondary">{source.path}</span>
              </>
            ) : (
              <>
                {lockIcon()}

                {/* 比较基准：HEAD 的短 hash，与 IDEA 一致 */}
                <span className="font-mono text-secondary">{headShort === '' ? 'HEAD' : headShort}</span>

                <span className="min-w-0 flex-1 truncate text-primary">{source.path}</span>

                {/* 右侧版本名：与差异表格内的列标题对齐 */}
                <span className="shrink-0 text-[11px] text-secondary">
                  {source.staged ? 'Index version' : t('currentVersion')}
                </span>
              </>
            )
          ) : (
            <>
              {/* 两侧版本名：提交之间只给短 hash，与 Git 面板一致；文件之间则给各自的文件名 */}
              <span className="min-w-0 flex-1 truncate font-mono text-secondary">
                {source.kind === 'commits' ? shortRef(source.from) : ready.leftTitle}
              </span>

              <span className="shrink-0 text-secondary">↔</span>

              <span className="min-w-0 flex-1 truncate text-right font-mono text-primary">
                {source.kind === 'commits' ? shortRef(source.to) : ready.rightTitle}
              </span>
            </>
          )}
        </div>
      )}

      {state.kind === 'empty' && (
        <div className="flex flex-1 items-center justify-center p-6 text-xs text-secondary">{t('selectFile')}</div>
      )}

      {state.kind === 'loading' && <div className="p-3 text-xs text-secondary">{t('loading')}</div>}

      {state.kind === 'error' && <div className="p-3 text-xs text-danger">{state.message || t('loadFailed')}</div>}

      {state.kind === 'binary' && <div className="p-3 text-xs text-secondary">{t('binaryFile')}</div>}

      {state.kind === 'too-large' && (
        <div className="p-3 text-xs text-warn">
          {/* 超过上限时给出实际大小，而不是静默不显示 */}
          {t('tooLarge')} ({(state.bytes / 1024 / 1024).toFixed(1)} MiB)
        </div>
      )}

      {state.kind === 'ready' && rows.length === 0 && (
        <div className="p-3 text-xs text-secondary">{t('identical')}</div>
      )}

      {state.kind === 'ready' && rows.length > 0 && (
        // 差异正文属于内容区：全局禁选之下单独放开，便于复制代码片段
        // 字号与行距由设置决定并在此继承给表格：设置页改完立刻作用到 diff 正文
        // 并排模式由左右两栏各自滚动，这一层只负责占位；单栏模式才由它统一滚动
        // overscroll-contain 把滚动留在正文内：链路传到外层会把整个工作台连同左侧图标栏一起顶走
        <div
          ref={scrollRef}
          className={cn(
            'ide-selectable min-h-0 flex-1',
            mode === 'side-by-side' ? 'overflow-hidden' : 'overflow-auto overscroll-contain pb-2',
          )}
          style={{ fontSize: `${String(fontSize)}px`, lineHeight }}
        >
          {rows.length > visibleRows.length && (
            <div className="px-3 py-1.5 text-xs text-secondary">{t('diffTruncated')}</div>
          )}

          {mode === 'side-by-side' ? (
            <DiffTable
              rows={visibleRows}
              leftSyntax={syntax.left}
              rightSyntax={syntax.right}
              // 行高按字号与倍率折算成像素：空行也要占同样的高度，两栏才能逐行对齐
              rowHeight={fontSize * lineHeight}
              leftRef={leftPaneRef}
              rightRef={rightPaneRef}
            />
          ) : (
            <InlineDiff rows={visibleRows} leftSyntax={syntax.left} rightSyntax={syntax.right} />
          )}
        </div>
      )}

      {menu !== null && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </div>
  )
}
