/**
 * Log 页签的过滤栏。
 *
 * 排布与 IDEA 的 Git Log 工具栏一致：最左是搜索框，放大镜、搜索历史角标与正则/
 * 大小写开关都收在框内；随后是分支/用户/日期/路径四个过滤下拉与按日期排序；
 * 最右是暂停刷新、刷新、分支过滤、显示全部分支、聚焦搜索一组图标。所有按钮不
 * 持有状态，只转发事件。
 */
import React from 'react'

import { cn } from '../../../common/cn'
import type { Translate } from '../../../types/plugin'

import {
  chevronDownIcon,
  closeIcon,
  eyeIcon,
  pauseIcon,
  popupMarkIcon,
  refreshIcon,
  searchIcon,
  sortByDateIcon,
} from './icons-ui'
import { branchIcon } from './icons-vcs'

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
  /** 是否显示全部分支的提交。 */
  allBranches?: boolean
  /** 当前分支名；空串表示所有分支，HEAD 表示只看 HEAD。 */
  branch: string
  /** 清除分支过滤（芯片上的删除按钮）。 */
  onClearBranch(): void
  /** 作者过滤。 */
  userFilter: string
  /** 清除作者过滤（芯片上的删除按钮）。 */
  onClearUser(): void
  /** 日期过滤。 */
  dateFilter: DateFilter
  /** 清除日期过滤（芯片上的删除按钮）。 */
  onClearDate(): void
  /** 路径过滤。 */
  pathFilter: string
  /** 是否正在加载提交。 */
  loading: boolean
  /** 搜索输入框引用，供左侧工具栏的搜索按钮聚焦。 */
  searchRef?: React.RefObject<HTMLInputElement>
  /** 打开过滤下拉菜单。 */
  onFilterMenu(event: React.MouseEvent, kind: 'branch' | 'user' | 'date' | 'paths'): void
  onToggleSort(): void
  onRefresh(): void
  /** 切换「显示全部分支」。 */
  onToggleAllBranches(): void
  /** 打开视图选项菜单（显示时间、清空过滤等）；挂在眼睛按钮的角标上。 */
  onMore(event: React.MouseEvent): void
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
  onClearBranch,
  userFilter,
  onClearUser,
  dateFilter,
  onClearDate,
  pathFilter,
  loading,
  searchRef,
  onFilterMenu,
  onToggleSort,
  onRefresh,
  onToggleAllBranches,
  onMore,
}: LogFilterBarProps): React.ReactElement {
  /** 日期过滤的取值；空串表示不按日期过滤。 */
  const dateValue =
    dateFilter === 'all' ? '' : dateFilter === 'today' ? 'Today' : dateFilter === 'week' ? '7d' : '30d'

  /** 分支过滤的显示值：只有按具体引用过滤时才显示名字；全部分支与 HEAD 都显示空值。 */
  const branchValue = branch
  /** 分支过滤是否已生效；生效后芯片显示删除按钮，不再显示下拉角标。 */
  const branchActive = branchValue !== ''

  return (
    <div className="flex h-[30px] shrink-0 items-center px-2">
      {/* 搜索框：放大镜、搜索历史角标、输入框与正则/大小写开关同框，与 IDEA 一致 */}
      <div className="mr-1 flex h-[23px] w-[193px] shrink-0 items-center rounded-[3px] border border-line1 pl-1 pr-1">
        <button
          type="button"
          title={t('searchHistory')}
          onClick={() => searchRef?.current?.focus()}
          className="flex h-full shrink-0 items-center gap-0.5 pl-0.5 text-secondary transition-colors hover:text-primary"
        >
          {searchIcon(13)}
          {chevronDownIcon(9)}
        </button>
        <input
          ref={searchRef}
          value={textSearch}
          onChange={(event) => onTextSearch(event.target.value)}
          placeholder={t('textOrHash')}
          className="min-w-0 flex-1 bg-transparent px-0.5 text-[12px] text-primary outline-none placeholder:text-secondary"
        />
        <FilterToggle label=".*" title={t('regex')} active={useRegex} onClick={onToggleRegex} />
        <FilterToggle label="Cc" title={t('caseSensitive')} active={caseSensitive} onClick={onToggleCase} />
      </div>

      {/* 分支芯片：已过滤时显示条件值与删除按钮，未过滤时才是普通下拉 */}
      <FilterButton
        label={t('branchFilter')}
        value={branchValue}
        onClick={(event) => onFilterMenu(event, 'branch')}
        showChevron={!branchActive}
        clearTitle={t('clearBranchFilter')}
        onClear={branchActive ? onClearBranch : undefined}
      />
      {/* 用户芯片：作者过滤生效后同样带删除按钮 */}
      <FilterButton
        label={t('userFilter')}
        value={userFilter}
        onClick={(event) => onFilterMenu(event, 'user')}
        showChevron={userFilter === ''}
        clearTitle={t('clearUserFilter')}
        onClear={userFilter === '' ? undefined : onClearUser}
      />
      {/* 日期芯片：日期过滤生效后同样带删除按钮 */}
      <FilterButton
        label={t('dateFilter')}
        value={dateValue}
        onClick={(event) => onFilterMenu(event, 'date')}
        showChevron={dateValue === ''}
        clearTitle={t('clearDateFilter')}
        onClear={dateValue === '' ? undefined : onClearDate}
      />
      {/* 路径芯片 */}
      <FilterButton
        label={t('pathsFilter')}
        value={pathFilter === '' ? '' : '1'}
        onClick={(event) => onFilterMenu(event, 'paths')}
      />
      {/* 排序：只有图标，右下角小三角表示可切换排序方式 */}
      <FilterButton label="" title={t('sortByDate')} onClick={onToggleSort} showChevron={false} popupMark>
        {sortByDateIcon()}
      </FilterButton>

      <span className="flex-1" />

      {/* 暂停刷新：还没有自动刷新，按钮保留位置并说明原因 */}
      <IconButton title={t('pauseRefresh')} unavailable={t('notAvailable')}>
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-surface3">
          {pauseIcon(12)}
        </span>
      </IconButton>
      <IconButton title={t('refresh')} onClick={onRefresh} disabled={loading}>
        {refreshIcon(14)}
      </IconButton>
      <IconButton title={t('branchFilter')} onClick={(event) => onFilterMenu(event, 'branch')}>
        {branchIcon(14)}
      </IconButton>
      {/* 眼睛：点主体切换显示全部分支，点右下角标打开视图选项菜单 */}
      <IconButton
        title={t('showAllBranches')}
        active={allBranches}
        onClick={onToggleAllBranches}
        popupTitle={t('moreActions')}
        onPopup={onMore}
      >
        {eyeIcon(14)}
      </IconButton>
      <IconButton title={t('searchCommits')} onClick={() => searchRef?.current?.focus()}>
        {searchIcon(14)}
      </IconButton>
    </div>
  )
}

