/**
 * 终端面板。
 *
 * 终端进程由宿主的 `remote.terminal` 承载：创建、附加、重命名、关闭都按会话隔离，
 * 刷新页面后同一个终端 id 能重新附加并恢复屏幕。xterm 内核走懒加载 chunk。
 *
 * 绑定关系保存在 localStorage（`dsh-ide.terminal.v1.<sessionId>`），折叠底部面板、
 * 切走标签、刷新页面都不会丢掉终端列表。面板挂载时若没有可恢复的终端，会自动创建
 * 一个 Local 会话，保证打开终端面板立刻可用。
 */
import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { openIdeContextMenu } from '../../../common/context-menu'
import {
  getTerminalRemote,
  subscribeTerminalRemote,
  type TerminalInfo,
} from '../../../common/terminal-remote'
import type { FeatureViewProps } from '../../shell/contract'

import { TerminalHeader } from './TerminalHeader'
import { loadBindings, nextTerminalTitle, saveBindings } from './terminal-bindings'
import { useTerminalAttachment } from './use-terminal-attachment'

/** 宿主终端上限（与宿主 maxTerminals 默认值一致）。 */
const MAX_TERMINALS = 8

/**
 * 渲染终端面板。
 * @param props 见 FeatureViewProps
 * @returns 终端头部与屏幕
 */
