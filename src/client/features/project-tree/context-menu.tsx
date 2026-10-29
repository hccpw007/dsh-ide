/**
 * 项目树的右键菜单。
 *
 * 菜单结构与 IDEA 的文件上下文菜单逐条对齐：能做的项直接生效，暂时没有实现的项
 * 保留并置灰，用户能看到完整结构，后续点亮即可，不必重排菜单。
 *
 * 当前可用：打开、在编辑器中打开、新建文件 / 目录、重命名、删除（进回收站）、复制、
 * 粘贴、复制路径、在文件中查找、显示差异、从磁盘重新加载。
 */
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { cn } from '../../../common/cn'
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
  const menuRef = useRef<HTMLDivElement | null>(null)
  /** 实测菜单尺寸后修正的坐标，避免贴边时被视口裁掉。 */
  const [offset, setOffset] = useState<MenuPosition>(position)

  // 项数固定但字号随宿主主题可能变化，按实测尺寸收进视口
  useLayoutEffect(() => {
    const element = menuRef.current
    if (element === null) return

    const rect = element.getBoundingClientRect()
    const margin = 8

    setOffset({
      x: Math.max(margin, Math.min(position.x, window.innerWidth - rect.width - margin)),
      y: Math.max(margin, Math.min(position.y, window.innerHeight - rect.height - margin)),
    })
  }, [position.x, position.y])

  // 点击菜单外、按 Esc、滚动或改窗口尺寸都关闭，避免菜单停在过期位置
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent): void => {
      if (menuRef.current?.contains(event.target as Node) === true) return

      onClose()
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('scroll', onClose, true)
    window.addEventListener('resize', onClose)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('scroll', onClose, true)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  /**
   * 执行菜单项并关闭菜单。
   * @param item 被点击的菜单项
   */
  const select = useCallback(
    (item: MenuItem): void => {
      onClose()

      if (item.action !== undefined) onAction(item.action, path, directory)
    },
    [directory, onAction, onClose, path],
  )

  return (
    <div
      ref={menuRef}
      role="menu"
      // fixed 定位：菜单浮在工具窗口之上，不参与树的滚动与裁切
      className="fixed z-[9999] min-w-[248px] rounded-md border border-line2 bg-overlay py-1 shadow-lg"
      style={{ left: offset.x, top: offset.y }}
      // 菜单内部再次右键仍保留菜单，避免误关
      onContextMenu={(event) => event.preventDefault()}
    >
      {MENU_ITEMS.map((item) => {
        const enabled = item.action !== undefined

        return (
          <React.Fragment key={item.id}>
            {item.separated === true && <div className="my-1 h-px bg-line1" />}

            <button
              type="button"
              role="menuitem"
              aria-disabled={!enabled}
              disabled={!enabled}
              onClick={() => select(item)}
              className={cn(
                'flex w-full items-center gap-4 px-3 py-[5px] text-left text-xs transition-colors',
                enabled
                  ? 'cursor-pointer bg-transparent text-primary hover:bg-surface2'
                  : 'cursor-default bg-transparent text-secondary opacity-60',
              )}
            >
              {/* 菜单项名称 */}
              <span className="flex-1 truncate">{t(`menu.${item.id}`)}</span>

              {/* 子菜单提示：当前阶段不展开，只标出 IDEA 同款结构 */}
              {item.submenu === true && <span className="text-secondary">›</span>}

              {/* 快捷键提示 */}
              {item.shortcut !== undefined && <span className="text-secondary">{item.shortcut}</span>}
            </button>
          </React.Fragment>
        )
      })}
    </div>
  )
}
