/**
 * 工作台的右键菜单与下拉菜单。
 *
 * 菜单项文案一律由调用方从语言包取，这里只负责定位、关闭、图标与配色。
 * 下拉（如顶部的运行配置）与右键菜单共用同一套外观：行高、悬停底色、选中块
 * 都按 IDEA 新 UI 的比例取值，避免两种菜单风格不一致。
 */
import React, { useEffect } from 'react'

import { cn } from '../../../common/cn'

/** 菜单项右侧的行内动作，如配置项的编辑与删除。 */
export interface MenuAction {
  /** 唯一标识。 */
  id: string
  /** 悬停提示。 */
  title: string
  /** 图标。 */
  icon: React.ReactNode
  /** 是否危险操作；使用错误色。 */
  danger?: boolean
  /** 点击执行。 */
  run(): void
}

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
  /** 是否用强调底色标出（如下拉底部的「Add Configuration…」）。 */
  highlight?: boolean
  /** 是否在该项之前画分隔线。 */
  separatorBefore?: boolean
  /** 行尾动作；有值时该项右侧出现图标按钮。 */
  actions?: MenuAction[]
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

/** 估算单行高度，用于把菜单往视口内收；与下面渲染的字号行高对应。 */
const ROW_HEIGHT = 26

/**
 * 渲染一个浮层菜单。
 * @param props 菜单状态与关闭回调
 * @returns 菜单浮层；状态为空时由调用方不渲染
 */
export function ContextMenu({ menu, onClose }: { menu: MenuState; onClose(): void }): React.ReactElement {
  const width = menu.minWidth ?? MENU_WIDTH
  // 视口右/下边缘先做一次粗略收敛，避免菜单跑到屏幕外
  const left = Math.min(menu.x, Math.max(8, window.innerWidth - width - 8))
  const top = Math.min(menu.y, Math.max(8, window.innerHeight - menu.items.length * ROW_HEIGHT - 16))

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
        className="fixed z-[9999] rounded-md border border-line2 bg-surface2 py-1 shadow-xl"
        style={{ left, top, minWidth: width }}
        onContextMenu={(event) => event.preventDefault()}
      >
        {menu.items.map((item) => (
          <React.Fragment key={item.id}>
            {item.separatorBefore === true && <div className="my-1 h-px bg-line1" />}

            {/*
              * 行内动作区需要能独立点击，因此这一行不能用 button 包 button；
              * 改成容器 + 两个并列按钮，悬停底色挂在容器上，视觉上仍是一整行。
              */}
            <div
              role="menuitem"
              aria-disabled={item.disabled === true}
              className={cn(
                'mx-1 flex items-center rounded',
                item.highlight === true
                  ? // 底部强调块：低饱和蓝底配常规前景色，深浅主题都能看清
                    'bg-info/40 text-primary'
                  : item.danger === true
                    ? 'text-danger hover:bg-danger/15'
                    : 'text-primary hover:bg-surface3',
                item.disabled === true && 'opacity-40 hover:bg-transparent',
              )}
            >
              <button
                type="button"
                disabled={item.disabled === true}
                onClick={() => {
                  onClose()
                  item.run()
                }}
                className={cn(
                  'flex min-w-0 flex-1 items-center gap-2 px-1.5 py-[3px] text-xs leading-[18px]',
                  item.highlight === true ? 'justify-center' : 'text-left',
                  item.disabled === true ? 'cursor-default' : 'cursor-pointer',
                )}
              >
                {/* 图标列固定宽度，多条配置的文案才能左右对齐 */}
                {item.icon !== undefined && item.highlight !== true && (
                  <span
                    className={cn(
                      'flex w-4 shrink-0 items-center justify-center',
                      item.danger === true ? 'text-danger' : 'text-secondary',
                    )}
                  >
                    {item.icon}
                  </span>
                )}

                <span className="truncate">{item.label}</span>
              </button>

              {item.actions !== undefined && item.actions.length > 0 && (
                <span className="flex shrink-0 items-center gap-0.5 pr-1">
                  {item.actions.map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      title={action.title}
                      aria-label={action.title}
                      onClick={(event) => {
                        event.stopPropagation()
                        onClose()
                        action.run()
                      }}
                      className={cn(
                        'flex h-6 w-6 items-center justify-center rounded text-secondary opacity-70 transition hover:bg-surface3 hover:opacity-100',
                        action.danger === true && 'text-danger',
                      )}
                    >
                      {action.icon}
                    </button>
                  ))}
                </span>
              )}
            </div>
          </React.Fragment>
        ))}
      </div>
    </>
  )
}
