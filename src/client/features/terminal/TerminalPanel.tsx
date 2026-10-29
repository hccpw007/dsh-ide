/**
 * 终端面板。
 *
 * 终端进程由宿主的 `remote.terminal` 承载：创建、附加、重命名、关闭都按会话隔离，
 * 刷新页面后同一个终端 id 能重新附加并恢复屏幕。xterm 内核走懒加载 chunk。
 *
 * 绑定关系保存在 localStorage（`dsh-ide.terminal.v1.<sessionId>`），折叠底部面板、
 * 切走标签、刷新页面都不会丢掉终端列表。
 */
import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { cn } from '../../../common/cn'
import {
  getTerminalRemote,
  subscribeTerminalRemote,
  type RemoteResult,
  type TerminalFrame,
  type TerminalInfo,
} from '../../../common/terminal-remote'
import type { TerminalKernel } from '../../lazy/terminal-api'
import { loadLazyChunk } from '../../lazy/loader'
import type { FeatureViewProps } from '../../shell/contract'

/** 宿主终端上限（与宿主 maxTerminals 默认值一致）。 */
const MAX_TERMINALS = 8

/** 绑定关系存储前缀。 */
const STORAGE_PREFIX = 'dsh-ide.terminal.v1.'

/** 终端内核 chunk 的形态。 */
interface TerminalChunk {
  create(options: {
    parent: HTMLElement
    theme: { background: string; foreground: string; cursor: string; selectionBackground: string }
    fontSize: number
    onData(data: string): void
    onResize(cols: number, rows: number): void
  }): TerminalKernel
}

/**
 * 读取宿主主题令牌的当前值。
 *
 * 令牌由宿主注入到 `:root`，从计算样式读即可跟随明暗切换；取不到时用中性色兜底。
 * @returns 终端主题
 */
function readTheme(): { background: string; foreground: string; cursor: string; selectionBackground: string } {
  const style = getComputedStyle(document.documentElement)
  const read = (name: string, fallback: string): string => style.getPropertyValue(name).trim() || fallback

  return {
    background: read('--dsw-alias-bg-base', '#1e1e1e'),
    foreground: read('--dsw-alias-label-primary', '#d4d4d4'),
    cursor: read('--dsw-alias-brand-primary', '#4ea1ff'),
    selectionBackground: read('--dsw-alias-bg-layer-2', '#264f78'),
  }
}

/**
 * 读取本会话保存的终端 id 列表。
 * @param sessionId 会话 id
 * @returns 终端 id 列表
 */
function loadBindings(sessionId: string): string[] {
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${sessionId}`)
    const parsed: unknown = raw === null ? [] : JSON.parse(raw)

    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch (error) { // 存储损坏时从空列表开始，不影响新建终端
    console.error('[dsh-ide] 读取终端绑定失败:', error)

    return []
  }
}

/**
 * 保存本会话的终端 id 列表。
 * @param sessionId 会话 id
 * @param ids 终端 id
 */
function saveBindings(sessionId: string, ids: string[]): void {
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${sessionId}`, JSON.stringify(ids))
  } catch (error) { // 隐私模式下写入失败，仅影响刷新后的恢复
    console.error('[dsh-ide] 保存终端绑定失败:', error)
  }
}

/**
 * 渲染终端面板。
 * @param props 见 FeatureViewProps
 * @returns 终端页签与屏幕
 */
