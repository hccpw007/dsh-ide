/**
 * 差异视图的顶部工具栏。
 *
 * 与 IDEA 的差异页一致：左侧是差异块导航与编辑器入口，中间是文件导航与关闭，
 * 右侧是差异数量、并排/行内布局切换与设置。Git 面板的内嵌差异与编辑器里的差异
 * 标签共用这一条工具栏，两处观感不会漂移。
 *
 * 文件历史页签里的差异没有「同组多个文件」的概念，因此那一路走 `history` 形态：
 * 去掉文件导航与关闭，改为折叠未变更片段的开关。
 */
import React from 'react'

import { cn } from '../../../common/cn'
import type { Translate } from '../../../types/plugin'

import {
  arrowDownIcon,
  arrowLeftIcon,
  arrowRightIcon,
  arrowUpIcon,
  closeIcon,
  collapseFragmentsIcon,
  gearIcon,
  pencilIcon,
} from './icons-ui'

/** 差异布局。 */
export type DiffMode = 'side-by-side' | 'inline'

/** 工具栏形态：`history` 是 Git 面板文件历史页签里的差异条。 */
export type DiffToolbarVariant = 'default' | 'history'

/** 差异工具栏 props。 */
export interface DiffToolbarProps {
  /** 已绑定前缀的翻译函数。 */
  t: Translate
  /** 当前布局。 */
  mode: DiffMode
  /** 差异块数量。 */
  changeCount: number
  /** 同组差异总数。 */
  fileCount: number
  /** 当前差异在同组中的下标（0 起）；-1 表示无。 */
  fileIndex: number
  /** 跳上一处 / 下一处差异块。 */
  onPreviousChange(): void
  onNextChange(): void
  /** 同组差异之间切换。 */
  onPreviousFile(): void
  onNextFile(): void
  /** 当前差异是否对应一个具体文件；false 时「在编辑器中打开」置灰。 */
  canOpenInEditor: boolean
  /** 在编辑器里打开该文件。 */
  onOpenInEditor(): void
  /** 关闭差异视图；历史页签里没有关闭入口，不传即不渲染。 */
  onClose?(): void
  /** 打开差异设置菜单。 */
  onSettings(event: React.MouseEvent): void
  /** 切换布局。 */
  onModeChange(mode: DiffMode): void
  /** 工具栏形态；默认是编辑器差异标签用的那一种。 */
  variant?: DiffToolbarVariant
  /** 是否折叠了未变更片段；仅 history 形态使用。 */
  collapseUnchanged?: boolean
  /** 切换折叠未变更片段；仅 history 形态使用。 */
  onToggleCollapse?(): void
}

/**
 * 渲染差异工具栏。
 * @param props 见 DiffToolbarProps
 * @returns 一行工具按钮
 */