export function TerminalPanel({ t, sessionId, services }: FeatureViewProps): React.ReactElement {
  const remote = useSyncExternalStore(subscribeTerminalRemote, getTerminalRemote, getTerminalRemote)

  const [terminals, setTerminals] = useState<TerminalInfo[]>([])
  const [activeId, setActiveId] = useState('')
  const [error, setError] = useState('')

  /** 终端挂载点。 */
  const hostRef = useRef<HTMLDivElement | null>(null)
  /** 会话恢复标记，避免同一会话重复恢复或重复自动建终端。 */
  const restoredRef = useRef('')

  /**
   * 待切到的目录：项目树等入口发起「在终端打开」时记下，终端附加完成后执行 cd。
   */
  const pendingCwdRef = useRef<string | null>(null)

  /** 取走待执行的目录跳转；附加 hook 在终端就绪后调用一次。 */
  const takeCwd = useCallback((): string | null => {
    const path = pendingCwdRef.current
    pendingCwdRef.current = null

    return path
  }, [])

  const { sendInput, kernel } = useTerminalAttachment({
    remote,
    sessionId,
    activeId,
    host: hostRef,
    fontSize: services.settings().fontSize,
    takeCwd,
    onError: (message) => setError(message),
  })

  /**
   * 创建一个终端并返回宿主元信息。
   *
   * 新建后按 IDEA 的默认命名把页签标题改成 Local / Local 2…；重命名失败只记日志，
   * 页签退回宿主给的标题仍然可用，不值得打断用户。
   * @param existing 已存在的终端，用于挑选未被占用的页签名
   * @returns 创建成功的终端；失败时返回 null 并写入错误提示
   */
  const spawnTerminal = useCallback(
    async (existing: readonly TerminalInfo[]): Promise<TerminalInfo | null> => {
      if (remote === undefined || sessionId === '') return null

      const environment = await remote.environment(sessionId)
      if (!environment.ok || environment.value === undefined) {
        setError(environment.error?.message ?? t('createFailed'))

        return null
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

        return null
      }

      const title = nextTerminalTitle(existing.map((item) => item.title))
      const renamed = await remote.rename(sessionId, id, title)

      if (!renamed.ok) {
        console.error('[dsh-ide] 终端重命名失败:', renamed.error?.message)
      }

      return renamed.ok ? { ...created.value, title } : created.value
    },
    [remote, services, sessionId, t],
  )

  /** 初始化流程要调用最新的 spawnTerminal，又不该因此重跑恢复逻辑。 */
  const spawnTerminalRef = useRef(spawnTerminal)
  spawnTerminalRef.current = spawnTerminal

  // 会话变化：清空列表，恢复上次的终端；没有可恢复的终端时自动建一个
  useEffect(() => {
    setTerminals([])
    setActiveId('')
    setError('')

    if (remote === undefined || sessionId === '' || restoredRef.current === sessionId) return undefined

    restoredRef.current = sessionId
    let alive = true

    void (async () => {
      const restored: TerminalInfo[] = []

      for (const id of loadBindings(sessionId)) {
        // 用 create 恢复：同 id 已存在于宿主时它会直接返回现有终端而不是新建
        const result = await remote.create(sessionId, { id, cols: 80, rows: 24 })
        if (result.ok && result.value !== undefined) restored.push(result.value)
      }

      if (!alive) return

      if (restored.length > 0) {
        setTerminals(restored)
        setActiveId(restored[restored.length - 1].id)

        return
      }

      // 打开终端面板时至少要有一个初始化好的会话，与 IDEA 默认打开 Local 一致
      const created = await spawnTerminalRef.current([])
      if (created === null) {
        // 宿主暂不可用时解除标记：服务重新就绪后 effect 会再次尝试初始化
        restoredRef.current = ''

        return
      }

      if (!alive) return

      setTerminals([created])
      setActiveId(created.id)
      saveBindings(sessionId, [created.id])
    })()

    return () => {
      alive = false
    }
  }, [remote, sessionId])

  /**
   * 新建终端。
   */
  const createTerminal = useCallback(async (): Promise<void> => {
    if (remote === undefined || sessionId === '') return

    if (terminals.length >= MAX_TERMINALS) {
      services.toast('error', `${t('limitReached')} (${String(MAX_TERMINALS)})`)

      return
    }

    const created = await spawnTerminal(terminals)
    if (created === null) return

    const next = [...terminals, created]
    setTerminals(next)
    setActiveId(created.id)
    saveBindings(sessionId, next.map((item) => item.id))
  }, [remote, services, sessionId, spawnTerminal, t, terminals])

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
   * 关闭所有终端，与 IDEA 的 Close All Sessions 一致。
   */
  const closeAllTerminals = useCallback(async (): Promise<void> => {
    if (remote === undefined || terminals.length === 0) return

    let failed = false

    for (const terminal of terminals) {
      const result = await remote.close(sessionId, terminal.id)
      if (!result.ok) {
        failed = true
        console.error('[dsh-ide] 关闭终端失败:', terminal.id, result.error?.message)
      }
    }

    if (failed) services.toast('error', t('closeFailed'))

    setTerminals([])
    setActiveId('')
    saveBindings(sessionId, [])
  }, [remote, services, sessionId, t, terminals])

  /**
   * 重命名终端。
   * @param id 终端 id
   * @param title 新标题
   */
  const renameTerminal = useCallback(
    async (id: string, title: string): Promise<void> => {
      if (remote === undefined || title.trim() === '') return

      const result = await remote.rename(sessionId, id, title.trim())

      if (!result.ok) {
        services.toast('error', t('renameFailed'))

        return
      }

      setTerminals((previous) => previous.map((item) => (item.id === id ? { ...item, title: title.trim() } : item)))
    },
    [remote, services, sessionId, t],
  )

  /**
   * 弹出重命名输入框。
   * @param id 终端 id
   */
  const promptRename = useCallback(
    (id: string): void => {
      const terminal = terminals.find((item) => item.id === id)
      if (terminal === undefined) return

      const title = window.prompt(t('renamePrompt'), terminal.title)
      if (title !== null) void renameTerminal(id, title)
    },
    [renameTerminal, t, terminals],
  )

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
      const activeKernel = kernel()
      const selected = activeKernel?.getSelection() ?? ''

      const copy = (): void => {
        void navigator.clipboard.writeText(selected).catch((copyError: unknown) => {
          console.error('[dsh-ide] 复制终端选中文本失败:', copyError)
          services.toast('error', t('copyFailed'))
        })
      }

      const paste = (): void => {
        void navigator.clipboard
          .readText()
          .then((text) => sendInput(text))
          .catch((pasteError: unknown) => {
            console.error('[dsh-ide] 读取剪贴板失败:', pasteError)
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
          ...(activeKernel === null ? {} : { run: () => activeKernel.selectAll() }),
        },
        { id: 'clear', label: t('menuClear'), ...(activeKernel === null ? {} : { run: () => activeKernel.clear() }) },
        // 终端查找依赖 xterm 的搜索插件，当前未启用
        { id: 'find', label: t('menuFind'), shortcut: '⌘F', separatorBefore: true },
        { id: 'newTerminal', label: t('newTerminal'), separatorBefore: true, run: () => void createTerminal() },
        {
          id: 'rename',
          label: t('menuRename'),
          ...(activeTerminal === undefined ? {} : { run: () => promptRename(activeTerminal.id) }),
        },
        {
          id: 'close',
          label: t('closeTerminal'),
          ...(activeTerminal === undefined ? {} : { run: () => void closeTerminal(activeTerminal.id) }),
        },
      ])
    },
    [
      activeTerminal,
      closeTerminal,
      createTerminal,
      kernel,
      promptRename,
      sendInput,
      services,
      t,
    ],
  )

  /**
   * 打开头部的更多操作菜单（⋮）。
   * @param event 点击事件
   */
  const openMoreMenu = useCallback(
    (event: React.MouseEvent): void => {
      const activeKernel = kernel()

      openIdeContextMenu(event, services, [
        { id: 'newTerminal', label: t('newTerminal'), run: () => void createTerminal() },
        {
          id: 'rename',
          label: t('menuRename'),
          ...(activeTerminal === undefined ? {} : { run: () => promptRename(activeTerminal.id) }),
        },
        {
          id: 'close',
          label: t('closeTerminal'),
          ...(activeTerminal === undefined ? {} : { run: () => void closeTerminal(activeTerminal.id) }),
        },
        {
          id: 'closeAll',
          label: t('closeAll'),
          ...(terminals.length === 0 ? {} : { run: () => void closeAllTerminals() }),
        },
        {
          id: 'clear',
          label: t('menuClear'),
          separatorBefore: true,
          ...(activeKernel === null ? {} : { run: () => activeKernel.clear() }),
        },
      ])
    },
    [activeTerminal, closeAllTerminals, closeTerminal, createTerminal, kernel, promptRename, services, t, terminals],
  )

  /**
   * 展开页签下拉列表：终端较多时从这里快速切换。
   * @param event 点击事件
   */
  const openTerminalList = useCallback(
    (event: React.MouseEvent): void => {
      openIdeContextMenu(event, services, [
        ...terminals.map((terminal) => ({
          id: terminal.id,
          label: terminal.title,
          selected: terminal.id === activeId,
          run: () => setActiveId(terminal.id),
        })),
        { id: 'newTerminal', label: t('newTerminal'), separatorBefore: true, run: () => void createTerminal() },
      ])
    },
    [activeId, createTerminal, services, t, terminals],
  )

  return (
    <div className="flex h-full min-h-0 flex-col bg-base">
      <TerminalHeader
        t={t}
        terminals={terminals}
        activeId={activeId}
        onSelect={setActiveId}
        onClose={(id) => void closeTerminal(id)}
        onRename={promptRename}
        onNew={() => void createTerminal()}
        onDropdown={openTerminalList}
        onMore={openMoreMenu}
        onMinimize={() => services.closeBottomPanel()}
        onContextMenu={openTerminalMenu}
        newDisabled={terminals.length >= MAX_TERMINALS}
      />

      {error !== '' && <div className="shrink-0 border-b border-line1 px-2 py-1 text-xs text-danger">{error}</div>}

      {remote === undefined && <div className="p-3 text-xs text-secondary">{t('unavailable')}</div>}

      {remote !== undefined && terminals.length === 0 && (
        <div className="p-3 text-xs text-secondary">
          {/* 空态：所有终端关闭后提示如何重新打开 */}
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