export function TerminalPanel({ t, sessionId, services }: FeatureViewProps): React.ReactElement {
  const remote = useSyncExternalStore(subscribeTerminalRemote, getTerminalRemote, getTerminalRemote)

  const [terminals, setTerminals] = useState<TerminalInfo[]>([])
  const [activeId, setActiveId] = useState('')
  const [error, setError] = useState('')

  /** 终端挂载点与内核。 */
  const hostRef = useRef<HTMLDivElement | null>(null)
  const kernelRef = useRef<TerminalKernel | null>(null)
  /** 当前附加流，供输入与尺寸变化回调使用。 */
  const streamRef = useRef<{ send(command: unknown): void } | null>(null)
  /** 是否已经写过一次快照。 */
  const snapshotRef = useRef(false)
  /** 上行命令序号。 */
  const sequenceRef = useRef(0)
  /** 已创建标记，避免同一会话重复恢复。 */
  const restoredRef = useRef('')

  // 会话变化：清空列表并恢复上次的终端绑定
  useEffect(() => {
    setTerminals([])
    setActiveId('')
    setError('')

    if (remote === undefined || sessionId === '' || restoredRef.current === sessionId) return

    restoredRef.current = sessionId
    const ids = loadBindings(sessionId)
    if (ids.length === 0) return

    void (async () => {
      const restored: TerminalInfo[] = []

      for (const id of ids) {
        // 用 create 恢复：同 id 已存在于宿主时它会直接返回现有终端而不是新建
        const result = await remote.create(sessionId, { id, cols: 80, rows: 24 })
        if (result.ok && result.value !== undefined) restored.push(result.value)
      }

      if (restored.length === 0) return

      setTerminals(restored)
      setActiveId(restored[restored.length - 1].id)
    })()
  }, [remote, sessionId])

  /**
   * 新建终端。
   */
  const createTerminal = useCallback(async (): Promise<void> => {
    if (remote === undefined || sessionId === '') return

    if (terminals.length >= MAX_TERMINALS) {
      services.notify('error', `${t('limitReached')} (${MAX_TERMINALS})`)

      return
    }

    const environment = await remote.environment(sessionId)
    if (!environment.ok || environment.value === undefined) {
      setError(environment.error?.message ?? t('createFailed'))

      return
    }

    // 用户设置的 shell 优先；未设置时交给宿主挑默认 shell
    const shell = services.settings().terminalShell
    const id = `ide-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
    const created = await remote.create(sessionId, {
      id,
      cols: Math.min(80, environment.value.maxCols),
      rows: Math.min(24, environment.value.maxRows),
      ...(shell === '' ? {} : { shellPath: shell }),
    })

    if (!created.ok || created.value === undefined) {
      setError(created.error?.message ?? t('createFailed'))

      return
    }

    const next = [...terminals, created.value]
    setTerminals(next)
    setActiveId(created.value.id)
    saveBindings(sessionId, next.map((item) => item.id))
  }, [remote, services, sessionId, t, terminals])

  /**
   * 关闭并移除一个终端。
   * @param id 终端 id
   */
  const closeTerminal = useCallback(
    async (id: string): Promise<void> => {
      if (remote === undefined) return

      const result = await remote.close(sessionId, id)

      if (!result.ok) {
        services.notify('error', t('closeFailed'))

        return
      }

      const next = terminals.filter((item) => item.id !== id)
      setTerminals(next)
      saveBindings(sessionId, next.map((item) => item.id))

      if (activeId === id) setActiveId(next.length > 0 ? next[next.length - 1].id : '')
    },
    [activeId, remote, services, sessionId, t, terminals],
  )

  /**
   * 重命名终端。
   * @param id 终端 id
   * @param title 新标题
   */
  const renameTerminal = useCallback(
    async (id: string, title: string): Promise<void> => {
      if (remote === undefined || title.trim() === '') return

      const result: RemoteResult<void> = await remote.rename(sessionId, id, title.trim())

      if (!result.ok) {
        services.notify('error', t('renameFailed'))

        return
      }

      setTerminals((previous) => previous.map((item) => (item.id === id ? { ...item, title: title.trim() } : item)))
    },
    [remote, services, sessionId, t],
  )

  // 活动终端变化时重建内核并附加输出流
  useEffect(() => {
    if (remote === undefined || activeId === '' || hostRef.current === null) return undefined

    const host = hostRef.current
    const controller = new AbortController()
    snapshotRef.current = false
    sequenceRef.current = 0

    let alive = true
    let kernel: TerminalKernel | null = null

    void loadLazyChunk<TerminalChunk>('terminal-kernel')
      .then((chunk) => {
        if (!alive) return undefined

        kernel = chunk.create({
          parent: host,
          theme: readTheme(),
          fontSize: services.settings().fontSize,
          onData: (data) => {
            const stream = streamRef.current
            if (stream === null || data === '') return

            sequenceRef.current += 1
            try {
              stream.send({ type: 'write', sequence: sequenceRef.current, data })
            } catch (sendError) { // 输入被拒时不重放，避免同一条命令被执行两次
              console.error('[dsh-ide] 终端输入发送失败:', sendError)
            }
          },
          onResize: (cols, rows) => {
            const stream = streamRef.current
            if (stream === null) return

            sequenceRef.current += 1
            try {
              stream.send({ type: 'resize', sequence: sequenceRef.current, cols, rows })
            } catch (resizeError) {
              console.error('[dsh-ide] 终端尺寸同步失败:', resizeError)
            }
          },
        })

        kernelRef.current = kernel

        return remote.attach(sessionId, activeId, controller.signal)
      })
      .then((attached) => {
        if (attached === undefined || !alive) return

        streamRef.current = attached

        void (async () => {
          try {
            for await (const frame of attached as AsyncIterable<TerminalFrame>) {
              if (!alive) return

              if (frame.type === 'snapshot') {
                // 快照是完整屏幕；第二次及以后的快照要先清屏，否则内容会叠在一起
                if (snapshotRef.current) kernel?.clear()
                kernel?.write(frame.screen)
                snapshotRef.current = true
                kernel?.focus()

                continue
              }

              if (frame.type === 'output') kernel?.write(frame.data)
            }
          } catch (attachError) { // 附加中断（进程结束、切走标签）不是故障
            if (!controller.signal.aborted) console.error('[dsh-ide] 终端附加流中断:', attachError)
          }
        })()
      })
      .catch((createError: unknown) => {
        console.error('[dsh-ide] 创建终端失败:', createError)
        setError(String(createError))
      })

    return () => {
      alive = false
      controller.abort()
      streamRef.current = null
      kernelRef.current = null
      kernel?.destroy()
    }
    // 只随活动终端重建；字号变化重建后屏幕由宿主快照恢复
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, remote, sessionId])

  const activeTerminal = terminals.find((item) => item.id === activeId)

  return (
    <div className="flex h-full min-h-0 flex-col bg-base">
      {/* 页签条：新建、切换、关闭 */}
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-line1 bg-surface1 px-2">
        {terminals.map((terminal) => (
          <div
            key={terminal.id}
            onClick={() => setActiveId(terminal.id)}
            onDoubleClick={() => {
              const title = window.prompt(t('renamePrompt'), terminal.title)
              if (title !== null) void renameTerminal(terminal.id, title)
            }}
            className={cn(
              'group flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-xs',
              terminal.id === activeId ? 'bg-base text-primary' : 'text-secondary hover:text-primary',
            )}
          >
            {/* 终端标题；进程已退出时附标记 */}
            <span className="max-w-32 truncate">
              {terminal.title}
              {terminal.state !== 'running' && ` (${t('exited')})`}
            </span>

            {/* 关闭终端：结束进程 */}
            <button
              type="button"
              title={t('closeTerminal')}
              onClick={(event) => {
                event.stopPropagation()
                void closeTerminal(terminal.id)
              }}
              className="rounded px-0.5 text-secondary opacity-0 hover:bg-surface2 hover:text-primary group-hover:opacity-100"
            >
              ×
            </button>
          </div>
        ))}

        {/* 新建终端 */}
        <button
          type="button"
          title={t('newTerminal')}
          onClick={() => void createTerminal()}
          className="rounded px-1.5 text-xs text-secondary hover:bg-surface2 hover:text-primary"
        >
          +
        </button>

        <span className="flex-1" />

        {/* 当前终端的 shell 与状态 */}
        {activeTerminal !== undefined && (
          <span className="shrink-0 text-[11px] text-secondary">
            {activeTerminal.state === 'running' ? activeTerminal.shell.name : t('exited')}
          </span>
        )}
      </div>

      {error !== '' && <div className="shrink-0 border-b border-line1 px-2 py-1 text-xs text-danger">{error}</div>}

      {remote === undefined && <div className="p-3 text-xs text-secondary">{t('unavailable')}</div>}

      {remote !== undefined && terminals.length === 0 && (
        <div className="p-3 text-xs text-secondary">
          {/* 空态：提示如何新建终端 */}
          {t('empty')}
          <button
            type="button"
            onClick={() => void createTerminal()}
            className="ml-2 bg-transparent text-info hover:underline"
          >
            {t('newTerminal')}
          </button>
        </div>
      )}

      {/* 终端挂载点：切换页签时保持同一个容器，避免反复重建 DOM */}
      <div ref={hostRef} className="min-h-0 flex-1 overflow-hidden px-1 py-1" />
    </div>
  )
}
