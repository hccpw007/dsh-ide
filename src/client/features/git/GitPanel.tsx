/**
 * Git 底部面板。
 *
 * 顶部是 IDEA 风格的工具窗口头：左侧标题 Git、固定页签、页签操作与右侧的
 * 更多/最小化按钮。面板自身渲染头部，因此外壳的默认标题栏对它隐藏。
 *
 * 页签分两类：固定页签常驻（Local Changes / Shelf / Log / Console）且不可关闭；
 * 历史页签由顶部 Show History 按文件打开，标题形如 `History: README.md`，可关闭。
 */
import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'

import { openIdeContextMenu } from '../../../common/context-menu'
import type { FeatureViewProps } from '../../shell/contract'

import { ConsoleTab } from './ConsoleTab'
import { GitPanelHeader } from './GitPanelHeader'
import { HistoryTab } from './HistoryTab'
import { LocalChanges } from './LocalChanges'
import { subscribeLogFocus, takeLogFocus } from './log-focus'
import { LogTab } from './LogTab'
import { ContextMenu, type MenuItem, type MenuState } from './menu'
import { ShelfTab } from './ShelfTab'

/** 固定页签标识。 */
export type GitTab = 'local' | 'shelf' | 'log' | 'console'

/** 历史页签标识前缀；标识本身是 `history:<相对路径>`。 */
const HISTORY_PREFIX = 'history:'

/** 常驻页签，按 IDEA 的 Git 窗口顺序排列。 */
const PINNED_TABS: { id: GitTab; label: string }[] = [
  { id: 'local', label: 'tabLocal' },
  { id: 'shelf', label: 'tabShelf' },
  { id: 'log', label: 'tabLog' },
  { id: 'console', label: 'tabConsole' },
]

/** 没有记忆时的默认页签；IDEA 的 Git 窗口默认停在 Local Changes。 */
const DEFAULT_TAB: GitTab = 'local'

/** 页签记忆的存储前缀；带版本段，格式变更时换版本而不是迁移。 */
const STORAGE_PREFIX = 'dsh-ide.git-tab.v1.'

/** 一个面板页签：固定页签与历史页签共用这个形态。 */
export interface GitPanelTab {
  /** 页签标识。 */
  id: string
  /** 页签标题。 */
  label: string
  /** 是否可以关闭；只有历史页签可以。 */
  closable: boolean
  /** 历史页签对应的文件路径；固定页签没有。 */
  path?: string
}

/**
 * 同一会话内已经打开的历史页签。
 *
 * 底部面板收起后 Git 面板会卸载，页签若只存在组件状态里就会丢失；IDEA 的工具
 * 窗口隐藏期间页签是保留的，因此这里按会话记住一份，重新展开时沿用。
 */
let openedHistory: { sessionId: string; paths: string[] } = { sessionId: '', paths: [] }

/**
 * 由文件路径拼出历史页签标识。
 * @param path 相对工作区根的路径
 * @returns 页签标识
 */
function historyTabId(path: string): string {
  return `${HISTORY_PREFIX}${path}`
}

/**
 * 取路径最后一段作为页签标题里的文件名。
 * @param path 相对路径
 * @returns 文件名
 */
function fileNameOf(path: string): string {
  return path.split('/').filter((part) => part !== '').pop() ?? path
}

/**
 * 读取会话上次激活的页签。
 * @param sessionId 会话 id
 * @returns 上次激活的页签；没有记录或记录不是合法页签时回落到默认页签
 */
function loadTab(sessionId: string): GitTab {
  if (sessionId === '') return DEFAULT_TAB

  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${sessionId}`)

    // 只接受当前存在的固定页签标识，旧版本写入的已删页签不能把面板渲染成空白
    return PINNED_TABS.some((item) => item.id === raw) ? (raw as GitTab) : DEFAULT_TAB
  } catch (error) { // 存储不可用（隐私模式）时按默认页签打开，不影响面板使用
    console.error('[dsh-ide] 读取 Git 页签失败:', error)

    return DEFAULT_TAB
  }
}

/**
 * 保存会话最后激活的页签。
 * @param sessionId 会话 id
 * @param tab 最后激活的页签
 */
function saveTab(sessionId: string, tab: GitTab): void {
  if (sessionId === '') return

  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${sessionId}`, tab)
  } catch (error) { // 写入失败只影响下次打开的页签记忆，不影响当前会话
    console.error('[dsh-ide] 保存 Git 页签失败:', error)
  }
}

