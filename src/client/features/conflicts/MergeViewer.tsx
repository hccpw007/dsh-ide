/**
 * 三栏合并窗口的正文。
 *
 * 复刻 IDEA 的 Merge Revisions：左侧是当前分支的版本、中间是结果、右侧是正在合进来的版本。
 * 结果栏一开始是空的，点两侧箭头才把对应内容送进来，点箭头旁的叉表示不要这一侧；
 * 两侧都点则两份内容依次叠加，因此接受不是二选一。
 *
 * 三栏共用一套行号节奏：滚动任一栏，另外两栏按同一比例跟随，长文件里三边始终看得见同一段。
 * 中间栏复用编辑器内核（CodeMirror，懒加载），可以手工编辑最终结果。
 * 窗口外框（标题栏、拖动、缩放）由 MergeWindow 提供，这里只管窗口内容。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

import { cn } from '../../../common/cn'
import type { SyntaxLines } from '../../../common/syntax-highlight'
import type { Translate } from '../../../types/plugin'
import type { IdeServices } from '../../shell/contract'
import type { EditorKernel, EditorMarkRange } from '../../lazy/editor-api'
import { highlightLines } from '../../lazy/highlight'
import { loadLazyChunk } from '../../lazy/loader'

import { readConflictInfo, readConflictVersions, resolveConflictFile } from '../git/api'
import { lockIcon } from '../git/icons-ui'

import { MergePane } from './MergePanes'
import { MergeToolbar } from './MergeToolbar'
import {
  applyAllBlocks,
  applyNonConflicting,
  applySide,
  createLayout,
  layoutText,
  parseMergeModel,
  relocateLayout,
  simpleChoice,
  unresolvedCount as countUnresolved,
  type MergeLayout,
  type MergeModel,
  type MergeSide,
} from './merge-model'

/** 编辑器懒加载模块的形状。 */
interface EditorChunk {
  create(options: {
    parent: HTMLElement
    path: string
    doc: string
    readOnly: boolean
    fontSize: number
    lineHeight: number
    tabSize: number
    onChange(text: string): void
    onSave(): void
  }): EditorKernel
}

/** 尚无语法高亮时的空值。 */
const NO_SYNTAX: { ours: SyntaxLines; theirs: SyntaxLines } = { ours: [], theirs: [] }

/**
 * 三栏合并的规模上限（字符）。
 *
 * 打开窗口要同步解析三方全文、构建结果栏布局并对两侧做整篇高亮；5 MB 的冲突文件
 * 会让打开动作卡住半秒以上。超过上限直接提示改用文本编辑器，而不是让界面僵住。
 */
const MAX_MERGE_CHARS = 2 * 1024 * 1024

/** 三栏合并正文 props。 */
export interface MergeViewerProps {
  /** 已绑定 conflicts 前缀的翻译函数。 */
  t: Translate
  /** 工作台服务总线。 */
  services: IdeServices
  /** 冲突文件相对工作区根的路径。 */
  path: string
  /** 关闭合并窗口。 */
  onClose(): void
}

/**
 * 渲染三栏合并窗口的正文。
 * @param props 见 MergeViewerProps
 * @returns 工具条、三栏正文与底部操作
 */
