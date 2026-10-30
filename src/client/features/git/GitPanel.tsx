/**
 * Git 底部面板。
 *
 * 顶部是 IDEA 风格的工具窗口头：左侧标题 Git、固定页签、页签操作与右侧的
 * 更多/最小化按钮。面板自身渲染头部，因此外壳的默认标题栏对它隐藏。
 *
 * 页签栏常驻 Local Changes / Shelf / Log / Console 四个——控制台与其余页签并列，
 * 始终可直接点击，不提供新建或页签列表入口。
 */
import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'

import { openIdeContextMenu } from '../../../common/context-menu'
import type { FeatureViewProps } from '../../shell/contract'

import { ConsoleTab } from './ConsoleTab'
import { GitPanelHeader } from './GitPanelHeader'
import { LocalChanges } from './LocalChanges'
import { LogTab } from './LogTab'
import { ContextMenu, type MenuItem, type MenuState } from './menu'
import { ShelfTab } from './ShelfTab'

/** 页签标识。 */
export type GitTab = 'local' | 'shelf' | 'log' | 'console'

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

/**
 * 读取会话上次激活的页签。
 * @param sessionId 会话 id
 * @returns 上次激活的页签；没有记录或记录不是合法页签时回落到默认页签
 */
function loadTab(sessionId: string): GitTab {
  if (sessionId === '') return DEFAULT_TAB

  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${sessionId}`)

    // 只接受当前存在的页签标识，旧版本写入的已删页签不能把面板渲染成空白
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
 * 渲染 Git 面板。
 * @param props 见 FeatureViewProps
 * @returns 头部与当前页签内容
 */
export function GitPanel({ t, sessionId, services }: FeatureViewProps): React.ReactElement {
  const [tab, setTab] = useState<GitTab>(() => loadTab(sessionId))
  const [menu, setMenu] = useState<MenuState | null>(null)

  // 切换会话后回到该会话上次激活的页签，避免沿用上一个会话留下的选择
  useEffect(() => {
    setTab(loadTab(sessionId))
  }, [sessionId])

  /**
   * 切换页签并记住选择；面板下次打开时直接回到这个页签。
   * @param next 目标页签
   */
  const selectTab = useCallback(
    (next: GitTab): void => {
      setTab(next)
      saveTab(sessionId, next)
    },
    [sessionId],
  )

  // 工作区根由会话绑定，可能在首条消息之后才出现，订阅后才能重新加载数据
  const root = useSyncExternalStore(
    (listener) => services.subscribeRoot(listener),
    () => services.root,
    () => services.root,
  )

  /** 页签列表，文案随语言切换更新。 */
  const tabs = useMemo(() => PINNED_TABS.map((item) => ({ id: item.id, label: t(item.label) })), [t])

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
        active={tab}
        onSelect={selectTab}
        onMore={openMoreMenu}
        onMinimize={() => services.closeBottomPanel()}
      />

      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === 'local' && <LocalChanges t={t} services={services} root={root} />}
        {tab === 'shelf' && <ShelfTab t={t} services={services} root={root} />}
        {tab === 'log' && <LogTab t={t} services={services} root={root} />}
        {tab === 'console' && <ConsoleTab t={t} services={services} />}
      </div>

      {menu !== null && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </div>
  )
}
