/**
 * Git 底部面板。
 *
 * 顶部是 IDEA 风格的工具窗口头：左侧标题 Git、三个固定页签、页签操作与右侧的
 * 更多/最小化按钮。面板自身渲染头部，因此外壳的默认标题栏对它隐藏。
 */
import React, { useCallback, useMemo, useState, useSyncExternalStore } from 'react'

import type { FeatureViewProps } from '../../shell/contract'

import { ConsoleTab } from './ConsoleTab'
import { GitPanelHeader } from './GitPanelHeader'
import { LocalChanges } from './LocalChanges'
import { LogTab } from './LogTab'
import { ContextMenu, type MenuItem, type MenuState } from './menu'

/** 页签标识。 */
export type GitTab = 'local' | 'log' | 'console'

/**
 * 渲染 Git 面板。
 * @param props 见 FeatureViewProps
 * @returns 头部与当前页签内容
 */
export function GitPanel({ t, services }: FeatureViewProps): React.ReactElement {
  const [tab, setTab] = useState<GitTab>('local')
  const [menu, setMenu] = useState<MenuState | null>(null)

  // 工作区根由会话绑定，可能在首条消息之后才出现，订阅后才能重新加载数据
  const root = useSyncExternalStore(
    (listener) => services.subscribeRoot(listener),
    () => services.root,
    () => services.root,
  )

  /** 页签顺序与文案。 */
  const tabs = useMemo<{ id: GitTab; label: string }[]>(
    () => [
      { id: 'local', label: t('tabLocal') },
      { id: 'log', label: t('tabLog') },
      { id: 'console', label: t('tabConsole') },
    ],
    [t],
  )

  /**
   * 打开页签选择菜单。
   * @param event 鼠标事件
   */
  const openTabMenu = useCallback(
    (event: React.MouseEvent): void => {
      setMenu({
        x: event.clientX,
        y: event.clientY + 16,
        items: tabs.map((item) => ({
          id: item.id,
          label: `${tab === item.id ? '✓ ' : ''}${item.label}`,
          run: () => setTab(item.id),
        })),
      })
    },
    [tab, tabs],
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
          run: () => setTab(item.id),
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
    [services, t, tabs],
  )

  return (
    <div className="flex h-full min-h-0 flex-col bg-base">
      <GitPanelHeader
        t={t}
        tabs={tabs}
        active={tab}
        onSelect={setTab}
        onCloseTab={() => services.closeBottomPanel()}
        onNewTab={() => setTab('console')}
        onTabList={openTabMenu}
        onMore={openMoreMenu}
        onMinimize={() => services.closeBottomPanel()}
      />

      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === 'local' && <LocalChanges t={t} services={services} root={root} />}
        {tab === 'log' && <LogTab t={t} services={services} root={root} />}
        {tab === 'console' && <ConsoleTab t={t} services={services} />}
      </div>

      {menu !== null && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </div>
  )
}
