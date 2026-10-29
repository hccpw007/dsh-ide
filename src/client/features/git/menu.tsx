/**
 * 工作台的右键菜单与下拉菜单。
 *
 * 菜单项文案一律由调用方从语言包取，这里只负责定位、关闭、图标与配色。
 * 下拉（如顶部的运行配置）与右键菜单共用同一套外观，避免出现两种菜单风格。
 */
import React, { useEffect } from 'react'

import { cn } from '../../../common/cn'

/** 一个菜单项。 */
export interface MenuItem {
  /** 唯一标识。 */
  id: string
  /** 展示文案。 */
  label: string
  /** 文案前的图标；不传时该行不留图标位。 */
  icon?: React.ReactNode
  /** 是否危险操作；使用错误色。 */
  danger?: boolean
  /** 是否禁用。 */
  disabled?: boolean
  /** 是否用强调底色标出（如下拉里的「Edit Configurations…」）。 */
  highlight?: boolean
  /** 是否在该项之前画分隔线。 */
  separatorBefore?: boolean
  /** 点击执行。 */
  run(): void
}

/** 菜单状态：位置与内容。 */
export interface MenuState {
  /** 视口坐标。 */
  x: number
  /** 视口坐标。 */
  y: number
  /** 菜单项。 */
  items: MenuItem[]
  /** 最小宽度；下拉类菜单需要比右键菜单更宽，便于放下长配置名。 */
  minWidth?: number
}

/** 菜单根节点的默认宽度；超出视口时向内收。 */
const MENU_WIDTH = 220

/**
 * 渲染一个浮层菜单。
 * @param props 菜单状态与关闭回调
 * @returns 菜单浮层；状态为空时由调用方不渲染
 */
export function ContextMenu({ menu, onClose }: { menu: MenuState; onClose(): void }): React.ReactElement {
  const width = menu.minWidth ?? MENU_WIDTH
  // 视口右/下边缘先做一次粗略收敛，避免菜单跑到屏幕外
  const left = Math.min(menu.x, Math.max(8, window.innerWidth - width - 8))
  const top = Math.min(menu.y, Math.max(8, window.innerHeight - menu.items.length * 24 - 16))

  useEffect(() => {
    /** 按 Esc 关闭菜单。 */
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onKeyDown)

    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <>
      {/* 点击空白处关闭；透明覆盖层同时阻断下层交互 */}
      <div className="fixed inset-0 z-[9998]" onClick={onClose} onContextMenu={(event) => event.preventDefault()} />

      <div
        role="menu"
        className="fixed z-[9999] rounded-md border border-line2 bg-overlay py-1 shadow-2xl"
        style={{ left, top, minWidth: width }}
        onContextMenu={(event) => event.preventDefault()}
      >
        {menu.items.map((item) => (
          <React.Fragment key={item.id}>
            {item.separatorBefore === true && <div className="my-1 h-px bg-line1" />}

            <button
              type="button"
              role="menuitem"
              disabled={item.disabled === true}
              onClick={() => {
                onClose()
                item.run()
              }}
              className={cn(
                'flex items-center gap-2.5 py-[5px] text-left text-xs transition-colors',
                item.highlight === true
                  ? 'mx-1 w-[calc(100%-8px)] rounded px-2 bg-info text-inverted hover:bg-info'
                  : 'w-full px-3',
                item.highlight !== true && item.danger === true && 'text-danger hover:bg-danger/15',
                item.highlight !== true && item.danger !== true && 'text-primary hover:bg-info/20',
                item.disabled === true && 'cursor-default opacity-40 hover:bg-transparent',
              )}
            >
              {/* 图标列固定宽度，多条配置的文案才能左右对齐 */}
              {item.icon !== undefined && (
                <span className="flex w-4 shrink-0 items-center justify-center text-secondary">{item.icon}</span>
              )}

              <span className="truncate">{item.label}</span>
            </button>
          </React.Fragment>
        ))}
      </div>
    </>
  )
}
