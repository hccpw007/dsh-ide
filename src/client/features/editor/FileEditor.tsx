/**
 * 文件编辑器视图。
 *
 * 编辑器内核（CodeMirror）在首次打开文件时才下载，因此这里先渲染一个占位骨架，
 * 内核到位后替换。保存走 `POST /fs/write` 并携带打开时拿到的版本号：宿主发现
 * 磁盘已被外部改动就回 `STALE_FILE`，此时弹出三选一，绝不静默覆盖用户或 AI 的改动。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

import { apiGet, apiPost } from '../../../common/api'
import { cn } from '../../../common/cn'
import { openIdeContextMenu, textEditMenuItems } from '../../../common/context-menu'
import type { EditorKernel } from '../../lazy/editor-api'
import { LazyChunkError, loadLazyChunk } from '../../lazy/loader'
import type { MarkdownKernelModule } from '../../lazy/markdown-api'
import type { FeatureViewProps } from '../../shell/contract'
import { editorDocumentStore, type EditorDocument } from '../../shell/editor-document-store'

/** 大文件阈值：超过即降级为只读预览，避免把整份文件塞进编辑器并拖慢页面。 */
const LARGE_FILE_BYTES = 2 * 1024 * 1024

/** 超大文件预览的最大行数。 */
const LARGE_FILE_PREVIEW_LINES = 2000

/** 宿主读取接口的返回形态。 */
interface ReadResponse {
  text: string
  version: string
  absolutePath: string
  bytes: number
  /** 宿主是否只返回了文件头部（大文件预览）。 */
  truncated?: boolean
}

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
    onScroll(topLine: number): void
  }): Promise<EditorKernel>
}

/** 编辑器状态机。 */
type Status = 'loading' | 'ready' | 'error'

/**
 * 文档尚未进入共享池时的空壳。
 *
 * 正文里到处写 `document?.xxx` 会把可读性拖垮；给一份稳定的空值，
 * 首帧的脏标记、冲突横幅等判断就能直接读字段。
 */
const EMPTY_DOCUMENT: EditorDocument = {
  text: '',
  savedText: '',
  version: '',
  dirty: false,
  saving: false,
  conflict: null,
}

/**
 * Markdown 预览的防抖延迟。
 *
 * 预览要对整篇重新解析并替换 innerHTML；跟着每次击键跑会让大文件的输入明显掉帧，
 * 停手一小段时间后再渲染即可。
 */
const MARKDOWN_PREVIEW_DELAY_MS = 250

/** Markdown 文件的展示方式：只读源码、左源码右预览、只看预览。 */
type ViewMode = 'source' | 'split' | 'preview'

/**
 * 渲染单个文件编辑器。
 * @param props 见 FeatureViewProps，额外带 address（形如 `file:<相对路径>`）
 * @returns 编辑器面板
 */
