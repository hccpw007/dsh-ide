/**
 * 文件编辑器视图。
 *
 * 编辑器内核（CodeMirror）在首次打开文件时才下载，因此这里先渲染一个占位骨架，
 * 内核到位后替换。保存走 `POST /fs/write` 并携带打开时拿到的版本号：宿主发现
 * 磁盘已被外部改动就回 `STALE_FILE`，此时弹出三选一，绝不静默覆盖用户或 AI 的改动。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'

import { apiGet, apiPost } from '../../../common/api'
import { cn } from '../../../common/cn'
import { openIdeContextMenu, textEditMenuItems } from '../../../common/context-menu'
import type { EditorKernel } from '../../lazy/editor-api'
import { loadLazyChunk } from '../../lazy/loader'
import type { MarkdownKernelModule } from '../../lazy/markdown-api'
import type { FeatureViewProps } from '../../shell/contract'

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
}

/** 保存冲突的三选一。 */
interface ConflictState {
  /** 磁盘上的最新版本。 */
  version: string
  /** 磁盘上的最新内容。 */
  text: string
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
  }): Promise<EditorKernel>
}

/** 编辑器状态机。 */
type Status = 'loading' | 'ready' | 'error'

/** Markdown 文件的展示方式：只读源码、左源码右预览、只看预览。 */
type ViewMode = 'source' | 'split' | 'preview'

/**
 * 渲染单个文件编辑器。
 * @param props 见 FeatureViewProps，额外带 address（形如 `file:<相对路径>`）
 * @returns 编辑器面板
 */
