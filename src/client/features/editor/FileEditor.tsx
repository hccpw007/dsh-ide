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
import type { EditorKernel } from '../../lazy/editor-api'
import { loadLazyChunk } from '../../lazy/loader'
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
    tabSize: number
    onChange(text: string): void
    onCursor(line: number, column: number): void
    onSave(): void
  }): Promise<EditorKernel>
}

/** 编辑器状态机。 */
type Status = 'loading' | 'ready' | 'error'

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
  const [cursor, setCursor] = useState({ line: 1, column: 1 })

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
          tabSize: settings.tabSize,
          onChange: (text) => setDirty(text !== savedTextRef.current),
          onCursor: (line, column) => setCursor({ line, column }),
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
    kernelRef.current?.setMetrics(settings.fontSize, settings.tabSize)
  }, [settings.fontSize, settings.tabSize])

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

  return (
    <div className="flex h-full min-h-0 flex-col bg-base">
      {/* 文件路径、光标位置与保存状态条 */}
      <div className="flex h-7 shrink-0 items-center gap-2 border-b border-line1 px-3 text-xs text-secondary">
        <span className="min-w-0 flex-1 truncate">{path}</span>

        <span className="shrink-0">
          {cursor.line}:{cursor.column}
        </span>

        {/* 超大文件提示：只读预览 */}
        {readOnly && <span className="shrink-0 text-warn">{t('previewOnly')}</span>}

        {/* 未保存标记与手动保存入口 */}
        {dirty && !readOnly && (
          <>
            <span className="shrink-0 text-warn">{t('modified')}</span>
            <button
              type="button"
              onClick={() => void save()}
              className="shrink-0 rounded px-1.5 text-info hover:bg-layer2"
            >
              {t('save')}
            </button>
          </>
        )}
      </div>

      {status === 'loading' && <div className="p-3 text-xs text-secondary">{t('loading')}</div>}

      {status === 'error' && <div className="p-3 text-xs text-danger">{errorText || t('loadFailed')}</div>}

      {/* 超大文件说明：内容不全，明确告知 */}
      {status === 'ready' && readOnly && errorText !== '' && (
        <div className="shrink-0 border-b border-line1 bg-layer1 px-3 py-1 text-xs text-warn">{errorText}</div>
      )}

      {/* 编辑器挂载点；内核未就绪时保持空容器，避免布局跳动 */}
      <div ref={hostRef} className={cn('min-h-0 flex-1 overflow-hidden', status === 'ready' ? '' : 'hidden')} />

      {conflict !== null && (
        <div className="shrink-0 border-t border-line1 bg-layer1 p-3 text-xs">
          {/* 冲突说明：文件已被外部改动，需要用户决定保留哪一份 */}
          <div className="mb-2 text-warn">{t('conflictHint')}</div>

          <div className="flex gap-2">
            {/* 用磁盘内容替换编辑器 */}
            <button
              type="button"
              onClick={acceptDisk}
              className="rounded border border-line2 px-2 py-1 text-primary hover:bg-layer2"
            >
              {t('reloadFromDisk')}
            </button>

            {/* 用编辑器内容覆盖磁盘 */}
            <button
              type="button"
              onClick={() => void overwriteDisk()}
              className="rounded border border-line2 px-2 py-1 text-primary hover:bg-layer2"
            >
              {t('overwriteDisk')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
