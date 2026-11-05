/**
 * Git 底部面板。
 *
 * 顶部是 IDEA 风格的工具窗口头：左侧标题 Git、固定页签、页签操作与右侧的
 * 更多/最小化按钮。面板自身渲染头部，因此外壳的默认标题栏对它隐藏。
 *
 * 页签分两类：固定页签常驻（Local Changes / Shelf / Log / Console）且不可关闭；
 * 历史页签由顶部 Show History 按文件打开，标题形如 `History: README.md`，可关闭。
 *
 * 打开面板时的默认页签：有该会话的页签记忆就沿用；没有记忆时按变更状态决定——
 * 有待提交的文件（含未跟踪文件）停在 Local Changes，没有则停在 Log。
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'

import { openIdeContextMenu } from '../../../common/context-menu'
import { safeSetItem } from '../../../common/storage-maintenance'
import type { FeatureViewProps } from '../../shell/contract'
import { PanelErrorBoundary } from '../../shell/panel-error-boundary'

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

/**
 * 状态还没读到过、或关闭历史页签后的回落页签。
 *
 * IDEA 的 Git 窗口默认停在 Local Changes，因此这里也以它作为兜底。
 */
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
 * @returns 上次激活的页签；没有记录或记录不是合法页签时返回 null，交由变更状态决定默认值
 */
