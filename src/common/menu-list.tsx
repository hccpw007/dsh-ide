/**
 * 右键菜单的行列表与子菜单。
 *
 * 与浮层分开：浮层（context-menu.tsx）只管位置、遮罩与 Esc，这里管行渲染、悬停
 * 与子菜单展开。拆开的直接原因是子菜单是递归结构，混进浮层会让公共工具文件越过
 * 拆分阈值。
 *
 * 子菜单用 fixed 定位贴在父项右侧，空间不足时翻到左侧；这比绝对定位更稳，菜单
 * 本体将来加滚动条也不会裁剪子菜单。
 */
import React, { useCallback, useLayoutEffect, useRef, useState } from 'react'

import { cn } from './cn'
import type { IdeMenuItem } from './context-menu'

/** 菜单默认最小宽度；与 IDEA 右键菜单的比例一致。 */
const MENU_MIN_WIDTH = 248

/** 菜单贴边时保留的视口边距。 */
const VIEWPORT_MARGIN = 8

/** 子菜单相对父项顶部的偏移，让两端的圆角看起来齐平。 */
const SUBMENU_TOP_OFFSET = -4

/** 子菜单与父项的水平间距。 */
const SUBMENU_SIDE_GAP = 2

/** 子菜单最小宽度：子项通常很少，用父菜单的宽度会显得空。 */
const SUBMENU_MIN_WIDTH = 200

/** 子菜单锚点：展开中父项在视口里的位置。 */
interface MenuAnchor {
  /** 父项上边距。 */
  top: number
  /** 父项左边距。 */
  left: number
  /** 父项右边距。 */
  right: number
}

/** 菜单列表 props。 */
export interface MenuListProps {
  /** 菜单项。 */
  items: readonly IdeMenuItem[]
  /** 最小宽度；下拉类菜单需要更宽，便于放下长配置名。 */
  minWidth?: number
  /** 执行菜单项；是否关闭整棵菜单由浮层决定。 */
  onSelect(item: IdeMenuItem): void
  /** 收起整棵菜单；行内动作不走 onSelect，需要自己先收起。 */
  onClose(): void
}

/**
 * 渲染一组菜单项，并管理它自己的子菜单。
 * @param props 见 MenuListProps
 * @returns 菜单盒子（背景、边框与行）
 */
export function MenuList({ items, minWidth, onSelect, onClose }: MenuListProps): React.ReactElement {
  /** 当前展开子菜单的父项 id；null 表示没有展开。 */
  const [openId, setOpenId] = useState<string | null>(null)
  /** 展开中父项的矩形；子菜单据此定位。 */
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null)

  /**
   * 悬停或点击父项时展开子菜单，悬停普通项时收起。
   * @param item 当前行
   * @param element 当前行元素，用来取锚点
   */
  const openSubmenu = useCallback((item: IdeMenuItem, element: HTMLElement): void => {
    if (item.children === undefined || item.children.length === 0) {
      setOpenId(null)
      setAnchor(null)

      return
    }

    const rect = element.getBoundingClientRect()

    setOpenId(item.id)
    setAnchor({ top: rect.top, left: rect.left, right: rect.right })
  }, [])

  const openItem = items.find((item) => item.id === openId)

  return (
    <div
      role="menu"
      className="rounded-md border border-line2 bg-[var(--ide-menu-bg)] py-1 shadow-lg"
      style={{ minWidth: minWidth ?? MENU_MIN_WIDTH }}
      // 菜单内再次右键保持菜单打开，并阻止外层兜底菜单重复弹出
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      {items.map((item) => {
        const hasChildren = item.children !== undefined && item.children.length > 0
        // 没有 run 也没有子菜单的项是「结构占位」：保留在菜单里但置灰
        const disabled = item.disabled === true || (item.run === undefined && !hasChildren)
        // 子菜单展开时父项保持高亮，与 IDEA 的级联菜单一致
        const expanded = openId === item.id

        return (
          <React.Fragment key={item.id}>
            {/* 分隔线不额外占高度：IDEA 的分组间距与普通相邻行完全一致 */}
            {item.separatorBefore === true && <div className="h-px bg-line1" />}

            {/*
              * 行内动作需要独立点击，因此这一行不能用 button 包 button；
              * 改成容器 + 两个并列按钮，悬停底色挂在容器上，视觉上仍是一整行。
              * 悬停监听放在容器上：置灰项的按钮不派发鼠标事件，挂按钮上子菜单收不起来。
              */}
            <div
              role="menuitem"
              aria-disabled={disabled}
              aria-haspopup={hasChildren ? 'menu' : undefined}
              onMouseEnter={(event) => openSubmenu(item, event.currentTarget)}
              className={cn(
                'mx-1 flex items-center rounded',
                item.selected === true
                  ? // 当前选中项：IDEA 用实心强调蓝配白字，与 hover 的浅底明显区分
                    'bg-info text-onAccent'
                  : item.highlight === true
                    ? // 强调块：低饱和蓝底配常规前景色，深浅主题都能看清
                      'bg-info/40 text-primary'
                    : item.danger === true
                      ? 'text-danger hover:bg-danger/15'
                      : 'text-primary hover:bg-surface3',
                expanded && item.selected !== true && item.highlight !== true && item.danger !== true && 'bg-surface3',
                disabled && 'opacity-60 hover:bg-transparent',
              )}
            >
              <button
                type="button"
                disabled={disabled}
                onClick={(event) => {
                  if (hasChildren) {
                    openSubmenu(item, event.currentTarget.parentElement ?? event.currentTarget)

                    return
                  }

                  onSelect(item)
                }}
                onFocus={(event) => {
                  if (hasChildren) openSubmenu(item, event.currentTarget.parentElement ?? event.currentTarget)
                }}
                className={cn(
                  'flex min-w-0 flex-1 items-center gap-2 px-2 py-[5px] text-[13px] leading-[18px]',
                  item.highlight === true ? 'justify-center' : 'text-left',
                  disabled ? 'cursor-default' : 'cursor-pointer',
                )}
              >
                {/* 图标列固定宽度，多条操作的文案才能左右对齐 */}
                {item.icon !== undefined && item.highlight !== true && (
                  <span
                    className={cn(
                      'flex w-4 shrink-0 items-center justify-center',
                      item.danger === true ? 'text-danger' : item.selected === true ? 'text-onAccent' : 'text-secondary',
                    )}
                  >
                    {item.icon}
                  </span>
                )}

                <span className="flex-1 truncate">{item.label}</span>

                {/* 快捷键提示：与 IDEA 一样固定在右侧 */}
                {item.shortcut !== undefined && (
                  <span className={cn('shrink-0 pl-6', item.selected === true ? 'text-onAccent' : 'text-secondary')}>
                    {item.shortcut}
                  </span>
                )}

                {/* 子菜单标记：有 children 表示可展开，只置 submenu 表示能力暂未实现、仅画箭头 */}
                {(hasChildren || item.submenu === true) && <span className="shrink-0 text-secondary">›</span>}
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
        )
      })}

      {openItem !== undefined && openItem.children !== undefined && anchor !== null && (
        <SubmenuPopup
          key={openItem.id}
          anchor={anchor}
          items={openItem.children}
          onSelect={onSelect}
          onClose={onClose}
        />
      )}
    </div>
  )
}

