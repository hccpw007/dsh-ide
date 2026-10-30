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
import { openIdeContextMenu } from '../../../common/context-menu'
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
      services.toast('error', `${t('limitReached')} (${MAX_TERMINALS})`)

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
        services.toast('error', t('closeFailed'))

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
        services.toast('error', t('renameFailed'))

        return
      }

      setTerminals((previous) => previous.map((item) => (item.id === id ? { ...item, title: title.trim() } : item)))
    },
    [remote, services, sessionId, t],
  )

  /**
   * 把一段输入送到当前终端的附加流。
   *
   * 键盘输入与右键菜单的「粘贴」共用这条路径；序号递增保证宿主按顺序执行，
   * 发送被拒时不重放，避免同一条命令被执行两次。
   * @param data 待发送的字符串
   */
  const sendInput = useCallback((data: string): void => {
    const stream = streamRef.current
    if (stream === null || data === '') return

    sequenceRef.current += 1

    try {
      stream.send({ type: 'write', sequence: sequenceRef.current, data })
    } catch (error) { // 输入被拒时不重放，避免同一条命令被执行两次
      console.error('[dsh-ide] 终端输入发送失败:', error)
    }
  }, [])

  /**
   * 待切到的目录：项目树等入口发起「在终端打开」时记下，终端附加完成后执行 cd。
   */
  const pendingCwdRef = useRef<string | null>(null)

  /** 创建终端的稳定引用：订阅回调里要用最新一次的 createTerminal，又不该反复重订阅。 */
  const createTerminalRef = useRef(createTerminal)
  createTerminalRef.current = createTerminal

  // 消费「在终端打开」意图：挂载时补取一次，避免面板尚未渲染时发出的请求丢失
  useEffect(() => {
    const handle = (path: string): void => {
      pendingCwdRef.current = path
      void createTerminalRef.current()
    }

    const pending = services.consumeTerminalAt()
    if (pending !== null) handle(pending)

    return services.subscribeTerminalAt(handle)
  }, [services])

  // 活动终端变化时重建内核并附加输出流
  useEffect(() => {    if (remote === undefined || activeId === '' || hostRef.current === null) return undefined

    const host = hostRef.current
    const controller = new AbortController()
    snapshotRef.current = false
    sequenceRef.current = 0

    let alive = true
    let kernel: TerminalKernel | null = null
    /** 待写入 xterm 的输出；终端输出帧的频率可能远高于刷新率，按帧合并。 */
    let pendingWrite = ''
    /** 已排队的写入帧；null 表示没有待写内容。 */
    let writeFrame: number | null = null
    /** 进入目录的延时命令；卸载时要撤销，否则会往已销毁的终端里写。 */
    let cwdTimer: number | null = null

    /** 把攒下的输出一次写进终端。 */
    const flushWrite = (): void => {
      writeFrame = null

      if (pendingWrite === '') return

      const data = pendingWrite
      pendingWrite = ''
      kernel?.write(data)
    }

    void loadLazyChunk<TerminalChunk>('terminal-kernel')
      .then((chunk) => {
        if (!alive) return undefined

        kernel = chunk.create({
          parent: host,
          theme: readTheme(),
          fontSize: services.settings().fontSize,
          onData: (data) => sendInput(data),
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

        // 带着目录进来时先 cd 过去；等一拍让 shell 完成初始化，否则命令会被忽略
        const pendingCwd = pendingCwdRef.current
        if (pendingCwd !== null) {
          pendingCwdRef.current = null
          cwdTimer = window.setTimeout(() => sendInput(`cd '${pendingCwd}'\r`), 120)
        }

        void (async () => {
          try {
            for await (const frame of attached as AsyncIterable<TerminalFrame>) {
              if (!alive) return

              if (frame.type === 'snapshot') {
                // 落掉攒下的输出，保证快照与之前内容的先后顺序
                if (writeFrame !== null) {
                  window.cancelAnimationFrame(writeFrame)
                  flushWrite()
                }

                // 快照是完整屏幕；第二次及以后的快照要先清屏，否则内容会叠在一起
                if (snapshotRef.current) kernel?.clear()
                kernel?.write(frame.screen)
                snapshotRef.current = true
                kernel?.focus()

                continue
              }

              if (frame.type === 'output') {
                pendingWrite += frame.data

                // 逐帧写会让 xterm 在爆发输出（构建日志、`yes`）时反复触发渲染
                if (writeFrame === null) writeFrame = window.requestAnimationFrame(flushWrite)
              }
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

      // 撤销挂起的写入帧与延时命令，它们会引用即将销毁的终端
      if (writeFrame !== null) window.cancelAnimationFrame(writeFrame)
      if (cwdTimer !== null) window.clearTimeout(cwdTimer)

      writeFrame = null
      pendingWrite = ''
      streamRef.current = null
      kernelRef.current = null
      kernel?.destroy()
    }
    // 只随活动终端重建；字号变化重建后屏幕由宿主快照恢复
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, remote, sessionId])

  const activeTerminal = terminals.find((item) => item.id === activeId)

  /**
   * 打开终端右键菜单。
   *
   * 页签条与终端正文共用这套项：复制依赖 xterm 的选区，粘贴走剪贴板再送入附加流，
   * 全选与清屏走内核；重命名沿用双击页签时的同一套输入流程。
   * @param event 右键事件
   */
  const openTerminalMenu = useCallback(
    (event: React.MouseEvent): void => {
      const kernel = kernelRef.current
      const selected = kernel?.getSelection() ?? ''
      const active = activeTerminal

      const copy = (): void => {
        void navigator.clipboard.writeText(selected).catch((error: unknown) => {
          console.error('[dsh-ide] 复制终端选中文本失败:', error)
          services.toast('error', t('copyFailed'))
        })
      }

      const paste = (): void => {
        void navigator.clipboard
          .readText()
          .then((text) => sendInput(text))
          .catch((error: unknown) => {
            console.error('[dsh-ide] 读取剪贴板失败:', error)
            services.toast('error', t('pasteFailed'))
          })
      }

      openIdeContextMenu(event, services, [
        { id: 'copy', label: t('menuCopy'), shortcut: '⌘C', ...(selected === '' ? {} : { run: copy }) },
        { id: 'paste', label: t('menuPaste'), shortcut: '⌘V', run: paste },
        {
          id: 'selectAll',
          label: t('menuSelectAll'),
          shortcut: '⌘A',
          ...(kernel === null ? {} : { run: () => kernel.selectAll() }),
        },
        { id: 'clear', label: t('menuClear'), ...(kernel === null ? {} : { run: () => kernel.clear() }) },
        // 终端查找依赖 xterm 的搜索插件，当前未启用
        { id: 'find', label: t('menuFind'), shortcut: '⌘F', separatorBefore: true },
        { id: 'newTerminal', label: t('newTerminal'), separatorBefore: true, run: () => void createTerminal() },
        {
          id: 'rename',
          label: t('menuRename'),
          ...(active === undefined
            ? {}
            : {
                run: () => {
                  const title = window.prompt(t('renamePrompt'), active.title)
                  if (title !== null) void renameTerminal(active.id, title)
                },
              }),
        },
        {
          id: 'close',
          label: t('closeTerminal'),
          ...(active === undefined ? {} : { run: () => void closeTerminal(active.id) }),
        },
      ])
    },
    [activeTerminal, closeTerminal, createTerminal, renameTerminal, sendInput, services, t],
  )

  return (
    <div className="flex h-full min-h-0 flex-col bg-base">
      {/* 页签条：新建、切换、关闭 */}
      <div
        className="flex h-8 shrink-0 items-center gap-1 border-b border-line1 bg-surface1 px-2"
        // 页签条右键与终端正文共用同一套菜单，与 IDEA 的终端工具窗口一致
        onContextMenu={openTerminalMenu}
      >
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
      <div
        ref={hostRef}
        className="min-h-0 flex-1 overflow-hidden px-1 py-1"
        // 捕获阶段接管：xterm 自己也会监听右键，先在这里拦下才能弹出 IDE 菜单
        onContextMenuCapture={openTerminalMenu}
      />
    </div>
  )
}