/** 搜索框内的开关按钮。 */
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
        'flex h-[19px] shrink-0 items-center rounded-[3px] px-1 text-[12px] transition-colors',
        active ? 'bg-info/25 text-primary' : 'text-primary hover:bg-surface2',
      )}
    >
      {label}
    </button>
  )
}

/**
 * 过滤栏的下拉按钮。
 *
 * 类别名用灰色、取值用正文色：IDEA 的过滤芯片就是这两级层次，取值才是过滤的重点。
 */
function FilterButton({
  label,
  value = '',
  title,
  onClick,
  showChevron = true,
  popupMark = false,
  clearTitle,
  onClear,
  children,
}: {
  /** 过滤类别名，如 Branch。 */
  label: string
  /** 当前取值；空串表示没有过滤。 */
  value?: string
  title?: string
  onClick(event: React.MouseEvent): void
  /** 是否在文字右侧画下拉角标；纯图标按钮（排序）用图标自带的角标。 */
  showChevron?: boolean
  /** 是否在按钮右下角画弹出菜单角标。 */
  popupMark?: boolean
  /** 删除按钮的悬停提示；与 onClear 同时给出时才渲染。 */
  clearTitle?: string
  /** 清除当前过滤条件。 */
  onClear?(): void
  children?: React.ReactNode
}): React.ReactElement {
  /** 悬停提示：调用方没给完整文案时按「类别名: 取值」拼。 */
  const tooltip = title ?? (value === '' ? label : `${label}: ${value}`)

  return (
    <span className="relative flex h-[23px] shrink-0 items-center rounded-[3px] text-[12px] text-secondary transition-colors hover:bg-surface2 hover:text-primary">
      <button type="button" title={tooltip} onClick={onClick} className="flex h-full items-center gap-1.5 px-1">
        {children ?? (
          <>
            {/* 过滤类别名：灰色，与取值拉开层次 */}
            <span className="text-tertiary">{label}</span>
            {value === '' ? null : <span className="text-primary">{`: ${value}`}</span>}
          </>
        )}
        {showChevron && <span className="text-secondary">{chevronDownIcon(13)}</span>}
      </button>

      {onClear !== undefined && (
        <button
          type="button"
          title={clearTitle}
          aria-label={clearTitle}
          onClick={onClear}
          className="flex h-full items-center pl-0.5 pr-1 text-secondary hover:text-primary"
        >
          {closeIcon(11)}
        </button>
      )}

      {popupMark && <span className="absolute bottom-0 right-0">{popupMarkIcon()}</span>}
    </span>
  )
}

/** 工具栏图标按钮。 */
function IconButton({
  title,
  active = false,
  disabled = false,
  unavailable,
  popupTitle,
  onPopup,
  onClick,
  children,
}: {
  title: string
  active?: boolean
  disabled?: boolean
  /** 不可用的原因；有值时按钮禁用并把原因拼进悬停提示。 */
  unavailable?: string
  /** 右下角弹出菜单的提示；与 onPopup 同时给出时才渲染角标。 */
  popupTitle?: string
  onPopup?(event: React.MouseEvent): void
  onClick?(event: React.MouseEvent): void
  children: React.ReactNode
}): React.ReactElement {
  const blocked = disabled || unavailable !== undefined

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        title={unavailable === undefined ? title : `${title} (${unavailable})`}
        aria-label={title}
        aria-pressed={active}
        disabled={blocked}
        onClick={onClick}
        className={cn(
          'flex h-5 w-5 items-center justify-center rounded-[3px] transition-colors disabled:cursor-default',
          active ? 'bg-surface3 text-primary' : 'text-primary hover:bg-surface2',
          // 禁用态只压暗一点：暂停使用了圆形底色，压太狠会看不出图标
          blocked && 'opacity-60',
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
