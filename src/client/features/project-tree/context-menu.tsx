/**
 * 项目树的右键菜单。
 *
 * 菜单结构与 IDEA 的文件上下文菜单逐条对齐（按提供的截图裁剪）：截图里划掉的项
 * （发送路径、查找用法、查找/替换、分析、重构、书签、格式化、运行测试、修复 IDE、
 * 标记目录、图表、ESLint）不进菜单；快捷键一列也不显示。
 *
 * 保留的项都真实可用：宿主没有对应能力的项直接不出现，而不是留在菜单里置灰。
 * 根目录、文件夹与文件共用同一套菜单，三类节点看到的结构完全一致。
 */
import React from 'react'

import { ContextMenuLayer, type IdeMenuItem } from '../../../common/context-menu'
import type { Translate } from '../../../types/plugin'

import { compareWithIcon, copyIcon, gitignoreIcon, pasteIcon, reloadFromDiskIcon } from './icons'

/** 菜单左上角坐标，视口坐标系。 */
export interface MenuPosition {
  x: number
  y: number
}

/** 菜单项动作 id。 */
export type MenuAction =
  | 'newFile'
  | 'newDirectory'
  | 'copy'
  | 'copyPath'
  | 'paste'
  | 'rename'
  | 'delete'
  | 'modifyRunConfig'
  | 'gitAdd'
  | 'showDiff'
  | 'reloadFromDisk'
  | 'toggleGitignore'

/** 菜单里的一项。 */
interface MenuItem {
  /** 稳定标识，同时作为语言 key 的后缀。 */
  id: string
  /** 动作；带子菜单的项本身没有动作，动作在子项上。 */
  action?: MenuAction
  /** 文案前的图标；不传时用空占位，保证所有文案左对齐。 */
  icon?: React.ReactNode
  /** 子菜单项。 */
  children?: readonly MenuItem[]
  /** 该项上方是否画分组分隔线。 */
  separated?: boolean
}

/** 无图标项的占位：IDEA 的菜单即使某项没有图标也会空出图标列。 */
const NO_ICON: React.ReactNode = <span className="block h-4 w-4" aria-hidden="true" />

/** 菜单项顺序与分组，按截图逐一对应；空分组（划掉项所在的组）自然消失。 */
const MENU_ITEMS: readonly MenuItem[] = [
  {
    id: 'new',
    icon: NO_ICON,
    children: [
      { id: 'newFile', action: 'newFile', icon: NO_ICON },
      { id: 'newDirectory', action: 'newDirectory', icon: NO_ICON },
    ],
  },
  { id: 'copy', action: 'copy', icon: copyIcon(), separated: true },
  { id: 'copyPath', action: 'copyPath', icon: NO_ICON },
  { id: 'paste', action: 'paste', icon: pasteIcon() },
  { id: 'rename', action: 'rename', icon: NO_ICON, separated: true },
  { id: 'delete', action: 'delete', icon: NO_ICON, separated: true },
  { id: 'modifyRunConfig', action: 'modifyRunConfig', icon: NO_ICON, separated: true },
  {
    id: 'git',
    icon: NO_ICON,
    separated: true,
    children: [
      { id: 'gitAdd', action: 'gitAdd', icon: NO_ICON },
      { id: 'showDiff', action: 'showDiff', icon: NO_ICON },
    ],
  },
  { id: 'reloadFromDisk', action: 'reloadFromDisk', icon: reloadFromDiskIcon() },
  { id: 'compareWith', action: 'showDiff', icon: compareWithIcon(), separated: true },
  { id: 'addToGitignore', action: 'toggleGitignore', icon: gitignoreIcon(), separated: true },
]

/** 菜单 props。 */
export interface ProjectTreeContextMenuProps {
  /** 已绑定 projectTree 前缀的翻译函数。 */
  t: Translate
  /** 菜单左上角位置。 */
  position: MenuPosition
  /** 右键目标行的相对路径；根目录为空串。 */
  path: string
  /** 目标是否为目录。 */
  directory: boolean
  /** 目标是否已被 .gitignore 忽略；决定 .gitignore 项是「加入」还是「取消忽略」。 */
  ignored: boolean
  /** 关闭菜单。 */
  onClose(): void
  /** 执行菜单动作。 */
  onAction(action: MenuAction, path: string, directory: boolean): void
}

/**
 * 把内部菜单结构翻译成公共菜单项。
 * @param item 内部菜单项
 * @param props 菜单 props
 * @returns 公共层的菜单项
 */
function toIdeItem(item: MenuItem, props: ProjectTreeContextMenuProps): IdeMenuItem {
  const { t, path, directory, ignored, onAction } = props
  // 已被忽略的目标点的是「取消忽略」，文案随状态变化，与 IDEA 一致
  const labelKey = item.id === 'addToGitignore' && ignored ? 'menu.addToGitignoreUnignore' : `menu.${item.id}`
  const action = item.action

  return {
    id: item.id,
    label: t(labelKey),
    ...(item.icon === undefined ? {} : { icon: item.icon }),
    ...(item.separated === true ? { separatorBefore: true } : {}),
    ...(item.children === undefined ? {} : { children: item.children.map((child) => toIdeItem(child, props)) }),
    ...(action === undefined ? {} : { run: () => onAction(action, path, directory) }),
  }
}

/**
 * 渲染项目树右键菜单。
 * @param props 见 ProjectTreeContextMenuProps
 * @returns 浮在树上的菜单
 */
export function ProjectTreeContextMenu(props: ProjectTreeContextMenuProps): React.ReactElement {
  const items = MENU_ITEMS.map((item) => toIdeItem(item, props))

  return <ContextMenuLayer request={{ x: props.position.x, y: props.position.y, items }} onClose={props.onClose} />
}
