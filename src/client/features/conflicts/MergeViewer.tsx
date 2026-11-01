/**
 * 三栏合并窗口的正文。
 *
 * 复刻 IDEA 的 Merge Revisions：左侧是我方版本、中间是可编辑的结果、右侧是对方版本。
 * 逐块的接受只改结果文本，点 Apply Changes 时才一次性写回工作区并 `git add`，
 * 因此中途关掉窗口不会留下半解决的文件。
 *
 * 中间栏复用编辑器内核（CodeMirror，懒加载），语法高亮与行号与普通编辑器一致；
 * 左右两栏是只读的行视图，冲突块用 IDEA 的冲突色标出，块首带接受箭头。
 * 窗口外框（标题栏、拖动、缩放）由 MergeWindow 提供，这里只管窗口内容。
 */
import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { cn } from '../../../common/cn'
import type { SyntaxLines } from '../../../common/syntax-highlight'
import type { Translate } from '../../../types/plugin'
import type { IdeServices } from '../../shell/contract'
import type { EditorKernel } from '../../lazy/editor-api'
import { highlightLines } from '../../lazy/highlight'
import { loadLazyChunk } from '../../lazy/loader'

import { readConflictInfo, readConflictVersions, resolveConflictFile } from '../git/api'
import { lockIcon } from '../git/icons-ui'

import { MergePane } from './MergePanes'
import { MergeToolbar } from './MergeToolbar'
import {
  applyChoice,
  createLayout,
  layoutText,
  parseMergeModel,
  relocateLayout,
  simpleChoice,
  type MergeLayout,
  type MergeModel,
  type MergeSide,
} from './merge-model'

/** 编辑器内核 chunk 的形态。 */
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
  }): Promise<EditorKernel>
}

