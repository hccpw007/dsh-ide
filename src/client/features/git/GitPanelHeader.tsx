/**
 * Git 面板头部。
 *
 * 结构照 IDEA 的 Git 工具窗口：左侧「Git」标题，随后是页签，右侧是更多操作与
 * 最小化。与 IDEA 一致，头部不画分隔线——选中页签用一块略微抬高的圆角底色标出
 * 层级，靠底色区分而不是边框。
 *
 * 历史页签可以关闭，关闭入口画在页签内部；固定页签没有关闭入口。
 */
import React from 'react'

import { cn } from '../../../common/cn'
import type { Translate } from '../../../types/plugin'

import type { GitPanelTab } from './GitPanel'
import { kebabIcon, minimizeIcon } from './icons'

/** 头部 props。 */
export interface GitPanelHeaderProps {
  /** 已绑定 git 前缀的翻译函数。 */
  t: Translate
  /** 全部页签。 */
  tabs: GitPanelTab[]
  /** 当前页签标识。 */
  active: string
  /** 切换页签。 */
  onSelect(id: string): void
  /** 关闭页签；只有可关闭页签才会被调用。 */
  onClose(id: string): void
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
  onClose,
  onMore,
  onMinimize,
}: GitPanelHeaderProps): React.ReactElement {
  return (
    <div className="flex h-9 shrink-0 items-center bg-surface1 pl-3 pr-2">
      {/* 工具窗口名称，IDEA 里是粗体且比页签大一号 */}
      <span className="mr-3 text-[13px] font-semibold text-primary">{t('title')}</span>

      <div role="tablist" className="flex items-center gap-0.5">
        {tabs.map((tab) => {
          const selected = tab.id === active

          return (
            // 页签用 div 而不是 button：关闭按钮必须是独立的可点元素，按钮不能嵌套
            <div
              key={tab.id}
              role="tab"
              tabIndex={0}
              aria-selected={selected}
              onClick={() => onSelect(tab.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelect(tab.id)
                }
              }}
              className={cn(
                'flex h-6 cursor-pointer items-center rounded-md text-[12px] transition-colors',
                // 选中页签复用编辑区页签的深蓝底与蓝边，IDEA 里工具窗口页签与编辑器页签同一套配色
                selected
                  ? 'bg-tabactive text-tablabel ring-1 ring-tabline'
                  : 'text-secondary hover:bg-tabactive/50 hover:text-tablabel',
                tab.closable ? 'pl-2.5 pr-1' : 'px-2.5',
              )}
            >
              {/* 页签名称 */}
              <span className="max-w-56 truncate">{tab.label}</span>

              {tab.closable && (
                // 关闭页签：与编辑器页签的关闭钮同一形状，悬停加深
                <button
                  type="button"
                  title={t('closeTab')}
                  aria-label={t('closeTab')}
                  onClick={(event) => {
                    event.stopPropagation()
                    onClose(tab.id)
                  }}
                  className="ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-secondary opacity-70 transition-opacity hover:bg-surface2 hover:text-primary hover:opacity-100"
                >
                  {closeTabIcon()}
                </button>
              )}
            </div>
          )
        })}
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

/** 页签上的关闭叉：尺寸与编辑器页签的关闭钮对齐，避免工具窗口页签里显得过小。 */
function closeTabIcon(): React.ReactNode {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.4 3.4l9.2 9.2M12.6 3.4l-9.2 9.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
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