export function FileEditor({ t, services, address }: FeatureViewProps & { address: string }): React.ReactElement {
  // 外壳给的地址带 `file:` 前缀，读写路由要的是工作区相对路径
  const path = address.startsWith('file:') ? address.slice('file:'.length) : address

  const hostRef = useRef<HTMLDivElement | null>(null)
  const kernelRef = useRef<EditorKernel | null>(null)
  /** 打开或上次保存时磁盘上的版本，用于乐观锁。 */
  const versionRef = useRef('')
  /** 最近一次与磁盘一致的内容，用于判断脏状态。 */
  const savedTextRef = useRef('')
  const savingRef = useRef(false)

  const [status, setStatus] = useState<Status>('loading')
  const [errorText, setErrorText] = useState('')
  const [dirty, setDirty] = useState(false)
  const [readOnly, setReadOnly] = useState(false)
  const [conflict, setConflict] = useState<ConflictState | null>(null)

  /** Markdown 才有三种展示方式，其余文件固定源码模式。 */
  const isMarkdown = /\.(?:md|mdx)$/iu.test(path)
  const [viewMode, setViewMode] = useState<ViewMode>('source')
  /** 预览用的 Markdown 原文：与编辑器内容同步，切到预览/分栏时直接渲染。 */
  const [markdownText, setMarkdownText] = useState('')
  const [previewHtml, setPreviewHtml] = useState('')

  const settings = services.settings()

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

      setStatus('loading')

      const result = await apiGet<ReadResponse>('/fs/read', { root: services.root, path })

      if (!result.ok) {
        setStatus('error')
        setErrorText(result.error.message)

        return
      }

      const tooLarge = result.value.bytes > LARGE_FILE_BYTES
      // 超大文件只给首屏预览：截断后明确告知是只读，不假装全部内容都在
      const text = tooLarge
        ? result.value.text.split('\n').slice(0, LARGE_FILE_PREVIEW_LINES).join('\n')
        : result.value.text

      versionRef.current = result.value.version
      savedTextRef.current = text
      setMarkdownText(text)
      setReadOnly(tooLarge)
      setErrorText(tooLarge ? `${t('tooLarge')} ${(result.value.bytes / 1024 / 1024).toFixed(1)} MiB` : '')

      if (reason === 'open') setDirty(false)

      setStatus('ready')
    },
    [path, services.root, t],
  )

  /**
   * 保存当前内容。
   *
   * 携带打开时的版本做乐观锁；冲突时不强行写入，而是把磁盘版本交给用户处置。
   */
  const save = useCallback(async (): Promise<void> => {
    const kernel = kernelRef.current
    if (kernel === null || savingRef.current || readOnly) return

    savingRef.current = true

    try {
      const text = kernel.getValue()
      const result = await apiPost<{ version: string }>('/fs/write', {
        root: services.root,
        path,
        text,
        expectedVersion: versionRef.current,
      })

      if (result.ok) {
        versionRef.current = result.value.version
        savedTextRef.current = text
        setDirty(false)
        services.invalidate(path)
        services.refreshGitStatus()

        return
      }

      if (result.error.code === 'STALE_FILE') {
        const latest = await apiGet<ReadResponse>('/fs/read', { root: services.root, path })

        if (latest.ok) {
          setConflict({ version: latest.value.version, text: latest.value.text })

          return
        }
      }

      services.notify('error', `${t('saveFailed')}：${result.error.message}`)
    } finally {
      savingRef.current = false
    }
  }, [path, readOnly, services, t])

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
          doc: savedTextRef.current,
          readOnly,
          fontSize: settings.fontSize,
          lineHeight: settings.lineHeight,
          tabSize: settings.tabSize,
          onChange: (text) => {
            setDirty(text !== savedTextRef.current)
            // 预览与编辑器共用同一份原文，边打字边更新
            if (isMarkdown) setMarkdownText(text)
          },
          onSave: () => {
            void save()
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
      })
      .catch((error: unknown) => {
        console.error('[dsh-ide] 创建编辑器失败:', path, error)
        setStatus('error')
        setErrorText(String(error))
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
    setConflict(null)
    setStatus('loading')
    void load('open')
  }, [load])

  // 设置变化时只更新度量参数，不重建编辑器
  useEffect(() => {
    kernelRef.current?.setMetrics(settings.fontSize, settings.lineHeight, settings.tabSize)
  }, [settings.fontSize, settings.lineHeight, settings.tabSize])

  // Markdown 预览：渲染内核按需下载并缓存，切到源码模式时不付出任何代价
  useEffect(() => {
    if (!isMarkdown || viewMode === 'source' || status !== 'ready') return undefined

    let alive = true

    void loadLazyChunk<MarkdownKernelModule>('markdown-kernel')
      .then((chunk) => {
        if (alive) setPreviewHtml(chunk.create().render(markdownText))
      })
      .catch((error: unknown) => {
        console.error('[dsh-ide] 渲染 Markdown 预览失败:', error)
      })

    return () => {
      alive = false
    }
  }, [isMarkdown, markdownText, status, viewMode])

  // 其他面板发起「跳到某行」时消费一次；只认自己的路径，避免跳到别的文件上
  useEffect(
    () =>
      services.subscribeRevealLine((target, line) => {
        // 只有请求的正是本文件时才跳转，否则会跳到别的文件的行号上
        if (target !== path) return

        kernelRef.current?.revealLine(line)
      }),
    [path, services],
  )

  // 自动保存：停止输入 delay 毫秒后落盘
  useEffect(() => {
    if (!settings.autoSave || !dirty || readOnly) return undefined

    const timer = window.setTimeout(() => {
      void save()
    }, settings.autoSaveDelayMs)

    return () => window.clearTimeout(timer)
  }, [dirty, readOnly, save, settings.autoSave, settings.autoSaveDelayMs])

  /**
   * 用磁盘内容覆盖编辑器。
   */
  const acceptDisk = useCallback((): void => {
    if (conflict === null) return

    versionRef.current = conflict.version
    savedTextRef.current = conflict.text
    kernelRef.current?.setValue(conflict.text)
    setDirty(false)
    setConflict(null)

    services.notify('info', t('reloaded'))
  }, [conflict, services, t])

  /**
   * 用编辑器内容覆盖磁盘。
   */
  const overwriteDisk = useCallback(async (): Promise<void> => {
    const kernel = kernelRef.current
    if (conflict === null || kernel === null) return

    const text = kernel.getValue()
    const result = await apiPost<{ version: string }>('/fs/write', {
      root: services.root,
      path,
      text,
      expectedVersion: conflict.version,
    })

    if (result.ok) {
      versionRef.current = result.value.version
      savedTextRef.current = text
      setConflict(null)
      setDirty(false)
      services.invalidate(path)

      return
    }

    services.notify('error', `${t('saveFailed')}：${result.error.message}`)
  }, [path, conflict, services, t])

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
          services.notify('error', t('menuCopyFailed'))
        })
      }

      openIdeContextMenu(event, services, [
        // 撤销与重做保留 IDEA 的结构，实际快捷键由编辑器内核自己处理
        { id: 'undo', label: t('menuUndo'), shortcut: '⌘Z' },
        { id: 'redo', label: t('menuRedo'), shortcut: '⇧⌘Z' },
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
          shortcut: '⌘F',
          separatorBefore: true,
          ...(kernel === null ? {} : { run: () => kernel.openSearch() }),
        },
        { id: 'goToLine', label: t('menuGoToLine'), shortcut: '⌘L' },
        {
          id: 'save',
          label: t('menuSave'),
          shortcut: '⌘S',
          separatorBefore: true,
          ...(readOnly ? {} : { run: () => void save() }),
        },
        { id: 'reload', label: t('menuReload'), run: () => void load('reload') },
        { id: 'copyPath', label: t('menuCopyPath'), run: copyPath },
        { id: 'reformat', label: t('menuReformat'), shortcut: '⌥⌘L', separatorBefore: true },
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
              'ide-markdown min-h-0 overflow-auto px-6 py-4 text-sm',
              viewMode === 'split' ? 'w-1/2' : 'flex-1',
            )}
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        )}
      </div>

      {conflict !== null && (
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
