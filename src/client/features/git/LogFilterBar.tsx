/**
 * Log 页签的过滤栏。
 *
 * 从左到右依次是文本/哈希搜索、正则与大小写开关、分支/用户/日期/路径过滤、
 * 排序，以及刷新、更多、显示全部提交等操作。所有按钮不持有状态，只转发事件。
 */
import React from 'react'

import { cn } from '../../../common/cn'
import type { Translate } from '../../../types/plugin'

import {
  arrowDownIcon,
  arrowUpIcon,
  chevronDownIcon,
  clockIcon,
  closeIcon,
  eyeIcon,
  gearIcon,
  refreshIcon,
  searchIcon,
  sortIcon,
} from './icons'

/** 日期过滤选项。 */
export type DateFilter = 'all' | 'today' | 'week' | 'month'

/** 过滤栏 props。 */
export interface LogFilterBarProps {
  /** 已绑定 git 前缀的翻译函数。 */
  t: Translate
  /** 文本搜索内容。 */
  textSearch: string
  /** 文本搜索变化。 */
  onTextSearch(value: string): void
  /** 是否按正则解析搜索。 */
  useRegex: boolean
  onToggleRegex(): void
  /** 是否区分大小写。 */
  caseSensitive: boolean
  onToggleCase(): void
  /** 是否显示全部分支的提交。 */
  allBranches: boolean
  /** 当前分支名；空串表示 HEAD。 */
  branch: string
  /** 作者过滤。 */
  userFilter: string
  /** 日期过滤。 */
  dateFilter: DateFilter
  /** 路径过滤。 */
  pathFilter: string
  /** 是否显示日期列。 */
  showDates: boolean
  /** 是否正在加载提交。 */
  loading: boolean
  /** 打开过滤下拉菜单。 */
  onFilterMenu(event: React.MouseEvent, kind: 'branch' | 'user' | 'date' | 'paths'): void
  onToggleSort(): void
  onRefresh(): void
  onMore(event: React.MouseEvent): void
  onToggleAllBranches(): void
  onToggleDates(): void
  onPrevious(): void
  onNext(): void
  onClear(): void
}

/**
 * 渲染过滤栏。
 * @param props 见 LogFilterBarProps
 * @returns 搜索、过滤与操作按钮
 */
export function LogFilterBar({
  t,
  textSearch,
  onTextSearch,
  useRegex,
  onToggleRegex,
  caseSensitive,
  onToggleCase,
  allBranches,
  branch,
  userFilter,
  dateFilter,
  pathFilter,
  showDates,
  loading,
  onFilterMenu,
  onToggleSort,
  onRefresh,
  onMore,
  onToggleAllBranches,
  onToggleDates,
  onPrevious,
  onNext,
  onClear,
}: LogFilterBarProps): React.ReactElement {
  const dateLabel =
    dateFilter === 'all' ? '' : dateFilter === 'today' ? ': Today' : dateFilter === 'week' ? ': 7d' : ': 30d'

  return (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line1 px-2">
      <div className="flex h-6 w-[190px] shrink-0 items-center gap-1 rounded border border-line1 bg-base px-1.5">
        <span className="text-secondary">{searchIcon()}</span>
        <input
          value={textSearch}
          onChange={(event) => onTextSearch(event.target.value)}
          placeholder={t('textOrHash')}
          className="min-w-0 flex-1 bg-transparent text-[11px] text-primary outline-none placeholder:text-secondary"
        />
      </div>

      <FilterToggle label=".*" title={t('regex')} active={useRegex} onClick={onToggleRegex} />
      <FilterToggle label="Cc" title={t('caseSensitive')} active={caseSensitive} onClick={onToggleCase} />

      <FilterButton
        label={`${t('branchFilter')}${allBranches ? ': All' : branch === '' ? '' : `: ${branch}`}`}
        onClick={(event) => onFilterMenu(event, 'branch')}
      />
      <FilterButton
        label={`${t('userFilter')}${userFilter === '' ? '' : `: ${userFilter}`}`}
        onClick={(event) => onFilterMenu(event, 'user')}
      />
      <FilterButton label={`${t('dateFilter')}${dateLabel}`} onClick={(event) => onFilterMenu(event, 'date')} />
      <FilterButton
        label={`${t('pathsFilter')}${pathFilter === '' ? '' : ': 1'}`}
        onClick={(event) => onFilterMenu(event, 'paths')}
      />
      <FilterButton label="" title={t('sortByDate')} onClick={onToggleSort}>
        {sortIcon()}
      </FilterButton>

      <span className="flex-1" />

      <IconButton title={t('refresh')} onClick={onRefresh} disabled={loading}>
        {refreshIcon()}
      </IconButton>
      <IconButton title={t('moreActions')} onClick={onMore}>
        {gearIcon()}
      </IconButton>
      <IconButton title={t('showAllBranches')} active={allBranches} onClick={onToggleAllBranches}>
        {eyeIcon()}
      </IconButton>
      <IconButton title={t('showTimestamps')} active={showDates} onClick={onToggleDates}>
        {clockIcon()}
      </IconButton>
      <IconButton title={t('previousCommit')} onClick={onPrevious}>
        {arrowUpIcon()}
      </IconButton>
      <IconButton title={t('nextCommit')} onClick={onNext}>
        {arrowDownIcon()}
      </IconButton>
      <IconButton title={t('clearFilters')} onClick={onClear}>
        {closeIcon()}
      </IconButton>
    </div>
  )
}

/** 过滤栏的开关按钮。 */
function FilterToggle({
  label,
  title,
  active,
  onClick,
}: {
  label: string
  title: string
  active: boolean
  onClick(): void
}): React.ReactElement {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'h-6 shrink-0 rounded px-1.5 font-mono text-[11px] transition-colors',
        active ? 'bg-info/25 text-primary' : 'text-secondary hover:bg-layer2 hover:text-primary',
      )}
    >
      {label}
    </button>
  )
}

/** 过滤栏的下拉按钮。 */
function FilterButton({
  label,
  title,
  onClick,
  children,
}: {
  label: string
  title?: string
  onClick(event: React.MouseEvent): void
  children?: React.ReactNode
}): React.ReactElement {
  return (
    <button
      type="button"
      title={title ?? label}
      onClick={onClick}
      className="flex h-6 shrink-0 items-center gap-1 rounded px-1.5 text-[11px] text-secondary transition-colors hover:bg-layer2 hover:text-primary"
    >
      {children ?? label}
      <span className="text-secondary">{chevronDownIcon()}</span>
    </button>
  )
}

/** 工具栏图标按钮。 */
function IconButton({
  title,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  title: string
  active?: boolean
  disabled?: boolean
  onClick(event: React.MouseEvent): void
  children: React.ReactNode
}): React.ReactElement {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors disabled:opacity-35',
        active ? 'bg-info/25 text-primary' : 'text-secondary hover:bg-layer2 hover:text-primary',
      )}
    >
      {children}
    </button>
  )
}
