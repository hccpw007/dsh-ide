/**
 * 项目树的右键菜单。
 *
 * 菜单结构与 IDEA 的文件上下文菜单逐条对齐：能做的项直接生效，暂时没有实现的项
 * 保留并置灰，用户能看到完整结构，后续点亮即可，不必重排菜单。
 *
 * 当前可用：打开、在编辑器中打开、新建文件 / 目录、重命名、删除（进回收站）、复制、
 * 粘贴、复制路径、在文件中查找、显示差异、从磁盘重新加载。
 */
import React from 'react'

import { ContextMenuLayer, type IdeMenuItem } from '../../../common/context-menu'
import type { Translate } from '../../../types/plugin'

/** 菜单左上角坐标，视口坐标系。 */
export interface MenuPosition {
  x: number
  y: number
}

/** 菜单项动作 id。 */
export type MenuAction =
  | 'open'
  | 'openInEditor'
  | 'newFile'
  | 'newDirectory'
  | 'copy'
  | 'copyPath'
  | 'copyRelativePath'
  | 'paste'
  | 'rename'
  | 'delete'
  | 'findInFiles'
  | 'showDiff'
  | 'gitAdd'
  | 'reloadFromDisk'

/** 菜单里的一项。 */
interface MenuItem {
  /** 稳定标识，同时作为语言 key 的后缀。 */
  id: string
  /** 动作；没有动作用的项置灰。 */
  action?: MenuAction
  /** 快捷键提示；与 IDEA 一致展示 mac 组合键。 */
  shortcut?: string
  /** 带子菜单的项在右侧显示箭头。 */
  submenu?: boolean
  /** 该项上方是否画分组分隔线。 */
  separated?: boolean
}

/** 菜单项顺序与 IDEA 截图一致。 */
const MENU_ITEMS: readonly MenuItem[] = [
  { id: 'open', action: 'open' },
  { id: 'openInEditor', action: 'openInEditor' },
  { id: 'sendPath', submenu: true },
  { id: 'new', submenu: true, separated: true, action: 'newFile' },
  { id: 'newDirectory', action: 'newDirectory' },
  { id: 'cut', shortcut: '⌘X', submenu: true, separated: true },
  { id: 'copy', shortcut: '⌘C', action: 'copy' },
  { id: 'copyPath', action: 'copyPath' },
  { id: 'copyRelativePath', action: 'copyRelativePath' },
  { id: 'paste', shortcut: '⌘V', action: 'paste' },
  { id: 'findUsages', shortcut: '⌥F7', separated: true },
  { id: 'findInFiles', action: 'findInFiles' },
  { id: 'analyze', submenu: true },
  { id: 'rename', shortcut: '⇧F6', separated: true, action: 'rename' },
  { id: 'refactor', submenu: true },
  { id: 'bookmarks', submenu: true },
  { id: 'reformatCode', shortcut: '⌥⌘L', separated: true },
  { id: 'optimizeImports', shortcut: '⌥⌘O' },
  { id: 'delete', shortcut: '⌫', action: 'delete' },
  { id: 'overrideFileType' },
  { id: 'openInRightSplit', shortcut: '⇧↩', separated: true },
  { id: 'openIn', submenu: true },
  { id: 'localHistory', submenu: true, separated: true },
  { id: 'git', submenu: true },
  { id: 'gitAdd', action: 'gitAdd' },
  { id: 'showDiff', action: 'showDiff' },
  { id: 'repairIde' },
  { id: 'reloadFromDisk', action: 'reloadFromDisk' },
  { id: 'compareWith', shortcut: '⌘D', separated: true },
  { id: 'markFileAs', submenu: true, separated: true },
  { id: 'diagrams', submenu: true },
  { id: 'addToGitignore', separated: true },
  { id: 'createGist' },
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
  /** 关闭菜单。 */
  onClose(): void
  /** 执行菜单动作。 */
  onAction(action: MenuAction, path: string, directory: boolean): void
}

/**
 * 渲染项目树右键菜单。
 * @param props 见 ProjectTreeContextMenuProps
 * @returns 浮在树上的菜单
 */
export function ProjectTreeContextMenu({
  t,
  position,
  path,
  directory,
  onClose,
  onAction,
}: ProjectTreeContextMenuProps): React.ReactElement {
  const items: IdeMenuItem[] = MENU_ITEMS.map((item) => {
    const action = item.action

    return {
      id: item.id,
      label: t(`menu.${item.id}`),
      ...(item.shortcut === undefined ? {} : { shortcut: item.shortcut }),
      ...(item.submenu === true ? { submenu: true } : {}),
      ...(item.separated === true ? { separatorBefore: true } : {}),
      // 没有动作的项不传 run，公共层会渲染成置灰的结构占位
      ...(action === undefined ? {} : { run: () => onAction(action, path, directory) }),
    }
  })

  return <ContextMenuLayer request={{ x: position.x, y: position.y, items }} onClose={onClose} />
}