/** 子菜单 props。 */
interface SubmenuPopupProps {
  /** 父项矩形。 */
  anchor: MenuAnchor
  /** 子菜单项。 */
  items: readonly IdeMenuItem[]
  /** 执行子项。 */
  onSelect(item: IdeMenuItem): void
  /** 收起整棵菜单；子菜单里的行内动作用它。 */
  onClose(): void
}

/**
 * 渲染贴在父项右侧的子菜单。
 *
 * 首帧先按父项右侧摆放，布局完成后测量真实尺寸：右侧放不下就翻到父项左侧，
 * 上下超出视口就收进视口，长菜单靠右、靠下时也不会被裁掉。
 * @param props 见 SubmenuPopupProps
 * @returns 子菜单浮层
 */
function SubmenuPopup({ anchor, items, onSelect, onClose }: SubmenuPopupProps): React.ReactElement {
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  /** 实测尺寸后修正的位置。 */
  const [position, setPosition] = useState({ left: anchor.right + SUBMENU_SIDE_GAP, top: anchor.top + SUBMENU_TOP_OFFSET })
  /** 只修正一次：位置稳定后再测量会来回震荡。 */
  const measuredRef = useRef(false)

  // 父项换了会重建组件（key 是父项 id），因此这里只需要在挂载后量一次
  useLayoutEffect(() => {
    const element = wrapperRef.current

    if (element === null || measuredRef.current) return
    measuredRef.current = true

    const rect = element.getBoundingClientRect()
    const left =
      rect.right > window.innerWidth - VIEWPORT_MARGIN
        ? Math.max(VIEWPORT_MARGIN, anchor.left - rect.width - SUBMENU_SIDE_GAP)
        : anchor.right + SUBMENU_SIDE_GAP
    const top = Math.max(
      VIEWPORT_MARGIN,
      Math.min(anchor.top + SUBMENU_TOP_OFFSET, window.innerHeight - rect.height - VIEWPORT_MARGIN),
    )

    setPosition({ left, top })
  }, [anchor])

  return (
    <div
      ref={wrapperRef}
      className="fixed z-[10000]"
      style={{ left: position.left, top: position.top }}
      // 子菜单里的右键同样不产生新菜单
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <MenuList items={items} minWidth={SUBMENU_MIN_WIDTH} onSelect={onSelect} onClose={onClose} />
    </div>
  )
}