export function MergeViewer({ t, services, path, onClose }: MergeViewerProps): React.ReactElement {
  // 工作区根由宿主提供，可能在窗口打开后切换会话
  const root = useSyncExternalStore(
    (listener) => services.subscribeRoot(listener),
    () => services.root,
    () => services.root,
  )
  const settings = services.settings()

  const [model, setModel] = useState<MergeModel | null>(null)
  const [layout, setLayout] = useState<MergeLayout | null>(null)
  /** 左右栏标题里的引用名：左边是当前分支，右边是对方提交的短号。 */
  const [refs, setRefs] = useState({ ours: '', theirs: '' })
  const [syntax, setSyntax] = useState(NO_SYNTAX)
  const [errorText, setErrorText] = useState('')
  const [busy, setBusy] = useState(false)
  /** 当前冲突块序号，供上下导航使用。 */
  const [current, setCurrent] = useState(0)

  const hostRef = useRef<HTMLDivElement | null>(null)
  const kernelRef = useRef<EditorKernel | null>(null)
  /** 左右两栏的滚动容器；中间栏是 CodeMirror 的 scroller，创建后另行取。 */
  const oursScrollRef = useRef<HTMLDivElement | null>(null)
  const theirsScrollRef = useRef<HTMLDivElement | null>(null)
  /** 正在同步滚动：避免三栏互相触发形成回环。 */
  const syncingScroll = useRef(false)

  /** 收集两栏的滚动容器；ref 回调要稳定，否则每次渲染都会先置空再赋值。 */
  const setOursScroll = useCallback((element: HTMLDivElement | null) => {
    oursScrollRef.current = element
  }, [])
  const setTheirsScroll = useCallback((element: HTMLDivElement | null) => {
    theirsScrollRef.current = element
  }, [])

  // 读取三方内容与双方引用：窗口一打开就把结果栏摆成空白占位
  useEffect(() => {
    if (root === '' || path === '') return undefined

    let alive = true

    void Promise.all([readConflictInfo(root), readConflictVersions(root, path)])
      .then(([info, versions]) => {
        if (!alive) return

        if (!versions.ok) {
          setErrorText(versions.error.message)

          return
        }

        if (versions.value.binary) {
          setErrorText(t('binaryFile'))

          return
        }

        if (
          versions.value.worktree.length > MAX_MERGE_CHARS ||
          versions.value.ours.length > MAX_MERGE_CHARS ||
          versions.value.theirs.length > MAX_MERGE_CHARS
        ) {
          setErrorText(t('tooLargeToMerge'))

          return
        }

        const parsed = parseMergeModel(versions.value.worktree)

        setErrorText('')
        setModel(parsed)
        setLayout(createLayout(parsed))

        if (info.ok) {
          setRefs({ ours: info.value.ours, theirs: info.value.theirsHash.slice(0, 8) })
        }

        // 语法高亮只影响配色，失败时按纯文本显示
        void Promise.all([
          highlightLines(path, versions.value.ours),
          highlightLines(path, versions.value.theirs),
        ]).then(([ours, theirs]) => {
          if (alive) setSyntax({ ours, theirs })
        })
      })
      .catch((error: unknown) => {
        console.error('[dsh-ide] 读取冲突文件失败:', error)

        if (alive) setErrorText(t('readFailed'))
      })

    return () => {
      alive = false
    }
  }, [path, root, t])

  /** 结果栏文本变化时的处理：只更新行，接受操作前会重新对齐块区间。 */
  const handleTextChange = useCallback((text: string): void => {
    setLayout((previous) => (previous === null ? previous : { ...previous, lines: text.split('\n') }))
  }, [])

  const changeHandlerRef = useRef(handleTextChange)
  changeHandlerRef.current = handleTextChange

  /**
   * 保存合并结果。
   * @param close 保存后是否关闭窗口
   */
  const save = useCallback(
    async (close: boolean): Promise<void> => {
      if (model === null || layout === null || busy) return

      // 结果栏里冲突块还留着空行占位，保存前必须都处理过，否则会把空行写进文件
      const remaining = countUnresolved(layout)

      if (remaining > 0) {
        services.toast('error', t('unresolvedBeforeSave').replace('{count}', String(remaining)))

        return
      }

      setBusy(true)

      try {
        const result = await resolveConflictFile(root, path, layoutText(layout))

        if (!result.ok) {
          console.error('[dsh-ide] 保存合并结果失败:', result.error)
          services.toast('error', `${t('saveFailed')}: ${result.error.message}`)

          return
        }

        services.refreshGitStatus()
        services.invalidate(path)
        services.toast('success', t('saved'))

        if (close) onClose()
      } catch (error) { // 网络层异常不会带 ApiResult，留痕后让用户重试
        console.error('[dsh-ide] 保存合并结果失败:', error)
        services.toast('error', String(error))
      } finally {
        setBusy(false)
      }
    },
    [busy, layout, onClose, path, root, services, t],
  )

  const saveRef = useRef(save)
  saveRef.current = save

  /** 最新布局：编辑器异步创建完成时用它填初始文档。 */
  const layoutRef = useRef<MergeLayout | null>(null)
  layoutRef.current = layout

  // 中间栏编辑器：布局首次就绪后挂载一次，之后一律用 setValue 同步内容
  const editorReady = layout !== null && errorText === ''

  useEffect(() => {
    const host = hostRef.current
    if (!editorReady || host === null) return undefined

    let alive = true
    let kernel: EditorKernel | null = null

    void loadLazyChunk<EditorChunk>('editor-kernel')
      .then((chunk) =>
        chunk.create({
          parent: host,
          path,
          // 初始文档直接给当前结果：异步创建期间用户已经能看到内容，不必等 setValue 补一次
          doc: layoutRef.current === null ? '' : layoutText(layoutRef.current),
          readOnly: false,
          fontSize: settings.fontSize,
          lineHeight: settings.lineHeight,
          tabSize: settings.tabSize,
          onChange: (text) => changeHandlerRef.current(text),
          onSave: () => void saveRef.current(false),
        }),
      )
      .then((created) => {
        if (!alive) {
          created.destroy()

          return
        }

        kernel = created
        kernelRef.current = created
        // 创建完成前 layout effect 已经跑过一次（当时没有内核），这里补上初始内容与标记
        if (layoutRef.current !== null) {
          created.setValue(layoutText(layoutRef.current))
          created.setMarks(appliedRanges(layoutRef.current), slotPositions(layoutRef.current))
        }
      })
      .catch((error: unknown) => {
        console.error('[dsh-ide] 合并编辑器加载失败:', error)
      })

    return () => {
      alive = false
      kernelRef.current = null
      kernel?.destroy()
    }
    // 设置项变化时重建编辑器：字号与制表宽度由内核持有，改完必须重新创建
  }, [editorReady, path, settings.fontSize, settings.lineHeight, settings.tabSize])

  // 布局内容变化（读取完成、接受、忽略、应用非冲突、重置）后同步到编辑器
  useEffect(() => {
    const kernel = kernelRef.current
    if (kernel === null || layout === null) return

    const text = layoutText(layout)

    if (kernel.getValue() !== text) kernel.setValue(text)

    // 被移进结果的块用虚线框 + 绿底圈出来；还没填内容的位置画一条线
    kernel.setMarks(appliedRanges(layout), slotPositions(layout))
  }, [layout])

  /** 中间栏的滚动容器在编辑器创建后才存在，这里按需取一次。 */
  const resultScroller = useCallback((): HTMLElement | null => {
    return hostRef.current?.querySelector('.cm-scroller') ?? null
  }, [])

  /**
   * 三栏联动滚动：按滚动比例同步另外两栏。
   * @param source 触发滚动的容器
   */
  const synchronizeScroll = useCallback(
    (source: HTMLElement | null): void => {
      if (source === null || syncingScroll.current) return

      const max = source.scrollHeight - source.clientHeight
      const ratio = max <= 0 ? 0 : source.scrollTop / max

      syncingScroll.current = true

      for (const target of [oursScrollRef.current, theirsScrollRef.current, resultScroller()]) {
        if (target === null || target === source) continue

        const targetMax = target.scrollHeight - target.clientHeight
        target.scrollTop = ratio * Math.max(targetMax, 0)
      }

      // 下一帧再解锁：同步滚动本身会再触发一轮 scroll 事件，不能当场放开
      window.requestAnimationFrame(() => {
        syncingScroll.current = false
      })
    },
    [resultScroller],
  )

  // 中间栏是 CodeMirror 自己创建的滚动容器，只能在编辑器就绪后挂监听
  useEffect(() => {
    if (!editorReady) return undefined

    const scroller = resultScroller()
    if (scroller === null) return undefined

    const onScroll = (): void => synchronizeScroll(scroller)
    scroller.addEventListener('scroll', onScroll, { passive: true })

    return () => scroller.removeEventListener('scroll', onScroll)
  }, [editorReady, resultScroller, synchronizeScroll])

  /**
   * 把某一块的某一侧放进结果，或从结果里拿掉。
   * @param index 块序号
   * @param side 侧
   * @param applied true 表示接受（放进结果），false 表示不要这一侧
   */
  const changeSide = useCallback(
    (index: number, side: MergeSide, applied: boolean): void => {
      if (model === null || layout === null) return

      setLayout(applySide(model, relocateLayout(model, layout), index, side, applied))
      setCurrent(index)
    },
    [layout, model],
  )

  /**
   * 全部冲突块按某一侧填进结果。
   * @param side 侧
   */
  const applyAll = useCallback(
    (side: MergeSide): void => {
      if (model === null || layout === null) return

      setLayout(applyAllBlocks(model, relocateLayout(model, layout), side))
      setCurrent(model.blocks.length === 0 ? 0 : model.blocks.length - 1)
    },
    [layout, model],
  )

  /** 把两侧的非冲突更改一起放进结果。 */
  const applyNonConflict = useCallback((): void => {
    if (model === null || layout === null) return

    setLayout(applyNonConflicting(model, relocateLayout(model, layout)))
  }, [layout, model])

  /** 自动解决全部简单冲突；存在语义冲突时保持原样并提示。 */
  const resolveSimple = useCallback((): void => {
    if (model === null || layout === null) return

    const sides = model.blocks.map((block) => simpleChoice(block))

    if (sides.some((side) => side === null)) {
      services.toast('info', t('simpleConflictsNone'))

      return
    }

    let next = relocateLayout(model, layout)

    sides.forEach((side, index) => {
      if (side !== null) next = applySide(model, next, index, side, true)
    })

    setLayout(next)
  }, [layout, model, services, t])

  /** 把结果栏恢复成初始的空白占位。 */
  const reset = useCallback((): void => {
    if (model === null) return

    setLayout(createLayout(model))
    setCurrent(0)
  }, [model])

  /**
   * 跳到指定冲突块（首尾循环），并把结果栏滚到对应行。
   * @param index 块序号
   */
  const goTo = useCallback(
    (index: number): void => {
      const count = model?.blocks.length ?? 0
      if (count === 0) return

      const next = ((index % count) + count) % count
      const range = layout?.ranges[next]

      setCurrent(next)
      if (range !== undefined) kernelRef.current?.revealLine(range.start + 1)
    },
    [layout, model],
  )

  const conflictCount = model?.blocks.length ?? 0
  const remaining = layout === null ? 0 : countUnresolved(layout)
  const fileName = path.slice(path.lastIndexOf('/') + 1)

  /** 左右两栏标题：左边是当前分支，右边是对方提交的短号。 */
  const leftTitle = useMemo(() => t('changesFrom').replace('{name}', refs.ours), [refs.ours, t])
  const rightTitle = useMemo(
    () => t('changesFrom').replace('{name}', refs.theirs === '' ? t('changesFromServer') : refs.theirs),
    [refs.theirs, t],
  )

  if (errorText !== '') {
    return (
      <div className="flex h-full min-h-0 items-center justify-center bg-code p-4 text-xs text-danger">{errorText}</div>
    )
  }

  if (model === null || layout === null) {
    return <div className="flex h-full min-h-0 items-center justify-center bg-code text-xs text-secondary">{t('loading')}</div>
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-code">
      <MergeToolbar
        t={t}
        conflictCount={conflictCount}
        unresolvedCount={remaining}
        onPrevious={() => goTo(current - 1)}
        onNext={() => goTo(current + 1)}
        onApplyAll={applyAll}
        onApplyNonConflicting={applyNonConflict}
        onResolveSimple={resolveSimple}
        onReset={reset}
      />

      {/* 三栏表头：左右两侧是只读版本，中间是可编辑结果 */}
      <div className="flex h-7 shrink-0 items-center border-b border-line1 bg-surface2 text-[12px]">
        <div className="flex min-w-0 flex-1 items-center gap-1 px-2 text-secondary">
          {lockIcon()}
          <span className="truncate">{leftTitle}</span>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-1 border-l border-line1 px-2 text-secondary">
          <span className="min-w-0 truncate">{t('resultTitle').replace('{name}', fileName)}</span>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-1 border-l border-line1 px-2 text-secondary">
          {lockIcon()}
          <span className="min-w-0 truncate">{rightTitle}</span>
        </div>
      </div>

      {/* 三栏正文：左右只读行视图，中间 CodeMirror */}
      <div className="flex min-h-0 flex-1">
        <MergePane
          side="ours"
          lines={versionsLines(model, 'ours')}
          ranges={model.oursRanges}
          choices={layout.choices}
          onAccept={(index) => changeSide(index, 'ours', true)}
          onIgnore={(index) => changeSide(index, 'ours', false)}
          syntax={syntax.ours}
          fontSize={settings.fontSize}
          lineHeight={settings.fontSize * settings.lineHeight}
          acceptTitle={t('acceptLeft')}
          ignoreTitle={t('ignoreSide')}
          scrollRef={setOursScroll}
          onScroll={(event) => synchronizeScroll(event.currentTarget)}
        />

        <div ref={hostRef} className="min-w-0 flex-1 overflow-hidden border-l border-line1" />

        <MergePane
          side="theirs"
          lines={versionsLines(model, 'theirs')}
          ranges={model.theirsRanges}
          choices={layout.choices}
          onAccept={(index) => changeSide(index, 'theirs', true)}
          onIgnore={(index) => changeSide(index, 'theirs', false)}
          syntax={syntax.theirs}
          fontSize={settings.fontSize}
          lineHeight={settings.fontSize * settings.lineHeight}
          acceptTitle={t('acceptRight')}
          ignoreTitle={t('ignoreSide')}
          scrollRef={setTheirsScroll}
          onScroll={(event) => synchronizeScroll(event.currentTarget)}
        />
      </div>

      {/* 底部操作行：按块接受与保存 */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-t border-line1 px-3">
        {/* 当前块接受左侧内容 */}
        <button
          type="button"
          disabled={busy || conflictCount === 0}
          onClick={() => changeSide(current, 'ours', true)}
          className="h-7 shrink-0 rounded-[4px] border border-line2 px-3 text-[12px] text-primary hover:bg-surface2 disabled:cursor-default disabled:opacity-50"
        >
          {t('acceptLeft')}
        </button>

        {/* 当前块接受右侧内容 */}
        <button
          type="button"
          disabled={busy || conflictCount === 0}
          onClick={() => changeSide(current, 'theirs', true)}
          className="h-7 shrink-0 rounded-[4px] border border-line2 px-3 text-[12px] text-primary hover:bg-surface2 disabled:cursor-default disabled:opacity-50"
        >
          {t('acceptRight')}
        </button>

        <span className="flex-1" />

        {/* 保存并关闭窗口 */}
        <button
          type="button"
          disabled={busy}
          onClick={() => void save(true)}
          className="h-7 shrink-0 rounded-[4px] border border-line2 px-3 text-[12px] text-primary hover:bg-surface2 disabled:cursor-default disabled:opacity-50"
        >
          {t('saveAndClose')}
        </button>

        {/* 保存合并结果：写回工作区并标记已解决 */}
        <button
          type="button"
          disabled={busy}
          onClick={() => void save(false)}
          className={cn(
            'h-7 shrink-0 rounded-[4px] bg-actionblue px-3 text-[12px] font-medium text-onAccent hover:bg-actionbluehover',
            busy && 'opacity-60',
          )}
        >
          {t('applyChanges')}
        </button>
      </div>
    </div>
  )
}

/**
 * 判断某一块当前是否已在结果栏里有内容。
 * @param layout 当前布局
 * @param index 块序号
 * @returns 有内容时为 true
 */
function hasContent(layout: MergeLayout, index: number): boolean {
  const range = layout.ranges[index]
  const choice = layout.choices[index]

  return range !== undefined && choice !== undefined && choice.touched && range.end > range.start
}

/**
 * 取结果栏里需要圈出的区间：已经移入内容、且内容非空的块。
 * @param layout 当前布局
 * @returns 行区间列表，坐标与结果文档一致
 */
function appliedRanges(layout: MergeLayout): EditorMarkRange[] {
  const ranges: EditorMarkRange[] = []

  layout.ranges.forEach((range, index) => {
    if (hasContent(layout, index)) ranges.push({ start: range.start, end: range.end })
  })

  return ranges
}

/**
 * 取结果栏里需要画插入线的位置：还没填内容、或者内容被叉掉的块。
 * @param layout 当前布局
 * @returns 0 起行号列表
 */
function slotPositions(layout: MergeLayout): number[] {
  const slots: number[] = []

  layout.ranges.forEach((range, index) => {
    if (!hasContent(layout, index)) slots.push(range.start)
  })

  return slots
}

/**
 * 取某一侧在冲突块之外的行。
 *
 * 左右两栏的正文由「段」展开：共有段两侧相同，冲突块各取自己那份。这里按段落顺序
 * 重新拼出单侧完整文本，行号因此与该侧版本的行号一一对应。
 * @param model 解析结果
 * @param side 取哪一侧
 * @returns 该侧完整文本行
 */
function versionsLines(model: MergeModel, side: 'ours' | 'theirs'): string[] {
  const lines: string[] = []

  for (const segment of model.segments) {
    if (segment.kind === 'text') {
      lines.push(...(model.texts[segment.index] ?? []))

      continue
    }

    const block = model.blocks[segment.index]
    if (block === undefined) continue

    lines.push(...(side === 'ours' ? block.ours : block.theirs))
  }

  return lines
}
