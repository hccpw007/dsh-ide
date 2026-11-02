/**
 * 历史页签左上角的工具条。
 *
 * 与 IDEA 的提交历史工具条一致：最左是分支过滤胶囊（`Branch: HEAD ×`），随后是
 * 「在 Log 中定位」、提交过滤与视图选项，最右是分支筛选入口。
 * 所有按钮不持有状态，只把事件转发给 HistoryTab。
 */
import React from 'react'

import { cn } from '../../../common/cn'
import type { Translate } from '../../../types/plugin'

import { eyeIcon, filterIcon, popupMarkIcon } from './icons-ui'
import { branchIcon, showInLogIcon } from './icons-vcs'

/** 工具条 props。 */
export interface HistoryToolbarProps {
  /** 已绑定 git 前缀的翻译函数。 */
  t: Translate
  /** 分支过滤；空串表示所有分支，HEAD 表示只看 HEAD，其余是引用名。 */
  branch: string
  /** 是否显示时间列。 */
  showDates: boolean
  /** 打开分支过滤菜单。 */
  onBranchMenu(event: React.MouseEvent): void
  /** 清除分支过滤，回到所有分支。 */
  onClearBranch(): void
  /** 在 Log 页签中定位当前选中的提交。 */
  onShowInLog(): void
  /** 打开提交过滤菜单（作者 / 日期）。 */
  onFilterMenu(event: React.MouseEvent): void
  /** 显示或隐藏时间列。 */
  onToggleDates(): void
  /** 打开视图选项菜单。 */
  onViewMenu(event: React.MouseEvent): void
}

/**
 * 渲染历史页签工具条。
 * @param props 见 HistoryToolbarProps
 * @returns 一行过滤与操作按钮
 */
export function HistoryToolbar({
  t,
  branch,
  showDates,
  onBranchMenu,
  onClearBranch,
  onShowInLog,
  onFilterMenu,
  onToggleDates,
  onViewMenu,
}: HistoryToolbarProps): React.ReactElement {
  /** 分支胶囊上的当前取值：没有过滤即所有分支，其余显示 HEAD 或引用名。 */
  const branchLabel = branch === '' ? t('all') : branch === 'HEAD' ? t('head') : branch

  return (
    <div className="flex h-[30px] shrink-0 items-center gap-0.5 px-2">
      {/* 分支过滤：点文字打开分支菜单 */}
      <button
        type="button"
        title={`${t('branchFilter')}: ${branchLabel}`}
        onClick={onBranchMenu}
        className="flex h-[23px] max-w-[220px] shrink-0 items-center gap-1 rounded-[3px] px-1 text-[12px] text-secondary transition-colors hover:bg-surface2 hover:text-primary"
      >
        <span className="truncate">{`${t('branchFilter')}: ${branchLabel}`}</span>
      </button>

      {/* 清除分支过滤：回到所有分支 */}
      <button
        type="button"
        title={t('clearBranchFilter')}
        onClick={onClearBranch}
        className="flex h-[23px] w-[18px] shrink-0 items-center justify-center rounded-[3px] text-secondary transition-colors hover:bg-surface2 hover:text-primary"
      >
        {closeMarkIcon()}
      </button>

      <Divider />

      {/* 在 Log 中定位：切到 Log 页签并选中当前提交 */}
      <ToolbarButton title={t('showInLog')} onClick={onShowInLog}>
        {showInLogIcon(16)}
      </ToolbarButton>

      {/* 提交过滤：按作者 / 日期缩小列表 */}
      <ToolbarButton title={t('filter')} onClick={onFilterMenu} popupTitle={t('moreActions')} onPopup={onFilterMenu}>
        {filterIcon(16)}
      </ToolbarButton>

      <Divider />

      {/* 视图选项：点眼睛切换时间列，点角标打开视图菜单 */}
      <ToolbarButton
        title={t('showTimestamps')}
        active={showDates}
        onClick={onToggleDates}
        popupTitle={t('moreActions')}
        onPopup={onViewMenu}
      >
        {eyeIcon(16)}
      </ToolbarButton>

      <span className="flex-1" />

      {/* 分支筛选：与左侧胶囊同一个菜单，位置与 IDEA 一致放在最右 */}
      <ToolbarButton title={t('branchFilter')} onClick={onBranchMenu}>
        {branchIcon(16)}
      </ToolbarButton>
    </div>
  )
}

/** 工具条上的图标按钮。 */
function ToolbarButton({
  title,
  active = false,
  popupTitle,
  onPopup,
  onClick,
  children,
}: {
  title: string
  active?: boolean
  /** 右下角弹出菜单的提示；与 onPopup 同时给出时才渲染角标。 */
  popupTitle?: string
  onPopup?(event: React.MouseEvent): void
  onClick(event: React.MouseEvent): void
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        title={title}
        aria-label={title}
        aria-pressed={active}
        onClick={onClick}
        className={cn(
          'flex h-[23px] w-[23px] items-center justify-center rounded-[3px] transition-colors',
          active ? 'bg-surface3 text-primary' : 'text-primary hover:bg-surface2',
        )}
      >
        {children}
      </button>

      {popupTitle !== undefined && onPopup !== undefined && (
        <button
          type="button"
          title={popupTitle}
          aria-label={popupTitle}
          onClick={onPopup}
          className="absolute bottom-0 right-0 flex h-2 w-2 items-end justify-end text-primary hover:text-info"
        >
          {popupMarkIcon()}
        </button>
      )}
    </div>
  )
}

/** 工具条分隔线。 */
function Divider(): React.ReactElement {
  return <span className="mx-1 h-4 w-px shrink-0 bg-line1" />
}

/** 清除过滤用的细叉，比页签关闭钮更小。 */
function closeMarkIcon(): React.ReactNode {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}
