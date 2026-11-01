/**
 * 三栏合并窗口的工具条。
 *
 * 与 IDEA 的合并工具栏一一对应：冲突块上下导航、把全部冲突块的某一侧放进结果
 * （→| 与 ←|）、应用两侧的非冲突更改（» « «»）、自动解决简单冲突、重置结果。
 * 右侧显示剩余冲突数量，与 IDEA 的「No changes, 1 conflict」同位置。
 */
import React from 'react'

import type { Translate } from '../../../types/plugin'
import { arrowDownIcon, arrowUpIcon } from '../git/icons-ui'
import { undoArrowIcon } from '../git/icons-vcs'

import {
  acceptLeftIcon,
  acceptRightIcon,
  applyBothChangesIcon,
  applyLeftChangesIcon,
  applyRightChangesIcon,
  magicWandIcon,
} from './icons'
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
  /** 全部冲突块按某一侧填进结果。 */
  onApplyAll(side: MergeSide): void
  /** 把两侧的非冲突更改应用进结果。 */
  onApplyNonConflicting(): void
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
  onApplyAll,
  onApplyNonConflicting,
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

      <Separator />

      {/* 全部冲突块取左侧（当前分支）内容 */}
      <ToolbarButton title={t('acceptAllLeft')} disabled={!enabled} onClick={() => onApplyAll('ours')}>
        {acceptLeftIcon()}
      </ToolbarButton>

      {/* 全部冲突块取右侧（传入版本）内容 */}
      <ToolbarButton title={t('acceptAllRight')} disabled={!enabled} onClick={() => onApplyAll('theirs')}>
        {acceptRightIcon()}
      </ToolbarButton>

      <Separator />

      {/* 应用非冲突更改：冲突标记之外的共有内容 */}
      <span className="shrink-0 whitespace-nowrap px-1 text-[12px] text-secondary">{t('applyNonConflicting')}</span>

      {/* 应用左侧的非冲突更改 */}
      <ToolbarButton title={t('applyLeftChanges')} disabled={!enabled} onClick={onApplyNonConflicting}>
        {applyLeftChangesIcon()}
      </ToolbarButton>

      {/* 应用右侧的非冲突更改 */}
      <ToolbarButton title={t('applyRightChanges')} disabled={!enabled} onClick={onApplyNonConflicting}>
        {applyRightChangesIcon()}
      </ToolbarButton>

      {/* 应用两侧的全部非冲突更改 */}
      <ToolbarButton title={t('applyBothChanges')} disabled={!enabled} onClick={onApplyNonConflicting}>
        {applyBothChangesIcon()}
      </ToolbarButton>

      <Separator />

      {/* 自动解决不需要人工判断的冲突块 */}
      <ToolbarButton title={t('resolveSimple')} disabled={!enabled} onClick={onResolveSimple}>
        {magicWandIcon()}
      </ToolbarButton>

      {/* 重置结果：把结果栏清回初始的空行占位 */}
      <ToolbarButton title={t('resetResult')} disabled={!enabled} onClick={onReset}>
        {undoArrowIcon()}
      </ToolbarButton>

      <span className="flex-1" />

      {/* 冲突计数：与 IDEA 右上角的「No changes, 1 conflict」同位置 */}
      <span className="shrink-0 whitespace-nowrap pr-1 text-[12px] text-secondary">
        {unresolvedCount > 0
          ? (unresolvedCount === 1 ? t('noChangesConflictOne') : t('noChangesConflictMany')).replace(
              '{count}',
              String(unresolvedCount),
            )
          : t('noConflictBlocks')}
      </span>
    </div>
  )
}

/** 工具条分组之间的竖线。 */
function Separator(): React.ReactElement {
  return <span className="mx-1 h-4 w-px shrink-0 bg-line2" />
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
