/**
 * 三栏合并窗口的工具条。
 *
 * 与 IDEA 的合并工具栏一一对应：冲突块上下导航、按块接受左右两侧、把全部冲突块
 * 按某一侧应用（Apply non-conflicting changes）、自动解决简单冲突、重置结果。
 * 右侧显示未解决块数量，方便判断还剩多少要处理。
 */
import React from 'react'

import type { Translate } from '../../../types/plugin'
import { arrowDownIcon, arrowUpIcon } from '../git/icons-ui'
import { undoArrowIcon } from '../git/icons-vcs'

import { acceptLeftIcon, acceptRightIcon, magicWandIcon } from './icons'
import type { MergeSide } from './merge-model'

/** 工具条 props。 */
export interface MergeToolbarProps {
  /** 已绑定 conflicts 前缀的翻译函数。 */
  t: Translate
  /** 冲突块总数。 */
  conflictCount: number
  /** 未解决的块数。 */
  unresolvedCount: number
  /** 跳到上一个冲突块。 */
  onPrevious(): void
  /** 跳到下一个冲突块。 */
  onNext(): void
  /** 当前块接受左侧。 */
  onAcceptLeft(): void
  /** 当前块接受右侧。 */
  onAcceptRight(): void
  /** 全部冲突块按侧应用。 */
  onApplyAll(side: MergeSide): void
  /** 自动解决简单冲突。 */
  onResolveSimple(): void
  /** 把结果栏恢复成初始内容。 */
  onReset(): void
}

/**
 * 渲染合并工具条。
 * @param props 见 MergeToolbarProps
 * @returns 一行工具按钮与冲突计数
 */
export function MergeToolbar({
  t,
  conflictCount,
  unresolvedCount,
  onPrevious,
  onNext,
  onAcceptLeft,
  onAcceptRight,
  onApplyAll,
  onResolveSimple,
  onReset,
}: MergeToolbarProps): React.ReactElement {
  const enabled = conflictCount > 0

  return (
    <div className="flex h-8 shrink-0 items-center gap-0.5 border-b border-line1 px-1.5">
      {/* 上一个冲突块 */}
      <ToolbarButton title={t('prevConflict')} disabled={!enabled} onClick={onPrevious}>
        {arrowUpIcon(14)}
      </ToolbarButton>

      {/* 下一个冲突块 */}
      <ToolbarButton title={t('nextConflict')} disabled={!enabled} onClick={onNext}>
        {arrowDownIcon(14)}
      </ToolbarButton>

      <span className="mx-1 h-4 w-px shrink-0 bg-line2" />

      {/* 当前块接受左侧（我方版本） */}
      <ToolbarButton title={t('acceptLeft')} disabled={!enabled} onClick={onAcceptLeft}>
        {acceptLeftIcon()}
      </ToolbarButton>

      {/* 当前块接受右侧（对方版本） */}
      <ToolbarButton title={t('acceptRight')} disabled={!enabled} onClick={onAcceptRight}>
        {acceptRightIcon()}
      </ToolbarButton>

      <span className="mx-1 h-4 w-px shrink-0 bg-line2" />

      {/* 应用非冲突更改：全部冲突块按某一侧取值 */}
      <span className="shrink-0 whitespace-nowrap px-1 text-[12px] text-secondary">{t('applyNonConflicting')}</span>

      <button
        type="button"
        disabled={!enabled}
        onClick={() => onApplyAll('ours')}
        className="flex h-6 shrink-0 items-center gap-1 rounded px-1.5 text-[12px] text-primary hover:bg-surface2 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
      >
        {acceptLeftIcon(13)}
        {t('acceptLeft')}
      </button>

      {/* 两侧内容都保留 */}
      <button
        type="button"
        disabled={!enabled}
        title={t('acceptBothSides')}
        onClick={() => onApplyAll('both')}
        className="flex h-6 shrink-0 items-center gap-1 rounded px-1.5 text-[12px] text-primary hover:bg-surface2 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
      >
        {t('acceptBothSides')}
      </button>

      <button
        type="button"
        disabled={!enabled}
        onClick={() => onApplyAll('theirs')}
        className="flex h-6 shrink-0 items-center gap-1 rounded px-1.5 text-[12px] text-primary hover:bg-surface2 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
      >
        {acceptRightIcon(13)}
        {t('acceptRight')}
      </button>

      <span className="mx-1 h-4 w-px shrink-0 bg-line2" />

      {/* 自动解决不需要人工判断的冲突块 */}
      <ToolbarButton title={t('resolveSimple')} disabled={!enabled} onClick={onResolveSimple}>
        {magicWandIcon()}
      </ToolbarButton>

      {/* 重置结果：丢掉本次窗口里的全部选择 */}
      <ToolbarButton title={t('resetResult')} disabled={!enabled} onClick={onReset}>
        {undoArrowIcon()}
      </ToolbarButton>

      <span className="flex-1" />

      {/* 冲突计数：还没解决的块数 */}
      <span className="shrink-0 whitespace-nowrap pr-1 text-[12px] text-secondary">
        {unresolvedCount > 0
          ? (unresolvedCount === 1 ? t('conflictCountOne') : t('conflictCountMany')).replace(
              '{count}',
              String(unresolvedCount),
            )
          : t('noConflictBlocks')}
      </span>
    </div>
  )
}

/** 工具条上的图标按钮。 */
function ToolbarButton({
  title,
  disabled,
  onClick,
  children,
}: {
  title: string
  disabled: boolean
  onClick(): void
  children: React.ReactNode
}): React.ReactElement {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-primary transition-colors hover:bg-surface2 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}
