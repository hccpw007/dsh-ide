/**
 * Git、运行配置与主工具栏共用的浮层菜单。
 *
 * 外观、定位与关闭交互统一由公共层的 `ContextMenuLayer` 提供，和其他区域的右键
 * 菜单保持同一套比例。这里只做类型别名与一层薄封装：调用方沿用既有
 * `MenuItem` / `MenuState` 形状（label 是已翻译文案，支持行内编辑/删除动作），
 * 不必因为换渲染器而改动签名。
 */
import React from 'react'

import { ContextMenuLayer, type IdeMenuItem } from '../../../common/context-menu'

/** 一个菜单项。 */
export type MenuItem = IdeMenuItem

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

/**
 * 渲染一个浮层菜单。
 * @param props 菜单状态与关闭回调
 * @returns 菜单浮层；状态为空时由调用方不渲染
 */
export function ContextMenu({ menu, onClose }: { menu: MenuState; onClose(): void }): React.ReactElement {
  return <ContextMenuLayer request={menu} onClose={onClose} />
}