/** 尚无语法高亮时的空值。 */
const NO_SYNTAX: { ours: SyntaxLines; theirs: SyntaxLines } = { ours: [], theirs: [] }

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
  // 工作区根由宿主提供，可能在标签打开后切换会话
  const root = useSyncExternalStore(
    (listener) => services.subscribeRoot(listener),
    () => services.root,
    () => services.root,
  )
  const settings = services.settings()

  const [model, setModel] = useState<MergeModel | null>(null)
  const [layout, setLayout] = useState<MergeLayout | null>(null)
  /** 对方（正在合进来的提交）的完整号，显示在右栏标题里。 */
  const [theirsHash, setTheirsHash] = useState('')
  const [syntax, setSyntax] = useState(NO_SYNTAX)
  const [errorText, setErrorText] = useState('')
  const [busy, setBusy] = useState(false)
  /** 当前冲突块序号，供上下导航与「接受当前块」使用。 */
  const [current, setCurrent] = useState(0)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const kernelRef = useRef<EditorKernel | null>(null)

  // 读取三方内容与双方名称：窗口一打开就要把结果栏填成初始布局
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

        const parsed = parseMergeModel(versions.value.worktree)

        setErrorText('')
        setModel(parsed)
        setLayout(createLayout(parsed))

        if (info.ok) setTheirsHash(info.value.theirsHash)

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
   * @param close 保存后是否关闭标签
   */
  const save = useCallback(
    async (close: boolean): Promise<void> => {
      if (layout === null || busy) return

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
        // 创建完成前 layout effect 已经跑过一次（当时没有内核），这里补上初始内容
        if (layoutRef.current !== null) created.setValue(layoutText(layoutRef.current))
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

  // 布局内容变化（读取完成、接受、重置）后同步到编辑器；编辑器还没就绪时先跳过
  useEffect(() => {
    const kernel = kernelRef.current
    if (kernel === null || layout === null) return

    const text = layoutText(layout)

    if (kernel.getValue() !== text) kernel.setValue(text)
  }, [layout])

  /**
   * 接受某一块的某一侧。
   * @param index 块序号
   * @param side 接受侧
   */
  const accept = useCallback(
    (index: number, side: MergeSide): void => {
      if (model === null || layout === null) return

      const next = applyChoice(model, relocateLayout(model, layout), index, side)
      const following = next.choices.findIndex((choice, itemIndex) => itemIndex > index && choice === null)

      setLayout(next)
      setCurrent(following >= 0 ? following : index)
    },
    [layout, model],
  )

  /**
   * 把所有冲突块按某一侧应用。
   * @param side 接受侧
   */
  const acceptAll = useCallback(
    (side: MergeSide): void => {
      if (model === null || layout === null) return

      let next = relocateLayout(model, layout)

      model.blocks.forEach((block, index) => {
        if (block !== undefined) next = applyChoice(model, next, index, side)
      })

      setLayout(next)
      setCurrent(model.blocks.length === 0 ? 0 : model.blocks.length - 1)
    },
    [layout, model],
  )

  /** 自动解决全部简单冲突；存在语义冲突时保持原样并提示。 */
  const resolveSimple = useCallback((): void => {
    if (model === null || layout === null) return

    const choices = model.blocks.map((block) => simpleChoice(block))

    if (choices.some((choice) => choice === null)) {
      services.toast('info', t('simpleConflictsNone'))

      return
    }

    let next = relocateLayout(model, layout)

    choices.forEach((choice, index) => {
      if (choice !== null) next = applyChoice(model, next, index, choice)
    })

    setLayout(next)
  }, [layout, model, services, t])

  /** 把结果栏恢复成初始内容。 */
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
  const unresolvedCount = layout?.choices.filter((choice) => choice === null).length ?? 0
  const fileName = path.slice(path.lastIndexOf('/') + 1)

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
        unresolvedCount={unresolvedCount}
        onPrevious={() => goTo(current - 1)}
        onNext={() => goTo(current + 1)}
        onAcceptLeft={() => accept(current, 'ours')}
        onAcceptRight={() => accept(current, 'theirs')}
        onApplyAll={acceptAll}
        onResolveSimple={resolveSimple}
        onReset={reset}
      />

      {/* 三栏表头：左右两侧是只读版本，中间是可编辑结果 */}
      <div className="flex h-7 shrink-0 items-center border-b border-line1 bg-surface2 text-[12px]">
        <div className="flex min-w-0 flex-1 items-center gap-1 px-2 text-secondary">
          {lockIcon()}
          <span className="truncate">{t('yourVersion')}</span>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-1 border-l border-line1 px-2 text-secondary">
          <span className="shrink-0">{t('resultColumn')}</span>
          <span className="min-w-0 truncate text-primary">{fileName}</span>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-1 border-l border-line1 px-2 text-secondary">
          {lockIcon()}
          <span className="min-w-0 truncate">
            {t('changesFromServer')}
            {theirsHash === ''
              ? ''
              : ` (${t('revisionLabel').replace('{hash}', theirsHash)})`}
          </span>
        </div>
      </div>

      {/* 三栏正文：左右只读行视图，中间 CodeMirror */}
      <div className="flex min-h-0 flex-1">
        <MergePane
          side="ours"
          lines={versionsLines(model, 'ours')}
          ranges={model.oursRanges}
          choices={layout.choices}
          onAccept={(index) => accept(index, 'ours')}
          syntax={syntax.ours}
          fontSize={settings.fontSize}
          lineHeight={settings.fontSize * settings.lineHeight}
          acceptTitle={t('acceptLeft')}
        />

        <div ref={hostRef} className="min-w-0 flex-1 overflow-hidden border-l border-line1" />

        <MergePane
          side="theirs"
          lines={versionsLines(model, 'theirs')}
          ranges={model.theirsRanges}
          choices={layout.choices}
          onAccept={(index) => accept(index, 'theirs')}
          syntax={syntax.theirs}
          fontSize={settings.fontSize}
          lineHeight={settings.fontSize * settings.lineHeight}
          acceptTitle={t('acceptRight')}
        />
      </div>

      {/* 底部操作行：按块接受与保存 */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-t border-line1 px-3">
        {/* 当前块接受左侧内容 */}
        <button
          type="button"
          disabled={busy || conflictCount === 0}
          onClick={() => accept(current, 'ours')}
          className="h-7 shrink-0 rounded-[4px] border border-line2 px-3 text-[12px] text-primary hover:bg-surface2 disabled:cursor-default disabled:opacity-50"
        >
          {t('acceptLeft')}
        </button>

        {/* 当前块接受右侧内容 */}
        <button
          type="button"
          disabled={busy || conflictCount === 0}
          onClick={() => accept(current, 'theirs')}
          className="h-7 shrink-0 rounded-[4px] border border-line2 px-3 text-[12px] text-primary hover:bg-surface2 disabled:cursor-default disabled:opacity-50"
        >
          {t('acceptRight')}
        </button>

        <span className="flex-1" />

        {/* 保存并关闭标签 */}
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
      lines.push(...segment.lines)

      continue
    }

    const block = model.blocks[segment.index]
    if (block === undefined) continue

    lines.push(...(side === 'ours' ? block.ours : block.theirs))
  }

  return lines
}
