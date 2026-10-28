/**
 * Git 面板头部。
 *
 * 结构照截图：左侧「Git」标题，随后是 Local Changes / Log / Console 三个页签，
 * 页签后是关闭、新建与页签列表按钮，右侧是更多操作与最小化。
 */
import React from 'react'

import { cn } from '../../../common/cn'
import type { Translate } from '../../../types/plugin'

import type { GitTab } from './GitPanel'
import { chevronDownIcon, closeIcon, kebabIcon, minimizeIcon, plusIcon } from './icons'

/** 头部 props。 */
export interface GitPanelHeaderProps {
  /** 已绑定 git 前缀的翻译函数。 */
  t: Translate
  /** 全部页签。 */
  tabs: { id: GitTab; label: string }[]
  /** 当前页签。 */
  active: GitTab
  /** 切换页签。 */
  onSelect(tab: GitTab): void
  /** 关闭当前页签（收起整个面板）。 */
  onCloseTab(): void
  /** 新建控制台页签。 */
  onNewTab(): void
  /** 打开页签列表菜单。 */
  onTabList(event: React.MouseEvent): void
  /** 打开更多操作菜单。 */
  onMore(event: React.MouseEvent): void
  /** 最小化面板。 */
  onMinimize(): void
}

/**
 * 渲染 Git 面板头部。
 * @param props 见 GitPanelHeaderProps
 * @returns 标题、页签与操作按钮
 */
export function GitPanelHeader({
  t,
  tabs,
  active,
  onSelect,
  onCloseTab,
  onNewTab,
  onTabList,
  onMore,
  onMinimize,
}: GitPanelHeaderProps): React.ReactElement {
  return (
    <div className="flex h-9 shrink-0 items-stretch border-b border-line1 bg-layer1">
      {/* 工具窗口名称 */}
      <div className="flex items-center pl-3 pr-4 text-[13px] font-medium text-primary">{t('title')}</div>

      <div role="tablist" className="flex items-stretch">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === active}
            onClick={() => onSelect(tab.id)}
            className={cn(
              'px-3 text-[12px] transition-colors',
              tab.id === active
                ? 'bg-info/30 text-primary'
                : 'text-secondary hover:bg-layer2 hover:text-primary',
            )}
          >
            {/* 页签名称 */}
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-0.5 pl-1">
        <HeaderButton title={t('closePanel')} onClick={onCloseTab}>
          {closeIcon()}
        </HeaderButton>
        <HeaderButton title={t('newTab')} onClick={onNewTab}>
          {plusIcon()}
        </HeaderButton>
        <HeaderButton title={t('tabList')} onClick={onTabList}>
          {chevronDownIcon()}
        </HeaderButton>
      </div>

      <span className="flex-1" />

      <div className="flex items-center gap-0.5 pr-2">
        <HeaderButton title={t('moreActions')} onClick={onMore}>
          {kebabIcon()}
        </HeaderButton>
        <HeaderButton title={t('minimize')} onClick={onMinimize}>
          {minimizeIcon()}
        </HeaderButton>
      </div>
    </div>
  )
}

/** 头部图标按钮。 */
function HeaderButton({
  title,
  onClick,
  children,
}: {
  title: string
  onClick(event: React.MouseEvent): void
  children: React.ReactNode
}): React.ReactElement {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="flex h-6 w-6 items-center justify-center rounded text-secondary transition-colors hover:bg-layer2 hover:text-primary"
    >
      {children}
    </button>
  )
}