function loadTab(sessionId: string): GitTab | null {
  if (sessionId === '') return null

  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${sessionId}`)

    // 只接受当前存在的固定页签标识，旧版本写入的已删页签不能把面板渲染成空白
    return PINNED_TABS.some((item) => item.id === raw) ? (raw as GitTab) : null
  } catch (error) { // 存储不可用（隐私模式）时交给变更状态决定默认页签，不影响面板使用
    console.error('[dsh-ide] 读取 Git 页签失败:', error)

    return null
  }
}

/**
 * 按当前变更状态挑选默认页签。
 * @param status 相对路径 → 状态字母的映射
 * @returns 有待提交的文件时 Local Changes，否则 Log
 */
function defaultTabFor(status: ReadonlyMap<string, string>): GitTab {
  return status.size > 0 ? 'local' : 'log'
}

/**
 * 取打开面板时要显示的页签。
 * @param services 工作台服务总线
 * @param sessionId 会话 id
 * @returns 有页签记忆时用记忆；没有记忆时按变更状态决定，状态还没读到过时先落在默认页签
 */
function initialTab(services: FeatureViewProps['services'], sessionId: string): GitTab {
  const remembered = loadTab(sessionId)

  if (remembered !== null) return remembered

  // 状态还没读到过时先不判定：空映射会被误当成「没有变更」而打开 Log
  return services.gitIgnored() === null ? DEFAULT_TAB : defaultTabFor(services.gitStatus())
}

/**
 * 保存会话最后激活的页签。
 * @param sessionId 会话 id
 * @param tab 最后激活的页签
 */
function saveTab(sessionId: string, tab: GitTab): void {
  if (sessionId === '') return

  safeSetItem(`${STORAGE_PREFIX}${sessionId}`, tab)
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
export function GitPanel({ t, rootT, sessionId, services }: FeatureViewProps): React.ReactElement {
  const [activeId, setActiveId] = useState<string>(() => initialTab(services, sessionId))
  const [historyPaths, setHistoryPaths] = useState<string[]>(() => loadHistory(sessionId))
  /** 待 Log 页签定位的提交 hash；由历史页签的「在 Log 中定位」写入。 */
  const [logFocus, setLogFocus] = useState<string | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  /** 用户是否手动切换过页签；置位后不再由变更状态改写当前页签。 */
  const manualSelectionRef = useRef(false)

  // 切换会话后回到该会话上次激活的页签与历史页签，避免沿用上一个会话留下的状态
  useEffect(() => {
    manualSelectionRef.current = false

    const remembered = loadTab(sessionId)
    setActiveId(remembered ?? DEFAULT_TAB)
    setHistoryPaths(loadHistory(sessionId))

    // 有页签记忆时已经定下页签，不再看变更状态
    if (remembered !== null) return undefined

    let decided = false

    /**
     * 按变更状态决定默认页签：有变更看 Local Changes，没变更看 Log。
     * 只决定一次，之后的状态刷新与用户手动切换都不再被覆盖。
     */
    const decide = (): void => {
      if (decided || manualSelectionRef.current || services.gitIgnored() === null) return

      decided = true
      setActiveId(defaultTabFor(services.gitStatus()))
    }

    // 状态已经读到过就立刻决定；否则等第一次状态广播，避免把「还没读到」当成「没有变更」
    if (services.gitIgnored() !== null) {
      decide()

      return undefined
    }

    return services.subscribeGitStatus(decide)
  }, [sessionId, services])

  /**
   * 打开某个文件的历史页签：已经打开过时只切换过去，不重复建页签。
   * @param path 相对工作区根的路径
   */
  const openHistory = useCallback(
    (path: string): void => {
      // 打开历史页签是用户操作，之后变更状态刷新不再改写当前页签
      manualSelectionRef.current = true

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
      // 用户手动选择后，变更状态刷新不再改写当前页签
      manualSelectionRef.current = true
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
   * 已经渲染过的页签集合。
   *
   * 旧实现按条件渲染：切走即卸载，切回重新挂载并全量拉取（Local Changes 重跑
   * `git status --untracked-files=all`，Log 重拉 refs + 作者 + 100 条提交），
   * 折叠状态与选中项同时丢失。改成「访问过就保活、切走只隐藏」。
   */
  const [visited, setVisited] = useState<ReadonlySet<string>>(
    () => new Set<string>(activeTab === undefined ? [] : [activeTab.id]),
  )

  useEffect(() => {
    if (activeTab === undefined) return

    setVisited((previous) => (previous.has(activeTab.id) ? previous : new Set(previous).add(activeTab.id)))
  }, [activeTab])

  /**
   * 关闭一个历史页签。
   * @param id 页签标识
   */
  const closeTab = useCallback(
    (id: string): void => {
      // 关闭页签是用户操作，之后变更状态刷新不再改写当前页签
      manualSelectionRef.current = true

      const index = tabs.findIndex((tab) => tab.id === id)

      setHistoryPaths((previous) => {
        const next = previous.filter((path) => historyTabId(path) !== id)
        saveHistory(sessionId, next)

        return next
      })

      // 关掉的页签不再保活：重新打开时要拿到最新的历史
      setVisited((previous) => {
        if (!previous.has(id)) return previous

        const next = new Set(previous)
        next.delete(id)

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
            run: () => {
              services.invalidate()
              services.refreshGitStatus()
            },
          },
          { id: 'close', label: t('closePanel'), separatorBefore: true, run: () => services.closeBottomPanel() },
          {
            id: 'settings',
            label: t('menuSettings'),
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
        {/*
          已访问的页签保活：切走只隐藏（display:none），切回保留折叠状态、选中项与
          已加载数据，不再重新全量拉取。单页签各自套一层错误边界，互不牵连。
        */}
        {tabs
          .filter((tab) => visited.has(tab.id))
          .map((tab) => (
            <div
              key={tab.id}
              className={tab.id === activeTab?.id ? 'h-full min-h-0' : 'hidden'}
              // 隐藏页签不参与无障碍树与 Tab 焦点顺序
              aria-hidden={tab.id === activeTab?.id ? undefined : true}
            >
              <PanelErrorBoundary
                name={`git-tab:${tab.id}`}
                t={rootT}
                className="flex h-full flex-col items-center justify-center gap-2 p-4 text-xs"
              >
                {tab.id === 'local' && <LocalChanges t={t} services={services} root={root} />}
                {tab.id === 'shelf' && <ShelfTab t={t} services={services} root={root} />}
                {tab.id === 'log' && (
                  <LogTab
                    t={t}
                    services={services}
                    root={root}
                    revealCommit={logFocus ?? ''}
                    onRevealed={clearLogFocus}
                  />
                )}
                {tab.id === 'console' && <ConsoleTab t={t} services={services} />}
                {tab.path !== undefined && (
                  // 历史页签按路径区分：切换页签即换一份历史，key 让状态不串到另一个文件
                  <HistoryTab
                    key={tab.path}
                    t={t}
                    services={services}
                    root={root}
                    path={tab.path}
                    // 在 Log 中定位：切到 Log 页签并把这条提交交给它定位
                    onShowInLog={(commit) => {
                      setLogFocus(commit.hash)
                      selectTab('log')
                    }}
                  />
                )}
              </PanelErrorBoundary>
            </div>
          ))}
      </div>

      {menu !== null && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </div>
  )
}
