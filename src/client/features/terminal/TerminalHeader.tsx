/**
 * 终端面板头部。
 *
 * 结构照 IDEA 的 Terminal 工具窗口：左侧「Terminal」标题，随后是终端页签、
 * 新建按钮与页签下拉；右侧是更多操作与最小化。头部不画分隔线，页签的高度、
 * 内距、关闭叉与选中样式都照搬编辑区标签，两处页签保持同一套外观。
 */
import React from 'react'

import { cn } from '../../../common/cn'
import type { TerminalInfo } from '../../../common/terminal-remote'
import type { Translate } from '../../../types/plugin'

import { chevronDownIcon, closeTabIcon, kebabIcon, minimizeIcon, plusIcon } from './icons'

/** 头部 props。 */
export interface TerminalHeaderProps {
  /** 已绑定 terminal 前缀的翻译函数。 */
  t: Translate
  /** 已打开的终端。 */
  terminals: readonly TerminalInfo[]
  /** 当前活动终端 id。 */
  activeId: string
  /** 切换页签。 */
  onSelect(id: string): void
  /** 关闭页签。 */
  onClose(id: string): void
  /** 双击页签时重命名。 */
  onRename(id: string): void
  /** 新建终端。 */
  onNew(): void
  /** 展开页签下拉列表。 */
  onDropdown(event: React.MouseEvent): void
  /** 展开更多操作菜单。 */
  onMore(event: React.MouseEvent): void
  /** 收起底部面板；终端进程不因此结束。 */
  onMinimize(): void
  /** 头部空白处的右键菜单。 */
  onContextMenu(event: React.MouseEvent): void
  /** 右键某个页签：菜单里的关闭操作以该页签为目标。 */
  onTabMenu(id: string, event: React.MouseEvent): void
  /** 是否已达到宿主终端上限。 */
  newDisabled: boolean
}

/**
 * 渲染终端头部。
 * @param props 见 TerminalHeaderProps
 * @returns 标题、页签与操作按钮
 */
export function TerminalHeader({
  t,
  terminals,
  activeId,
  onSelect,
  onClose,
  onRename,
  onNew,
  onDropdown,
  onMore,
  onMinimize,
  onContextMenu,
  onTabMenu,
  newDisabled,
}: TerminalHeaderProps): React.ReactElement {
  return (
    <div
      // 高度与编辑区标签条一致，页签才能用同一套撑满式排布
      className="flex h-8 shrink-0 items-center bg-surface1 pl-3 pr-2"
      // 头部空白处右键与终端正文共用同一套菜单，与 IDEA 一致
      onContextMenu={onContextMenu}
    >
      {/* 工具窗口名称，IDEA 里是粗体且比页签大一号 */}
      <span className="mr-3 shrink-0 text-[13px] font-semibold text-primary">{t('title')}</span>

      {/* 页签条：与编辑区标签条同一套排布——页签撑满高度、底部留 3px 不让底色连成一片 */}
      <div
        role="tablist"
        className="flex min-w-0 items-stretch gap-0.5 self-stretch overflow-x-auto pb-[3px] pt-1"
      >
        {terminals.map((terminal) => {
          const selected = terminal.id === activeId

          return (
            // 页签用 div 而不是 button：关闭按钮必须是独立的可点元素，按钮不能嵌套
            <div
              key={terminal.id}
              role="tab"
              tabIndex={0}
              aria-selected={selected}
              onClick={() => onSelect(terminal.id)}
              onDoubleClick={() => onRename(terminal.id)}
              onContextMenu={(event) => {
                // 页签右键的关闭项作用于该页签：先选中它，再阻止冒泡到头部避免弹两次菜单
                event.stopPropagation()
                onSelect(terminal.id)
                onTabMenu(terminal.id, event)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelect(terminal.id)
                }
              }}
              className={cn(
                'flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors',
                selected
                  ? 'bg-tabactive text-tablabel ring-1 ring-tabline'
                  : 'text-secondary hover:bg-tabactive/50 hover:text-tablabel',
              )}
            >
              {/* 终端页签名；进程已退出时附状态标记 */}
              <span className="max-w-40 truncate">
                {terminal.title}
                {terminal.state !== 'running' && ` (${t('exited')})`}
              </span>

              {/* 关闭终端：结束进程并移除页签；只剩一个页签时禁用，保证面板始终有一个终端 */}
              <button
                type="button"
                title={terminals.length < 2 ? t('closeLastTerminal') : t('closeTerminal')}
                aria-label={terminals.length < 2 ? t('closeLastTerminal') : t('closeTerminal')}
                disabled={terminals.length < 2}
                onClick={(event) => {
                  event.stopPropagation()
                  onClose(terminal.id)
                }}
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded text-secondary opacity-70 transition-opacity hover:bg-surface2 hover:text-primary hover:opacity-100',
                  // 唯一页签的关闭按钮变淡且不响应悬停，提示不能关闭
                  terminals.length < 2 &&
                    'cursor-default opacity-40 hover:bg-transparent hover:text-secondary hover:opacity-40',
                )}
              >
                {closeTabIcon()}
              </button>
            </div>
          )
        })}
      </div>

      {/* 新建终端：在宿主上限内立即创建一个 Local 会话 */}
      <HeaderButton title={t('newTerminal')} onClick={onNew} disabled={newDisabled}>
        {plusIcon()}
      </HeaderButton>

      {/* 页签下拉：终端太多时从这里切换，与 IDEA 的 chevron 一致 */}
      <HeaderButton title={t('selectTerminal')} onClick={onDropdown} disabled={terminals.length === 0}>
        {chevronDownIcon()}
      </HeaderButton>

      <span className="flex-1" />

      <div className="flex items-center gap-0.5">
        {/* 更多操作：新建、重命名、关闭、清屏等终端操作 */}
        <HeaderButton title={t('moreActions')} onClick={onMore}>
          {kebabIcon()}
        </HeaderButton>
        {/* 收起底部面板；终端进程保留，再次打开时恢复屏幕 */}
        <HeaderButton title={t('minimize')} onClick={onMinimize}>
          {minimizeIcon()}
        </HeaderButton>
      </div>
    </div>
  )
}

/** 头部图标按钮。 */
function HeaderButton({
  title,
  onClick,
  disabled = false,
  children,
}: {
  title: string
  onClick(event: React.MouseEvent): void
  disabled?: boolean
  children: React.ReactNode
}): React.ReactElement {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-secondary transition-colors hover:bg-surface2 hover:text-primary disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-secondary"
    >
      {children}
    </button>
  )
}