export function DiffToolbar({
  t,
  mode,
  changeCount,
  fileCount,
  fileIndex,
  onPreviousChange,
  onNextChange,
  onPreviousFile,
  onNextFile,
  canOpenInEditor,
  onOpenInEditor,
  onClose,
  onSettings,
  onModeChange,
  variant = 'default',
  collapseUnchanged = false,
  onToggleCollapse,
}: DiffToolbarProps): React.ReactElement {
  // 历史页签里同一时间只有一个文件的差异，文件导航与关闭都无处可去，只保留改动导航
  const history = variant === 'history'

  // IDEA 的差异工具栏是一块深色圆角面板，四周留出间距，不与正文贴边
  return (
    <div className="shrink-0 p-1.5">
      <div className="flex h-8 items-center gap-0.5 rounded-md bg-tabbar px-1.5">
        {/* 上一处差异：跳到上一个变更块 */}
        <ToolbarButton title={t('previousDifference')} onClick={onPreviousChange} disabled={changeCount === 0}>
          {arrowUpIcon()}
        </ToolbarButton>

        {/* 下一处差异：跳到下一个变更块 */}
        <ToolbarButton title={t('nextDifference')} onClick={onNextChange} disabled={changeCount === 0}>
          {arrowDownIcon()}
        </ToolbarButton>

        {/* 在编辑器里打开该文件 */}
        <ToolbarButton title={t('openInEditor')} onClick={onOpenInEditor} disabled={!canOpenInEditor}>
          {pencilIcon()}
        </ToolbarButton>

        <Divider />

        {history ? (
          // 折叠未变更片段：开启时只留下改动附近的上下文，与 IDEA 历史差异的默认状态一致
          <ToolbarButton
            title={t('collapseFragments')}
            onClick={() => onToggleCollapse?.()}
            active={collapseUnchanged}
          >
            {collapseFragmentsIcon()}
          </ToolbarButton>
        ) : (
          <>
            {/* 同组上一个差异文件 */}
            <ToolbarButton title={t('previousFile')} onClick={onPreviousFile} disabled={fileCount < 2}>
              {arrowLeftIcon()}
            </ToolbarButton>

            {/* 单个文件时只报数量，多个文件时给出「第几个/共几个」，与 IDEA 一致 */}
            <span className="px-0.5 text-[11px] text-secondary">
              {fileCount === 1
                ? `1 ${t('file')}`
                : `${String(fileIndex < 0 ? 0 : fileIndex + 1)}/${String(fileCount)} ${t('files')}`}
            </span>

            {/* 同组下一个差异文件 */}
            <ToolbarButton title={t('nextFile')} onClick={onNextFile} disabled={fileCount < 2}>
              {arrowRightIcon()}
            </ToolbarButton>

            {/* 关闭差异视图 */}
            {onClose !== undefined && (
              <ToolbarButton title={t('closeDiff')} onClick={onClose}>
                {closeIcon()}
              </ToolbarButton>
            )}
          </>
        )}

        <span className="flex-1" />

        {/* 差异块数量：与 IDEA 的「N difference」对应 */}
        <span className="shrink-0 px-2 text-[11px] text-secondary">
          {changeCount} {changeCount === 1 ? t('difference') : t('differences')}
        </span>

        {/* 并排 / 行内布局切换 */}
        <div className="flex items-center rounded border border-line1">
          <ModeButton title={t('sideBySide')} active={mode === 'side-by-side'} onClick={() => onModeChange('side-by-side')}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.1">
              <rect x="1.5" y="2.5" width="13" height="11" rx="1" />
              <path d="M8 2.5v11" />
            </svg>
          </ModeButton>

          <ModeButton title={t('singleColumn')} active={mode === 'inline'} onClick={() => onModeChange('inline')}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.1">
              <rect x="1.5" y="2.5" width="13" height="11" rx="1" />
              <path d="M4.5 2.5v11" />
            </svg>
          </ModeButton>
        </div>

        {/* 差异设置：忽略空白与大小写 */}
        <ToolbarButton title={t('diffSettings')} onClick={onSettings}>
          {gearIcon()}
        </ToolbarButton>
      </div>
    </div>
  )
}

/** 工具栏图标按钮。 */
function ToolbarButton({
  title,
  onClick,
  disabled = false,
  active = false,
  children,
}: {
  title: string
  onClick(event: React.MouseEvent): void
  disabled?: boolean
  /** 是否为开启状态；历史差异里的折叠开关用它标出当前是否生效。 */
  active?: boolean
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
        'flex h-6 w-6 items-center justify-center rounded text-secondary transition-colors hover:bg-surface2 hover:text-primary disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent',
        active && 'bg-surface3 text-primary',
      )}
    >
      {children}
    </button>
  )
}

/** 布局切换按钮。 */
function ModeButton({
  title,
  active,
  onClick,
  children,
}: {
  title: string
  active: boolean
  onClick(): void
  children: React.ReactNode
}): React.ReactElement {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex h-5 w-6 items-center justify-center',
        active ? 'bg-info/25 text-primary' : 'text-secondary hover:bg-surface2 hover:text-primary',
      )}
    >
      {children}
    </button>
  )
}

/** 工具栏分隔线。 */
function Divider(): React.ReactElement {
  return <span className="mx-1 h-4 w-px bg-line1" />
}