export function FileEditor({
  t,
  services,
  address,
  scopeKey,
}: FeatureViewProps & { address: string; scopeKey: string }): React.ReactElement {
  // 外壳给的地址带 `file:` 前缀，读写路由要的是工作区相对路径
  const path = address.startsWith('file:') ? address.slice('file:'.length) : address

  const hostRef = useRef<HTMLDivElement | null>(null)
  const kernelRef = useRef<EditorKernel | null>(null)
  /**
   * 读盘请求序号。
   *
   * 快速切换文件时，前一个文件的读盘响应可能后到；没有序号时会把旧文件的正文、
   * 只读状态与冲突提示写进当前编辑器，表现为「打开 A 却看到 B 的内容」。
   */
  const loadSequence = useRef(0)

  /*
   * 共享文档池：同一工作空间的多个承载面（主区页签、右侧栏、对话页弹窗）读写同一份
   * 状态。正文、脏标记、磁盘版本、保存互斥与冲突提示都放在池里，任一面改动其余面
   * 立刻跟上；共享开关关闭时 scopeKey 带实例后缀，各面各持一份。
   */
  const documents = useMemo(() => editorDocumentStore(scopeKey), [scopeKey])
  const subscribeDocument = useCallback(
    (listener: () => void) => documents.subscribe(path, listener),
    [documents, path],
  )
  const readDocument = useCallback(() => documents.get(path), [documents, path])
  const shared = useSyncExternalStore(subscribeDocument, readDocument, readDocument)
  const sharedDocument = shared ?? EMPTY_DOCUMENT

  const [status, setStatus] = useState<Status>('loading')
  const [errorText, setErrorText] = useState('')
  const [readOnly, setReadOnly] = useState(false)
  /** 正文里是否还留着合并冲突标记：有值时顶部显示提示横幅。 */
  const [conflictMarkers, setConflictMarkers] = useState(false)

  /** Markdown 才有三种展示方式，其余文件固定源码模式。 */
  const isMarkdown = /\.(?:md|mdx)$/iu.test(path)
  const [viewMode, setViewMode] = useState<ViewMode>('source')
  /** 预览用的 Markdown 原文：与编辑器内容同步，切到预览/分栏时直接渲染。 */
  const [markdownText, setMarkdownText] = useState('')
  /** 送进预览渲染器的原文；由 markdownText 防抖得到。 */
  const [previewText, setPreviewText] = useState('')
  const [previewHtml, setPreviewHtml] = useState('')
  /** 预览是否因为原文超限被截断；用于给出可见提示，而不是无声少一截内容。 */
  const [previewTruncated, setPreviewTruncated] = useState(false)

  // 订阅设置：字号、行距改了要立刻作用到已打开的编辑器，不订阅则组件不重渲染、度量停在旧值
  const settings = useSyncExternalStore(
    (listener) => services.subscribeSettings(listener),
    () => services.settings(),
    () => services.settings(),
  )

  /**
   * 读取文件并把内容装进编辑器。
   * @param reason 加载原因，决定是否重置脏标记
   */
  const load = useCallback(
    async (reason: 'open' | 'reload'): Promise<void> => {
      if (services.root === '') {
        setStatus('error')
        setErrorText(t('noWorkspace'))

        return
      }

      // 首次打开才显示加载态：重新读盘时正文已经在屏幕上，切成加载中只会闪一下
      if (reason === 'open') setStatus('loading')

      loadSequence.current += 1
      const sequence = loadSequence.current
      // 宿主按预览上限截断：2 MiB 以上只回文件头部，不再把整份日志送过 IPC
      const result = await apiGet<ReadResponse>('/fs/read', {
        root: services.root,
        path,
        maxBytes: LARGE_FILE_BYTES,
        maxLines: LARGE_FILE_PREVIEW_LINES,
      })

      // 期间切走了文件：这份响应属于上一个路径，直接丢弃
      if (sequence !== loadSequence.current) return

      if (!result.ok) {
        setStatus('error')
        // 常见失败给本地化文案：原始 errno 文本（ENOENT / EACCES）对用户没有意义
        setErrorText(
          result.error.code === 'NOT_FOUND'
            ? t('notFound')
            : result.error.code === 'PERMISSION_DENIED'
              ? t('permissionDenied')
              : result.error.message,
        )

        return
      }

      const tooLarge = result.value.truncated === true || result.value.bytes > LARGE_FILE_BYTES
      // 超大文件宿主已截断，这里只需原样展示并明确告知是只读预览
      const diskText = result.value.text

      setReadOnly(tooLarge)
      setErrorText(tooLarge ? `${t('tooLarge')} ${(result.value.bytes / 1024 / 1024).toFixed(1)} MiB` : '')

      const previous = documents.get(path)

      /*
       * 其它承载面可能已经打开过同一文件并留下未保存改动：此时以池里的正文为准，
       * 只把磁盘版本补进来。拿磁盘内容盖过去等于把另一面正在编辑的东西冲掉。
       */
      if (reason === 'open' && previous !== undefined && previous.dirty) {
        documents.set(path, { ...previous, version: result.value.version, conflict: null })
        setMarkdownText(previous.text)
        setConflictMarkers(previous.text.includes('<<<<<<<'))
      } else {
        // 重新读盘：内容要真正写进编辑器，否则标题变了、正文还停在旧文本上
        if (reason === 'reload') kernelRef.current?.setValue(diskText)

        documents.set(path, {
          text: diskText,
          savedText: diskText,
          version: result.value.version,
          dirty: false,
          saving: false,
          conflict: null,
        })
        setMarkdownText(diskText)
        setConflictMarkers(diskText.includes('<<<<<<<'))
      }

      setStatus('ready')
    },
    [documents, path, services.root, t],
  )

  /**
   * 保存当前内容。
   *
   * 携带打开时的版本做乐观锁；冲突时不强行写入，而是把磁盘版本交给用户处置。
   */
  const save = useCallback(async (): Promise<void> => {
    const kernel = kernelRef.current
    const current = documents.get(path)

    // 没有改动就不写盘：共享后另一面可能刚保存过，重复写入只会白白推进版本号
    if (kernel === null || current === undefined || current.saving || !current.dirty || readOnly) return

    // 「保存中」写进共享池：另一面此刻也在跑自动保存，不拦住就会并发写盘
    documents.set(path, { ...current, saving: true })

    try {
      const text = kernel.getValue()
      const result = await apiPost<{ version: string }>('/fs/write', {
        root: services.root,
        path,
        text,
        expectedVersion: current.version,
      })

      if (result.ok) {
        const latest = documents.get(path) ?? current

        /*
         * 写盘期间另一面可能又改了正文：只把「与磁盘一致的那份」推进到刚写入的文本，
         * 当前正文保留池里的最新值，脏标记按实际差异重算。
         */
        documents.set(path, {
          ...latest,
          savedText: text,
          version: result.value.version,
          dirty: latest.text !== text,
          saving: false,
          conflict: null,
        })

        services.invalidate(path)
        services.refreshGitStatus()

        return
      }

      if (result.error.code === 'STALE_FILE') {
        const latest = await apiGet<ReadResponse>('/fs/read', { root: services.root, path })

        if (latest.ok) {
          const after = documents.get(path) ?? current

          documents.set(path, {
            ...after,
            saving: false,
            conflict: { version: latest.value.version, text: latest.value.text },
          })

          return
        }
      }

      services.toast('error', `${t('saveFailed')}：${result.error.message}`)
    } finally {
      // 兜底复位：中途抛错时不能把文档永久卡在「保存中」，那会让所有面都再也保存不了
      const after = documents.get(path)
      if (after !== undefined && after.saving) documents.set(path, { ...after, saving: false })
    }
  }, [documents, path, readOnly, services, t])

  // 内核只创建一次：内容刷新、只读切换、设置变化都走实例方法，避免重建丢失滚动位置
  useEffect(() => {
    if (status !== 'ready' || hostRef.current === null) return undefined

    const host = hostRef.current
    let alive = true
    let kernel: EditorKernel | null = null

    void loadLazyChunk<EditorChunk>('editor-kernel')
      .then((chunk) =>
        chunk.create({
          parent: host,
          path,
          // 初始正文取共享池：另一面可能已经打开并改过这个文件
          doc: documents.get(path)?.text ?? '',
          readOnly,
          fontSize: settings.fontSize,
          lineHeight: settings.lineHeight,
          tabSize: settings.tabSize,
          onChange: (text) => {
            const current = documents.get(path) ?? EMPTY_DOCUMENT

            // 正文与脏标记一起写进共享池，其余承载面据此同步
            documents.set(path, { ...current, text, dirty: text !== current.savedText })

            // 冲突标记可能被手工清掉，横幅要跟着消失
            setConflictMarkers(text.includes('<<<<<<<'))
            // 预览与编辑器共用同一份原文，边打字边更新
            if (isMarkdown) setMarkdownText(text)
          },
          onSave: () => {
            void save()
          },
          onScroll: (topLine) => {
            documents.setScroll(path, topLine)
          },
        }),
      )
      .then((created) => {
        if (!alive) {
          created.destroy()

          return
        }

        kernel = created
        kernelRef.current = created

        // 首次打开文件时的「跳到某行」在组件挂载前就发出了，这里补一次消费
        const pendingLine = services.consumePendingReveal(path)

        if (pendingLine !== null) created.revealLine(pendingLine)

        // 内核就位后对齐共享的滚动位置：另一面可能已经滚到别处
        const line = documents.scroll(path)

        if (line > 1) {
          window.requestAnimationFrame(() => {
            // 一帧内可能已经切走文件并销毁了内核
            if (kernelRef.current === created) created.setTopLine(line)
          })
        }
      })
      .catch((error: unknown) => {
        console.error('[dsh-ide] 创建编辑器失败:', path, error)
        setStatus('error')
        // chunk 失败是「组件没加载下来」，原始英文异常对用户毫无意义
        setErrorText(error instanceof LazyChunkError ? t('chunkFailed') : String(error))
      })

    return () => {
      alive = false
      kernelRef.current = null
      kernel?.destroy()
    }
    // 依赖只到 path：其余参数是首帧取值，后续变化由下面的副作用增量更新
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, status])

  // 打开或切换文件时重新读取内容
  useEffect(() => {
    setStatus('loading')
    void load('open')
  }, [load])

  /*
   * 其它承载面改了正文：把差异同步进本实例的内核。
   *
   * 用 applyText 而不是 setValue——后者整篇替换会把光标与滚动位置打回开头，
   * 两面同时开着同一个文件时，用户的视线会被对面的输入反复拽走。
   */
  useEffect(() => {
    if (shared === undefined) return

    kernelRef.current?.applyText(shared.text)
  }, [shared])

  // 其它承载面滚动了：跟随到同一行；自己上报的位置与本实例一致时不会被拽动
  useEffect(
    () =>
      documents.subscribeScroll(path, (line) => {
        const kernel = kernelRef.current
        if (kernel === null || kernel.getTopLine() === line) return

        kernel.setTopLine(line)
      }),
    [documents, path],
  )

  // 失效广播：取消合并、reset、外部工具改文件之后，正文要按磁盘重新读一次。
  // 有未保存修改时不覆盖，交给用户自己决定（保存时会走乐观锁提示冲突）。
  useEffect(
    () =>
      services.subscribeInvalidate((target) => {
        if (target !== undefined && target !== path) return
        if (documents.get(path)?.dirty === true) return

        void load('reload')
      }),
    [documents, load, path, services],
  )

  // 设置变化时只更新度量参数，不重建编辑器
  useEffect(() => {
    kernelRef.current?.setMetrics(settings.fontSize, settings.lineHeight, settings.tabSize)
  }, [settings.fontSize, settings.lineHeight, settings.tabSize])

  // 预览原文防抖：打字过程中不跟着每次击键重新渲染
  useEffect(() => {
    const timer = window.setTimeout(() => setPreviewText(markdownText), MARKDOWN_PREVIEW_DELAY_MS)

    return () => window.clearTimeout(timer)
  }, [markdownText])

  // Markdown 预览：渲染内核按需下载并缓存，切到源码模式时不付出任何代价
  useEffect(() => {
    if (!isMarkdown || viewMode === 'source' || status !== 'ready') return undefined

    let alive = true

    void loadLazyChunk<MarkdownKernelModule>('markdown-kernel')
      .then((chunk) => {
        if (!alive) return

        setPreviewHtml(chunk.create().render(previewText))
        setPreviewTruncated(previewText.length > chunk.previewLimitChars)
      })
      .catch((error: unknown) => {
        console.error('[dsh-ide] 渲染 Markdown 预览失败:', error)
      })

    return () => {
      alive = false
    }
  }, [isMarkdown, previewText, status, viewMode])

  // 其他面板发起「跳到某行」时消费一次；只认自己的路径，避免跳到别的文件上
  useEffect(
    () =>
      services.subscribeRevealLine((target) => {
        // 只有请求的正是本文件时才跳转，否则会跳到别的文件的行号上
        if (target !== path) return

        // 内核还没就绪时把意图留在池里，由上面的创建流程消费
        if (kernelRef.current === null) return

        const line = services.consumePendingReveal(path)

        if (line !== null) kernelRef.current.revealLine(line)
      }),
    [path, services],
  )

  /*
   * 自动保存：停止输入 delay 毫秒后落盘。多个承载面都会跑，靠共享池里的 saving 互斥。
   *
   * `saving` 必须参与依赖：保存期间继续打字时 `dirty` 全程为 true、不会变化，
   * 若只依赖 dirty，这次保存结束后不会重排定时器，那段改动会一直停在脏状态，
   * 直到用户手动保存。把 saving 纳入依赖后，「保存结束且仍脏」会自然再排一次。
   */
  useEffect(() => {
    if (!settings.autoSave || !sharedDocument.dirty || sharedDocument.saving || readOnly) return undefined

    const timer = window.setTimeout(() => {
      void save()
    }, settings.autoSaveDelayMs)

    return () => window.clearTimeout(timer)
  }, [readOnly, save, settings.autoSave, settings.autoSaveDelayMs, sharedDocument.dirty, sharedDocument.saving])

  /**
   * 用磁盘内容覆盖编辑器。
   */
  const acceptDisk = useCallback((): void => {
    const current = documents.get(path)
    if (current === undefined || current.conflict === null) return

    kernelRef.current?.setValue(current.conflict.text)
    documents.set(path, {
      ...current,
      text: current.conflict.text,
      savedText: current.conflict.text,
      version: current.conflict.version,
      dirty: false,
      conflict: null,
    })

    services.toast('info', t('reloaded'))
  }, [documents, path, services, t])

  /**
   * 用编辑器内容覆盖磁盘。
   */
  const overwriteDisk = useCallback(async (): Promise<void> => {
    const kernel = kernelRef.current
    const current = documents.get(path)
    if (current === undefined || current.conflict === null || kernel === null) return

    const text = kernel.getValue()
    const result = await apiPost<{ version: string }>('/fs/write', {
      root: services.root,
      path,
      text,
      expectedVersion: current.conflict.version,
    })

    if (result.ok) {
      const latest = documents.get(path) ?? current

      documents.set(path, {
        ...latest,
        savedText: text,
        version: result.value.version,
        dirty: latest.text !== text,
        conflict: null,
      })
      services.invalidate(path)

      return
    }

    services.toast('error', `${t('saveFailed')}：${result.error.message}`)
  }, [documents, path, services, t])

  /**
   * 打开编辑器正文的右键菜单。
   *
   * 撤销 / 重做由 CodeMirror 自己的历史栈管理，无法从外层可靠触发，因此保留为
   * 结构占位；其余编辑命令交给浏览器执行，作用在当前焦点上。
   * @param event 右键事件
   */
  const openEditorMenu = useCallback(
    (event: React.MouseEvent): void => {
      const kernel = kernelRef.current

      const copyPath = (): void => {
        const absolute = services.root === '' ? path : `${services.root}/${path}`

        void navigator.clipboard.writeText(absolute).catch((error: unknown) => {
          console.error('[dsh-ide] 复制文件路径失败:', error)
          services.toast('error', t('menuCopyFailed'))
        })
      }

      /**
       * 把选中内容 @ 到聊天框。
       *
       * 有选区时引用选中行范围（`@path#L6-14`），没有选区时引用整个文件，
       * 与项目树的「In Chat」保持一致。
       */
      const mentionSelection = (): void => {
        const selection = kernel?.getSelectionRange() ?? null
        const result =
          selection === null
            ? services.mentionInComposer(path, false)
            : services.mentionRangeInComposer(path, selection.startLine, selection.endLine)

        // 插入发生在对话页的输入框里，编辑器看不到变化，成功与失败都要提示
        if (result.ok) services.toast('success', t('addedToChat'))
        else services.toast('error', result.code === 'rejected' ? t('addToChatBusy') : t('addToChatFailed'))
      }

      openIdeContextMenu(event, services, [
        // @到聊天框：把选中内容或整个文件送进对话输入框
        { id: 'mentionInChat', label: t('menuMentionInChat'), run: mentionSelection },
        // 撤销与重做保留 IDEA 的结构，实际快捷键由编辑器内核自己处理
        { id: 'undo', label: t('menuUndo') },
        { id: 'redo', label: t('menuRedo') },
        ...textEditMenuItems({
          undo: t('menuUndo'),
          redo: t('menuRedo'),
          cut: t('menuCut'),
          copy: t('menuCopy'),
          paste: t('menuPaste'),
          selectAll: t('menuSelectAll'),
        }).slice(2),
        {
          id: 'find',
          label: t('menuFind'),
          separatorBefore: true,
          ...(kernel === null ? {} : { run: () => kernel.openSearch() }),
        },
        { id: 'goToLine', label: t('menuGoToLine') },
        {
          id: 'save',
          label: t('menuSave'),
          separatorBefore: true,
          ...(readOnly ? {} : { run: () => void save() }),
        },
        { id: 'reload', label: t('menuReload'), run: () => void load('reload') },
        { id: 'copyPath', label: t('menuCopyPath'), run: copyPath },
        { id: 'reformat', label: t('menuReformat'), separatorBefore: true },
        { id: 'git', label: t('menuGit'), submenu: true, separatorBefore: true },
        { id: 'localHistory', label: t('menuLocalHistory'), submenu: true },
        { id: 'encoding', label: t('menuEncoding'), separatorBefore: true },
        { id: 'lineSeparators', label: t('menuLineSeparators') },
      ])
    },
    [load, path, readOnly, save, services, t],
  )

  return (
    <div className="group/editor relative flex h-full min-h-0 flex-col bg-code">
      {status === 'loading' && <div className="p-3 text-xs text-secondary">{t('loading')}</div>}

      {status === 'error' && <div className="p-3 text-xs text-danger">{errorText || t('loadFailed')}</div>}

      {/* 超大文件说明：内容不全，明确告知 */}
      {status === 'ready' && readOnly && errorText !== '' && (
        <div className="shrink-0 border-b border-line1 bg-surface1 px-3 py-1 text-xs text-warn">{errorText}</div>
      )}

      {/* 合并冲突横幅：文件里还有冲突标记时提示先去合并，与 IDEA 的编辑器提示一致 */}
      {status === 'ready' && conflictMarkers && (
        <div className="flex shrink-0 items-center gap-2 bg-warn/15 px-3 py-1 text-xs text-primary">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true" className="shrink-0 text-warn">
            <path d="M8 2.4 14.2 13.2H1.8L8 2.4Z" strokeLinejoin="round" />
            <path d="M8 6.2v3.1" strokeLinecap="round" />
            <path d="M8 11.3h.01" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          {/* 提示文案：文件存在未解决的合并冲突 */}
          {t('unresolvedConflicts')}
        </div>
      )}

      {/* Markdown 视图切换：悬停编辑区右上角时出现，与 IDEA 的预览按钮一致 */}
      {isMarkdown && status === 'ready' && (
        <div className="pointer-events-none absolute right-3 top-2 z-10 flex items-center gap-0.5 rounded-md border border-line1 bg-surface1/95 p-0.5 opacity-0 shadow transition-opacity group-hover/editor:pointer-events-auto group-hover/editor:opacity-100">
          {/* 源码模式 */}
          <ViewModeButton
            active={viewMode === 'source'}
            title={t('viewSource')}
            onClick={() => setViewMode('source')}
          >
            {sourceIcon()}
          </ViewModeButton>

          {/* 左源码右预览 */}
          <ViewModeButton active={viewMode === 'split'} title={t('viewSplit')} onClick={() => setViewMode('split')}>
            {splitIcon()}
          </ViewModeButton>

          {/* 只看预览 */}
          <ViewModeButton
            active={viewMode === 'preview'}
            title={t('viewPreview')}
            onClick={() => setViewMode('preview')}
          >
            {previewIcon()}
          </ViewModeButton>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* 编辑器挂载点；内核未就绪时保持空容器，避免布局跳动 */}
        <div
          ref={hostRef}
          className={cn(
            'min-h-0 overflow-hidden',
            status === 'ready' ? '' : 'hidden',
            viewMode === 'preview' ? 'hidden' : viewMode === 'split' ? 'w-1/2 border-r border-line1' : 'flex-1',
          )}
          // 捕获阶段接管右键：CodeMirror 自己的上下文处理不应先于 IDE 菜单
          onContextMenuCapture={openEditorMenu}
        />

        {/* Markdown 预览：HTML 由 markdown-kernel 转义后生成 */}
        {isMarkdown && viewMode !== 'source' && (
          <div
            className={cn(
              'flex min-h-0 flex-col overflow-auto',
              viewMode === 'split' ? 'w-1/2' : 'flex-1',
            )}
          >
            {previewTruncated && (
              // 预览截断提示：文件太大，只渲染了前半部分
              <div className="shrink-0 border-b border-line1 bg-surface1 px-3 py-1 text-xs text-warn">
                {t('previewTruncated')}
              </div>
            )}
            <div
              className="ide-markdown min-h-0 flex-1 px-6 py-4 text-sm"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </div>
        )}
      </div>

      {sharedDocument.conflict !== null && (
        <div className="shrink-0 border-t border-line1 bg-surface1 p-3 text-xs">
          {/* 冲突说明：文件已被外部改动，需要用户决定保留哪一份 */}
          <div className="mb-2 text-warn">{t('conflictHint')}</div>

          <div className="flex gap-2">
            {/* 用磁盘内容替换编辑器 */}
            <button
              type="button"
              onClick={acceptDisk}
              className="rounded border border-line2 px-2 py-1 text-primary hover:bg-surface2"
            >
              {t('reloadFromDisk')}
            </button>

            {/* 用编辑器内容覆盖磁盘 */}
            <button
              type="button"
              onClick={() => void overwriteDisk()}
              className="rounded border border-line2 px-2 py-1 text-primary hover:bg-surface2"
            >
              {t('overwriteDisk')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Markdown 视图切换按钮。
 * @param props 选中态、悬停提示、点击回调与图标
 * @returns 方形图标按钮
 */
function ViewModeButton({
  active,
  title,
  onClick,
  children,
}: {
  active: boolean
  title: string
  onClick(): void
  children: React.ReactNode
}): React.ReactElement {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        'flex h-6 w-6 items-center justify-center rounded',
        active ? 'bg-surface3 text-primary' : 'text-secondary hover:bg-surface2 hover:text-primary',
      )}
    >
      {children}
    </button>
  )
}

/** 源码模式图标：等宽的几行横线。 */
function sourceIcon(): React.ReactNode {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 3h12M2 6.2h12M2 9.4h12M2 12.6h12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

/** 分栏图标：左侧横线代表源码，右侧竖框代表预览面板。 */
function splitIcon(): React.ReactNode {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 4h4.5M2 7h4.5M2 10h4.5M2 13h4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <rect x="9.5" y="2.5" width="4.5" height="11" rx="1.3" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

/** 预览图标：相框内一轮太阳与山形。 */
function previewIcon(): React.ReactNode {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="5.6" cy="6.2" r="1.1" fill="currentColor" />
      <path
        d="M2.8 12.1l3.2-3 2.3 2.1 1.9-1.7 2.8 2.6"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
