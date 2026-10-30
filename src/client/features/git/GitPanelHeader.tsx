/**
 * Git 面板头部。
 *
 * 结构照 IDEA 的 Git 工具窗口：左侧「Git」标题，随后是页签，页签后是新建与
 * 页签列表按钮，右侧是更多操作与最小化。与 IDEA 一致，头部不画分隔线——选中
 * 页签用一块略微抬高的圆角底色标出层级，靠底色区分而不是边框。
 */
import React from 'react'

import { cn } from '../../../common/cn'
import type { Translate } from '../../../types/plugin'

import type { GitTab } from './GitPanel'
import { chevronDownIcon, kebabIcon, minimizeIcon, plusIcon } from './icons'

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
  onNewTab,
  onTabList,
  onMore,
  onMinimize,
}: GitPanelHeaderProps): React.ReactElement {
  return (
    <div className="flex h-9 shrink-0 items-center bg-surface1 pl-3 pr-2">
      {/* 工具窗口名称，IDEA 里是粗体且比页签大一号 */}
      <span className="mr-3 text-[13px] font-semibold text-primary">{t('title')}</span>

      <div role="tablist" className="flex items-center gap-0.5">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === active}
            onClick={() => onSelect(tab.id)}
            className={cn(
              'h-6 rounded-md px-2.5 text-[12px] transition-colors',
              // 选中页签复用编辑区页签的深蓝底与蓝边，IDEA 里工具窗口页签与编辑器页签同一套配色
              tab.id === active
                ? 'bg-tabactive text-tablabel ring-1 ring-tabline'
                : 'text-secondary hover:bg-tabactive/50 hover:text-tablabel',
            )}
          >
            {/* 页签名称 */}
            {tab.label}
          </button>
        ))}
      </div>

      <div className="ml-1.5 flex items-center gap-0.5">
        <HeaderButton title={t('newTab')} onClick={onNewTab}>
          {plusIcon()}
        </HeaderButton>
        <HeaderButton title={t('tabList')} onClick={onTabList}>
          {chevronDownIcon()}
        </HeaderButton>
      </div>

      <span className="flex-1" />

      <div className="flex items-center gap-0.5">
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
      className="flex h-6 w-6 items-center justify-center rounded text-secondary transition-colors hover:bg-surface2 hover:text-primary"
    >
      {children}
    </button>
  )
}