/**
 * 读取会话里已经打开的历史页签。
 * @param sessionId 会话 id
 * @returns 文件路径列表
 */
function loadHistory(sessionId: string): string[] {
  return openedHistory.sessionId === sessionId ? openedHistory.paths : []
}

/**
 * 记住会话里已经打开的历史页签。
 * @param sessionId 会话 id
 * @param paths 文件路径列表
 */
function saveHistory(sessionId: string, paths: string[]): void {
  openedHistory = { sessionId, paths }
}

/**
 * 渲染 Git 面板。
 * @param props 见 FeatureViewProps
 * @returns 头部与当前页签内容
 */
export function GitPanel({ t, sessionId, services }: FeatureViewProps): React.ReactElement {
  const [activeId, setActiveId] = useState<string>(() => loadTab(sessionId))
  const [historyPaths, setHistoryPaths] = useState<string[]>(() => loadHistory(sessionId))
  /** 待 Log 页签定位的提交 hash；由历史页签的「在 Log 中定位」写入。 */
  const [logFocus, setLogFocus] = useState<string | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)

  // 切换会话后回到该会话上次激活的页签与历史页签，避免沿用上一个会话留下的状态
  useEffect(() => {
    setActiveId(loadTab(sessionId))
    setHistoryPaths(loadHistory(sessionId))
  }, [sessionId])

  /**
   * 打开某个文件的历史页签：已经打开过时只切换过去，不重复建页签。
   * @param path 相对工作区根的路径
   */
  const openHistory = useCallback(
    (path: string): void => {
      const id = historyTabId(path)

      setHistoryPaths((previous) => {
        if (previous.includes(path)) return previous

        const next = [...previous, path]
        saveHistory(sessionId, next)

        return next
      })
      setActiveId(id)
    },
    [sessionId],
  )

  // 顶部 Show History 的意图在这里落地：面板可能还没挂载，先取一次待办再订阅
  useEffect(() => {
    /**
     * 处理一次打开历史的请求。
     * @param path 相对路径
     */
    const handle = (path: string): void => {
      // 消费掉待办，否则下次重新挂载面板会把同一个旧请求再打开一次
      services.consumeFileHistory()
      openHistory(path)
    }

    const pending = services.consumeFileHistory()
    if (pending !== null) handle(pending)

    return services.subscribeFileHistory(handle)
  }, [openHistory, services])

  /** 清空待定位的提交；必须稳定，否则 Log 页签的定位效果会反复重跑。 */
  const clearLogFocus = useCallback((): void => setLogFocus(null), [])

  /**
   * 切换页签并记住选择；面板下次打开时直接回到这个页签。
   * @param id 目标页签标识
   */
  const selectTab = useCallback(
    (id: string): void => {
      setActiveId(id)

      // 固定页签才进记忆：历史页签按文件区分，换仓库后未必还存在
      if (!id.startsWith(HISTORY_PREFIX)) saveTab(sessionId, id as GitTab)
    },
    [sessionId],
  )

  // 「在 Log 中定位」的意图：历史页签与推送弹窗都会发，面板可能刚被打开，先取待办再订阅
  useEffect(() => {
    /**
     * 落地一次定位请求：切到 Log 页签，把提交交给它选中。
     * @param hash 提交 hash
     */
    const handle = (hash: string): void => {
      setLogFocus(hash)
      selectTab('log')
    }

    const queued = takeLogFocus()
    if (queued !== '') handle(queued)

    return subscribeLogFocus(handle)
  }, [selectTab])

  // 工作区根由会话绑定，可能在首条消息之后才出现，订阅后才能重新加载数据
  const root = useSyncExternalStore(
    (listener) => services.subscribeRoot(listener),
    () => services.root,
    () => services.root,
  )

  /** 页签列表，文案随语言切换更新。 */
  const tabs = useMemo<GitPanelTab[]>(
    () => [
      ...PINNED_TABS.map((item) => ({ id: item.id, label: t(item.label), closable: false })),
      ...historyPaths.map((path) => ({
        id: historyTabId(path),
        label: `${t('tabHistory')}: ${fileNameOf(path)}`,
        closable: true,
        path,
      })),
    ],
    [historyPaths, t],
  )

  // 当前页签被关掉（或换会话后不存在）时回落到第一个固定页签，而不是渲染空白
  const activeTab = tabs.find((tab) => tab.id === activeId) ?? tabs[0]

  /**
   * 关闭一个历史页签。
   * @param id 页签标识
   */
  const closeTab = useCallback(
    (id: string): void => {
      const index = tabs.findIndex((tab) => tab.id === id)

      setHistoryPaths((previous) => {
        const next = previous.filter((path) => historyTabId(path) !== id)
        saveHistory(sessionId, next)

        return next
      })

      if (activeId !== id) return

      // 关掉当前页签后落到它右边的历史页签，没有就回落到默认固定页签
      const neighbour = tabs[index + 1]

      setActiveId(neighbour !== undefined && neighbour.closable ? neighbour.id : DEFAULT_TAB)
    },
    [activeId, sessionId, tabs],
  )

  /**
   * 打开右上角更多菜单。
   * @param event 鼠标事件
   */
  const openMoreMenu = useCallback(
    (event: React.MouseEvent): void => {
      const items: MenuItem[] = [
        ...tabs.map((item) => ({
          id: item.id,
          label: item.label,
          run: () => selectTab(item.id),
        })),
        {
          id: 'close',
          label: t('closePanel'),
          separatorBefore: true,
          run: () => services.closeBottomPanel(),
        },
      ]

      setMenu({ x: event.clientX - 180, y: event.clientY + 16, items })
    },
    [selectTab, services, t, tabs],
  )

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-surface1"
      // Git 面板空白区右键：刷新状态、收起面板与设置入口
      onContextMenu={(event) => {
        if (event.defaultPrevented) return

        openIdeContextMenu(event, services, [
          {
            id: 'refresh',
            label: t('refresh'),
            shortcut: '⌘R',
            run: () => {
              services.invalidate()
              services.refreshGitStatus()
            },
          },
          { id: 'close', label: t('closePanel'), separatorBefore: true, run: () => services.closeBottomPanel() },
          {
            id: 'settings',
            label: t('menuSettings'),
            shortcut: '⌘,',
            separatorBefore: true,
            run: () => services.openPage('settings'),
          },
        ])
      }}
    >
      <GitPanelHeader
        t={t}
        tabs={tabs}
        active={activeTab.id}
        onSelect={selectTab}
        onClose={closeTab}
        onMore={openMoreMenu}
        onMinimize={() => services.closeBottomPanel()}
      />

      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab.id === 'local' && <LocalChanges t={t} services={services} root={root} />}
        {activeTab.id === 'shelf' && <ShelfTab t={t} services={services} root={root} />}
        {activeTab.id === 'log' && (
          <LogTab
            t={t}
            services={services}
            root={root}
            revealCommit={logFocus ?? ''}
            onRevealed={clearLogFocus}
          />
        )}
        {activeTab.id === 'console' && <ConsoleTab t={t} services={services} />}
        {activeTab.path !== undefined && (
          // 历史页签按路径区分：切换页签即换一份历史，key 让状态不串到另一个文件
          <HistoryTab
            key={activeTab.path}
            t={t}
            services={services}
            root={root}
            path={activeTab.path}
            // 在 Log 中定位：切到 Log 页签并把这条提交交给它选中
            onShowInLog={(commit) => {
              setLogFocus(commit.hash)
              selectTab('log')
            }}
          />
        )}
      </div>

      {menu !== null && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </div>
  )
}
