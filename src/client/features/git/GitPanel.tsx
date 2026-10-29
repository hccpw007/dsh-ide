/**
 * Git 底部面板。
 *
 * 顶部是 IDEA 风格的工具窗口头：左侧标题 Git、固定页签、页签操作与右侧的
 * 更多/最小化按钮。面板自身渲染头部，因此外壳的默认标题栏对它隐藏。
 *
 * 页签栏只常驻 Local Changes / Shelf / Log 三个——与 IDEA 的 Git 窗口一致；
 * 控制台属于按需打开的辅助视图，从「+」与页签下拉里进入。
 */
import React, { useCallback, useMemo, useState, useSyncExternalStore } from 'react'

import type { FeatureViewProps } from '../../shell/contract'

import { ConsoleTab } from './ConsoleTab'
import { GitPanelHeader } from './GitPanelHeader'
import { LocalChanges } from './LocalChanges'
import { LogTab } from './LogTab'
import { ContextMenu, type MenuItem, type MenuState } from './menu'
import { ShelfTab } from './ShelfTab'

/** 页签标识。 */
export type GitTab = 'local' | 'shelf' | 'log' | 'console'

/** 常驻页签；控制台不在其中。 */
const PINNED_TABS: { id: GitTab; label: string }[] = [
  { id: 'local', label: 'tabLocal' },
  { id: 'shelf', label: 'tabShelf' },
  { id: 'log', label: 'tabLog' },
]

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

  /** 常驻页签；控制台打开时会临时补到末尾。 */
  const tabs = useMemo(() => {
    const pinned = PINNED_TABS.map((item) => ({ id: item.id, label: t(item.label) }))

    // 控制台没有常驻位置，但打开后必须出现在页签栏，否则当前页签没有任何选中态
    return tab === 'console' ? [...pinned, { id: 'console' as const, label: t('tabConsole') }] : pinned
  }, [t, tab])

  /**
   * 打开页签选择菜单；控制台在这里补位。
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
    <div className="flex h-full min-h-0 flex-col bg-surface1">
      <GitPanelHeader
        t={t}
        tabs={tabs}
        active={tab}
        onSelect={setTab}
        onNewTab={() => setTab('console')}
        onTabList={openTabMenu}
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
