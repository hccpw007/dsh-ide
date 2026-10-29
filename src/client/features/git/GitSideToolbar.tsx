/**
 * Git 面板左侧的竖向工具栏。
 *
 * IDEA 的 Git 工具窗口在每个页签左侧都挂一条图标条，三个页签的图标各不相同。
 * 图标条与面板同底色、不画边框：靠留白与图标分组表达层级，加边框会把工具栏
 * 从面板里「切」出来，和 IDEA 的观感不符。
 *
 * 这里只做展示与事件转发：按钮不持有状态，禁用的按钮保留位置并写明原因，
 * 避免点上去没有任何反应。
 */
import React, { Fragment } from 'react'

import { cn } from '../../../common/cn'

/** 工具栏上的一项。 */
export interface GitToolbarItem {
  /** 稳定 id，同时作为 key。 */
  id: string
  /** 悬停提示。 */
  title: string
  /** 图标节点。 */
  icon: React.ReactNode
  /** 不可用的原因；有值时按钮禁用，并拼进悬停提示。 */
  unavailable?: string
  /** 与上一项之间画一条分隔线。 */
  separatorBefore?: boolean
  /** 点击回调。 */
  onClick?(): void
}

/** 竖向工具栏 props。 */
export interface GitSideToolbarProps {
  /** 无障碍名称，说明这组按钮属于哪个页签。 */
  label: string
  /** 按钮列表，按数组顺序从上往下排。 */
  items: GitToolbarItem[]
}

/**
 * 渲染竖向工具栏。
 * @param props 见 GitSideToolbarProps
 * @returns 一列图标按钮
 */
export function GitSideToolbar({ label, items }: GitSideToolbarProps): React.ReactElement {
  return (
    <div
      role="toolbar"
      aria-label={label}
      className="flex w-[30px] shrink-0 flex-col items-center gap-px bg-surface1 py-1.5"
    >
      {items.map((item) => {
        const disabled = item.unavailable !== undefined

        return (
          <Fragment key={item.id}>
            {item.separatorBefore === true && <span aria-hidden="true" className="my-1.5 h-px w-4 bg-line1" />}

            <button
              type="button"
              title={disabled ? `${item.title} — ${item.unavailable}` : item.title}
              aria-label={item.title}
              disabled={disabled}
              onClick={item.onClick}
              className={cn(
                'flex h-7 w-[26px] items-center justify-center rounded transition-colors',
                disabled
                  ? 'cursor-default text-secondary/40'
                  : 'text-secondary hover:bg-surface2 hover:text-primary',
              )}
            >
              {item.icon}
            </button>
          </Fragment>
        )
      })}
    </div>
  )
}
