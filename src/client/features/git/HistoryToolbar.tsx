/**
 * 历史页签左上角的工具条。
 *
 * 与 IDEA 的提交历史工具条一致：最左是分支过滤胶囊（`Branch: HEAD ×`），随后是
 * 刷新、过滤、视图选项、在浏览器打开仓库与暂停刷新，最右是分支筛选入口。
 * 所有按钮不持有状态，只把事件转发给 HistoryTab。
 */
import React from 'react'

import { cn } from '../../../common/cn'
import type { Translate } from '../../../types/plugin'

import { branchIcon, eyeIcon, filterIcon, githubIcon, pauseIcon, popupMarkIcon, syncIcon } from './icons'

/** 工具条 props。 */
export interface HistoryToolbarProps {
  /** 已绑定 git 前缀的翻译函数。 */
  t: Translate
  /** 分支过滤；空串表示 HEAD。 */
  branch: string
  /** 是否查看全部分支的提交。 */
  allBranches: boolean
  /** 是否显示时间列。 */
  showDates: boolean
  /** 是否暂停自动刷新。 */
  paused: boolean
  /** 是否正在加载提交。 */
  loading: boolean
  /** 仓库是否配置了远端；没有时「打开仓库」不可用。 */
  hasRemote: boolean
  /** 打开分支过滤菜单。 */
  onBranchMenu(event: React.MouseEvent): void
  /** 清除分支过滤，回到 HEAD。 */
  onClearBranch(): void
  /** 重新读取历史。 */
  onRefresh(): void
  /** 打开提交过滤菜单（作者 / 日期 / 路径）。 */
  onFilterMenu(event: React.MouseEvent): void
  /** 显示或隐藏时间列。 */
  onToggleDates(): void
  /** 打开视图选项菜单。 */
  onViewMenu(event: React.MouseEvent): void
  /** 在浏览器打开远端仓库。 */
  onOpenRemote(): void
  /** 暂停或恢复自动刷新。 */
  onTogglePause(): void
}

/**
 * 渲染历史页签工具条。
 * @param props 见 HistoryToolbarProps
 * @returns 一行过滤与操作按钮
 */
export function HistoryToolbar({
  t,
  branch,
  allBranches,
  showDates,
  paused,
  loading,
  hasRemote,
  onBranchMenu,
  onClearBranch,
  onRefresh,
  onFilterMenu,
  onToggleDates,
  onViewMenu,
  onOpenRemote,
  onTogglePause,
}: HistoryToolbarProps): React.ReactElement {
  /** 分支胶囊上的当前取值：全部分支 / HEAD / 指定分支。 */
  const branchLabel = allBranches ? t('all') : branch === '' ? 'HEAD' : branch

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

      {/* 清除分支过滤：回到 HEAD */}
      <button
        type="button"
        title={t('clearBranchFilter')}
        onClick={onClearBranch}
        className="flex h-[23px] w-[18px] shrink-0 items-center justify-center rounded-[3px] text-secondary transition-colors hover:bg-surface2 hover:text-primary"
      >
        {closeMarkIcon()}
      </button>

      <Divider />

      {/* 刷新历史：重新读取该文件的提交与分支 */}
      <ToolbarButton title={t('refresh')} disabled={loading} onClick={onRefresh}>
        {syncIcon(16)}
      </ToolbarButton>

      {/* 提交过滤：按作者 / 日期 / 路径缩小列表 */}
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

      <Divider />

      {/* 在浏览器打开远端仓库：没有配置远端时禁用 */}
      <ToolbarButton
        title={hasRemote ? t('openRemote') : `${t('openRemote')} (${t('noRemote')})`}
        disabled={!hasRemote}
        onClick={onOpenRemote}
      >
        {githubIcon(15)}
      </ToolbarButton>

      {/* 暂停 / 恢复自动刷新 */}
      <ToolbarButton title={paused ? t('resumeRefresh') : t('pauseRefresh')} active={paused} onClick={onTogglePause}>
        <span className={cn('flex h-5 w-5 items-center justify-center rounded-full', paused ? 'bg-info/30' : 'bg-surface3')}>
          {pauseIcon(14)}
        </span>
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
  disabled = false,
  popupTitle,
  onPopup,
  onClick,
  children,
}: {
  title: string
  active?: boolean
  disabled?: boolean
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
        disabled={disabled}
        onClick={onClick}
        className={cn(
          'flex h-[23px] w-[23px] items-center justify-center rounded-[3px] transition-colors disabled:cursor-default disabled:opacity-50',
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
