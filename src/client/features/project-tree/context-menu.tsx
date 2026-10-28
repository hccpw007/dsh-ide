/**
 * 项目树的右键菜单。
 *
 * 菜单项与 IDEA 的文件上下文菜单逐条对齐：能力未接入的项保留并置灰，用户能看到
 * 完整结构，后续阶段逐个点亮即可，不必重排菜单。当前可用的只有「复制路径」与
 * 「从磁盘重新加载」，其余等待编辑器、重构、Git 等阶段接入。
 */
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { cn } from '../../../common/cn'
import type { Translate } from '../../../types/plugin'

/** 菜单左上角坐标，视口坐标系。 */
export interface MenuPosition {
  x: number
  y: number
}

/** 菜单里的一项。 */
interface MenuItem {
  /** 稳定标识，同时作为语言 key 的后缀。 */
  id: string
  /** 快捷键提示；与 IDEA 一致展示 mac 组合键。 */
  shortcut?: string
  /** 带子菜单的项在右侧显示箭头。 */
  submenu?: boolean
  /** 该项上方是否画分组分隔线。 */
  separated?: boolean
}

/** 可点击项：复制该行的相对路径。 */
const ACTION_COPY_PATH = 'copyPath'

/** 可点击项：重新加载该行所在目录。 */
const ACTION_RELOAD = 'reloadFromDisk'

/** 菜单项顺序与 IDEA 截图一致。 */
const MENU_ITEMS: readonly MenuItem[] = [
  { id: 'sendPath' },
  { id: 'new', submenu: true, separated: true },
  { id: 'cut', shortcut: '⌘X', separated: true },
  { id: 'copy', shortcut: '⌘C' },
  { id: 'copyPath' },
  { id: 'paste', shortcut: '⌘V' },
  { id: 'findUsages', shortcut: '⌥F7', separated: true },
  { id: 'analyze', submenu: true },
  { id: 'rename', shortcut: '⇧F6', separated: true },
  { id: 'refactor', submenu: true },
  { id: 'bookmarks', submenu: true },
  { id: 'reformatCode', shortcut: '⌥⌘L', separated: true },
  { id: 'optimizeImports', shortcut: '⌥⌘O' },
  { id: 'delete', shortcut: '⌫' },
  { id: 'overrideFileType' },
  { id: 'openInRightSplit', shortcut: '⇧↩', separated: true },
  { id: 'openIn', submenu: true },
  { id: 'localHistory', submenu: true, separated: true },
  { id: 'git', submenu: true },
  { id: 'repairIde' },
  { id: 'reloadFromDisk' },
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
  /** 右键目标行的相对路径。 */
  path: string
  /** 关闭菜单。 */
  onClose(): void
  /** 重新加载目标行所在目录；缺省表示宿主能力不可用，该项置灰。 */
  onReload?: () => void
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
  onClose,
  onReload,
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
   * 把目标行的相对路径写入剪贴板。
   *
   * 剪贴板不可用（非安全上下文、权限被拒）时只记日志：菜单已经关闭，
   * 没有可回退的界面，弹错反而打断用户。
   */
  const copyPath = useCallback(async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(path)
    } catch (error) {
      console.error('[dsh-ide] 复制文件路径失败:', error)
    }

    onClose()
  }, [onClose, path])

  /**
   * 判断菜单项是否可点击。
   * @param item 菜单项
   * @returns 能力已接入时返回 true
   */
  function isEnabled(item: MenuItem): boolean {
    if (item.id === ACTION_COPY_PATH) return true

    return item.id === ACTION_RELOAD && onReload !== undefined
  }

  /**
   * 执行菜单项。
   * @param item 被点击的菜单项
   */
  function handleSelect(item: MenuItem): void {
    if (item.id === ACTION_COPY_PATH) {
      void copyPath()

      return
    }

    if (item.id === ACTION_RELOAD && onReload !== undefined) {
      onReload()
      onClose()
    }
  }

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
        const enabled = isEnabled(item)

        return (
          <React.Fragment key={item.id}>
            {item.separated === true && <div className="my-1 h-px bg-line1" />}

            <button
              type="button"
              role="menuitem"
              aria-disabled={!enabled}
              disabled={!enabled}
              onClick={() => handleSelect(item)}
              className={cn(
                'flex w-full items-center gap-4 px-3 py-[5px] text-left text-xs transition-colors',
                enabled
                  ? 'cursor-pointer bg-transparent text-primary hover:bg-layer2'
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
