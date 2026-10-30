/**
 * 通用右键菜单浮层。
 *
 * 全插件共用一套菜单外观与交互：工具窗口、编辑器、终端、底部面板等区域把各自的
 * 菜单项交给这里渲染，因此行高、快捷键列、子菜单箭头在所有区域完全一致，与 IDEA
 * 的菜单比例对齐。菜单项文案由调用方按自己的语言包翻译后传入，公共层不认识任何
 * feature 的语义。
 */
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { cn } from './cn'

/** 菜单项右侧的行内动作，如运行配置项的编辑与删除。 */
export interface IdeMenuRowAction {
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

/** 右键菜单里的一项。 */
export interface IdeMenuItem {
  /** 唯一标识。 */
  id: string
  /** 展示文案；由调用方按自己的语言包翻译后传入。 */
  label: string
  /** 文案前的图标；不传时该行不留图标位。 */
  icon?: React.ReactNode
  /** 快捷键提示；与 IDEA 一致展示 mac 组合键。 */
  shortcut?: string
  /** 是否带子菜单；当前只画箭头，展开留给后续版本。 */
  submenu?: boolean
  /** 是否禁用；不传 run 的项一律视为暂未实现。 */
  disabled?: boolean
  /** 是否危险操作；使用错误色。 */
  danger?: boolean
  /** 是否用强调底色标出（如下拉底部的「Add Configuration…」）。 */
  highlight?: boolean
  /** 是否为当前选中项；下拉菜单用它表示选中态（IDEA 的实心蓝底白字）。 */
  selected?: boolean
  /** 是否在该项之前画分组分隔线。 */
  separatorBefore?: boolean
  /** 行尾动作；有值时该项右侧出现图标按钮。 */
  actions?: readonly IdeMenuRowAction[]
  /** 点击执行；缺省表示该能力暂未实现，菜单项置灰。 */
  run?(): void
}

/** 一次右键菜单请求。 */
export interface IdeContextMenuRequest {
  /** 菜单左上角的视口横坐标。 */
  x: number
  /** 菜单左上角的视口纵坐标。 */
  y: number
  /** 菜单项。 */
  items: readonly IdeMenuItem[]
  /** 最小宽度；下拉类菜单需要比右键菜单更宽，便于放下长配置名。 */
  minWidth?: number
}

/** 菜单默认最小宽度；与 IDEA 右键菜单的比例一致。 */
const MENU_MIN_WIDTH = 248

/** 菜单贴边时保留的视口边距。 */
const VIEWPORT_MARGIN = 8

/** 浮层菜单 props。 */
export interface ContextMenuLayerProps {
  /** 菜单位置与内容。 */
  request: IdeContextMenuRequest
  /** 关闭菜单。 */
  onClose(): void
}

/**
 * 接管一次右键：阻止浏览器自带菜单，并在指针位置打开给定菜单。
 *
 * 停止冒泡是必要的：内层区域一旦处理，工作台根的兜底菜单就不应再叠一层。
 * @param event 触发右键的鼠标事件
 * @param services 提供 openContextMenu 的服务总线
 * @param items 该区域的菜单项
 * @param minWidth 可选最小宽度
 */
export function openIdeContextMenu(
  event: React.MouseEvent,
  services: { openContextMenu(request: IdeContextMenuRequest): void },
  items: readonly IdeMenuItem[],
  minWidth?: number,
): void {
  event.preventDefault()
  event.stopPropagation()
  services.openContextMenu({
    x: event.clientX,
    y: event.clientY,
    items,
    ...(minWidth === undefined ? {} : { minWidth }),
  })
}

/** 文本编辑菜单的文案；由调用方按自己的语言包提供，公共层不硬编码语言。 */
export interface TextEditMenuLabels {
  /** 撤销。 */
  undo: string
  /** 重做。 */
  redo: string
  /** 剪切。 */
  cut: string
  /** 复制。 */
  copy: string
  /** 粘贴。 */
  paste: string
  /** 全选。 */
  selectAll: string
}

/**
 * 构造输入框的标准文本编辑菜单。
 *
 * 插件内接管右键后，输入框失去浏览器原生菜单，因此需要自行补齐这几项；
 * 命令走 `execCommand`，它在 Chromium 的 input / textarea / CodeMirror 上都可用。
 * @param labels 已翻译的菜单文案
 * @returns 文本编辑菜单项
 */
export function textEditMenuItems(labels: TextEditMenuLabels): IdeMenuItem[] {
  return [
    { id: 'undo', label: labels.undo, shortcut: '⌘Z', run: () => runEditingCommand('undo') },
    { id: 'redo', label: labels.redo, shortcut: '⇧⌘Z', run: () => runEditingCommand('redo') },
    { id: 'cut', label: labels.cut, shortcut: '⌘X', separatorBefore: true, run: () => runEditingCommand('cut') },
    { id: 'copy', label: labels.copy, shortcut: '⌘C', run: () => runEditingCommand('copy') },
    { id: 'paste', label: labels.paste, shortcut: '⌘V', run: () => runEditingCommand('paste') },
    { id: 'selectAll', label: labels.selectAll, shortcut: '⌘A', separatorBefore: true, run: () => runEditingCommand('selectAll') },
  ]
}

/**
 * 执行一次浏览器编辑命令。
 * @param command 编辑命令
 */
function runEditingCommand(command: 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'selectAll'): void {
  // paste 由浏览器自行从剪贴板取值；其余命令直接作用于当前焦点元素
  const applied = document.execCommand(command)

  // execCommand 被废弃后仍可能返回 false；这里不打断用户，只在控制台留痕方便排查
  if (!applied) console.warn(`[dsh-ide] 编辑命令未生效: ${command}`)
}


/**
 * 渲染一个浮层菜单。
 *
 * 位置按实测尺寸收进视口，点击菜单外或按 Esc 关闭；菜单内部的右键既不关闭菜单，
 * 也不向外冒泡，避免工作台的兜底菜单在同一位置叠一层。
 * @param props 见 ContextMenuLayerProps
 * @returns 菜单浮层
 */
export function ContextMenuLayer({ request, onClose }: ContextMenuLayerProps): React.ReactElement {
  const menuRef = useRef<HTMLDivElement | null>(null)
  /** 实测菜单尺寸后修正的坐标，避免贴边时被视口裁掉。 */
  const [offset, setOffset] = useState({ x: request.x, y: request.y })

  // 各区域菜单项数量差异很大，按真实尺寸收敛才能保证最后几项始终可见
  useLayoutEffect(() => {
    const element = menuRef.current
    if (element === null) return

    const rect = element.getBoundingClientRect()

    setOffset({
      x: Math.max(VIEWPORT_MARGIN, Math.min(request.x, window.innerWidth - rect.width - VIEWPORT_MARGIN)),
      y: Math.max(VIEWPORT_MARGIN, Math.min(request.y, window.innerHeight - rect.height - VIEWPORT_MARGIN)),
    })
  }, [request])

  // 菜单打开期间把 Esc 作为唯一的键盘退出方式，与桌面 IDE 的菜单习惯一致
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown, true)

    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [onClose])

  /**
   * 执行菜单项并关闭菜单。
   * @param item 被点击的菜单项
   */
  const select = useCallback(
    (item: IdeMenuItem): void => {
      onClose()
      item.run?.()
    },
    [onClose],
  )

  return (
    <>
      {/* 透明覆盖层：点击菜单外关闭，同时拦住下层元素的点击与拖拽 */}
      <div className="fixed inset-0 z-[9998]" onClick={onClose} onContextMenu={(event) => event.preventDefault()} />

      <div
        ref={menuRef}
        role="menu"
        className="fixed z-[9999] rounded-md border border-line2 bg-[var(--ide-menu-bg)] py-1 shadow-lg"
        style={{ left: offset.x, top: offset.y, minWidth: request.minWidth ?? MENU_MIN_WIDTH }}
        // 菜单内再次右键保持菜单打开，并阻止外层兜底菜单重复弹出
        onContextMenu={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
      >
        {request.items.map((item) => {
          // 没有 run 的项是「结构占位」：保留在菜单里但置灰，后续点亮不必重排
          const disabled = item.disabled === true || item.run === undefined

          return (
            <React.Fragment key={item.id}>
              {item.separatorBefore === true && <div className="my-1 h-px bg-line1" />}

              {/*
                * 行内动作需要独立点击，因此这一行不能用 button 包 button；
                * 改成容器 + 两个并列按钮，悬停底色挂在容器上，视觉上仍是一整行。
                */}
              <div
                role="menuitem"
                aria-disabled={disabled}
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
                  disabled && 'opacity-60 hover:bg-transparent',
                )}
              >
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => select(item)}
                  className={cn(
                    'flex min-w-0 flex-1 items-center gap-2 px-2 py-[5px] text-xs leading-[18px]',
                    item.highlight === true ? 'justify-center' : 'text-left',
                    disabled ? 'cursor-default' : 'cursor-pointer',
                  )}
                >
                  {/* 图标列固定宽度，多条操作的文案才能左右对齐 */}
                  {item.icon !== undefined && item.highlight !== true && (
                    <span
                      className={cn(
                        'flex w-4 shrink-0 items-center justify-center',
                        item.danger === true
                          ? 'text-danger'
                          : item.selected === true
                            ? 'text-onAccent'
                            : 'text-secondary',
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

                  {/* 子菜单标记：当前只画箭头，展开逻辑留给具体菜单后续实现 */}
                  {item.submenu === true && <span className="shrink-0 text-secondary">›</span>}
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
      </div>
    </>
  )
}
