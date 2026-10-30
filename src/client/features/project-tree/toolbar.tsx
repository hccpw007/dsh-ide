/**
 * 项目树顶部的工具条与输入对话框。
 *
 * 两者都是纯展示 + 回调，单独成文件是因为它们与树的遍历逻辑无关：
 * 标题是视图切换下拉的入口，右侧是「切换忽略项显示 / 定位当前文件 / 全部展开 /
 * 全部折叠 / 刷新」五个动作，对话框只收集一个名字。
 */
import React from 'react'

import { cn } from '../../../common/cn'
import type { DialogFrameStore } from '../../../common/dialog-size'
import { useDialogFrame } from '../../../common/dialog-frame'

import { chevronDownIcon } from './icons'

/** 输入框默认大小：最多 320×150，窄屏上按可用区域收缩。 */
const INITIAL_SIZE = { widthRatio: 1, heightRatio: 1, maxWidth: 320, maxHeight: 150 }

/** 缩放下限：再小标题、输入框与按钮就挤在一起了。 */
const MIN_SIZE = { width: 260, height: 130 }

/** 输入框 props。 */
interface IconButtonProps {
  /** 无障碍名称，同时作为悬停提示，文案来自语言包。 */
  label: string
  onClick(): void
  /** 宿主能力缺失或未绑定会话时禁用。 */
  disabled?: boolean
  children: React.ReactNode
}

/**
 * 渲染工具条图标按钮。
 * @param props 见 IconButtonProps
 * @returns 小尺寸图标按钮
 */
export function IconButton({ label, onClick, disabled = false, children }: IconButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-6 w-6 items-center justify-center rounded text-secondary transition-colors',
        'bg-transparent hover:bg-surface2 hover:text-primary focus-visible:bg-surface2 focus-visible:text-primary',
        'disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent',
      )}
    >
      {children}
    </button>
  )
}

/** 工具窗口标题栏 props。 */
export interface TreeToolbarProps {
  /** 当前视图名，同时是视图切换下拉的入口文案。 */
  title: string
  /** 打开视图切换下拉；参数为标题按钮的位置，用来把菜单贴在标题下方。 */
  onOpenViewMenu(anchor: DOMRect): void
  /** 忽略文件开关的提示文案。 */
  toggleIgnoredLabel: string
  /** 定位当前文件的提示文案。 */
  locateLabel: string
  /** 全部展开的提示文案。 */
  expandAllLabel: string
  /** 全部折叠的提示文案。 */
  collapseAllLabel: string
  /** 刷新的提示文案。 */
  refreshLabel: string
  /** 能力不可用时禁用全部按钮。 */
  disabled: boolean
  /** 当前是否显示被 .gitignore 忽略的文件。 */
  showIgnored: boolean
  onToggleIgnored(): void
  onLocate(): void
  onExpandAll(): void
  onCollapseAll(): void
  onRefresh(): void
  hiddenIcon: React.ReactNode
  locateIcon: React.ReactNode
  expandIcon: React.ReactNode
  collapseIcon: React.ReactNode
  refreshIcon: React.ReactNode
}

/**
 * 渲染项目树标题栏。
 * @param props 见 TreeToolbarProps
 * @returns 面板名称（可下拉切换视图）与五个图标按钮
 */
export function TreeToolbar(props: TreeToolbarProps): React.ReactElement {
  return (
    <div className="sticky top-0 z-10 flex h-9 shrink-0 items-center justify-between gap-2 border-b border-line1 bg-surface1 px-3">
      {/* 当前视图名兼视图切换入口：点开是 IDEA 同款的 Project / Packages / All Changed Files 下拉 */}
      <button
        type="button"
        aria-haspopup="menu"
        onClick={(event) => props.onOpenViewMenu(event.currentTarget.getBoundingClientRect())}
        className="flex min-w-0 items-center gap-1 rounded px-1 py-0.5 text-xs font-medium text-primary hover:bg-surface2 focus-visible:bg-surface2"
      >
        <span className="truncate">{props.title}</span>
        {chevronDownIcon()}
      </button>

      <div className="flex items-center gap-0.5">
        {/* 忽略文件开关：显示或隐藏被 .gitignore 忽略的文件 */}
        <IconButton label={props.toggleIgnoredLabel} disabled={props.disabled} onClick={props.onToggleIgnored}>
          {props.hiddenIcon}
        </IconButton>

        {/* 定位当前文件：展开并滚动到编辑器里正在显示的文件 */}
        <IconButton label={props.locateLabel} disabled={props.disabled} onClick={props.onLocate}>
          {props.locateIcon}
        </IconButton>

        {/* 全部展开：展开所有目录，与 IDEA 的 Expand All 一致 */}
        <IconButton label={props.expandAllLabel} disabled={props.disabled} onClick={props.onExpandAll}>
          {props.expandIcon}
        </IconButton>

        {/* 全部折叠：收起所有已展开目录 */}
        <IconButton label={props.collapseAllLabel} disabled={props.disabled} onClick={props.onCollapseAll}>
          {props.collapseIcon}
        </IconButton>

        {/* 刷新：与顶部主工具栏的刷新按钮同一套动作，重读 Git 状态并整树重载 */}
        <IconButton label={props.refreshLabel} disabled={props.disabled} onClick={props.onRefresh}>
          {props.refreshIcon}
        </IconButton>
      </div>
    </div>
  )
}

/** 输入对话框 props。 */
export interface TreePromptDialogProps {
  /** 对话框标题。 */
  title: string
  /** 是否为纯确认（删除）对话框；是则不显示输入框。 */
  confirmOnly: boolean
  /** 输入框内容。 */
  value: string
  /** 取消按钮文案。 */
  cancelLabel: string
  /** 确认按钮文案。 */
  confirmLabel: string
  onChange(value: string): void
  onCancel(): void
  onConfirm(): void
  /** 几何信息存取入口；拖拽结束后写回设置。 */
  dialogSizes: DialogFrameStore
}

/**
 * 渲染新建 / 重命名 / 删除确认对话框。
 * @param props 见 TreePromptDialogProps
 * @returns 居中的模态框
 */
export function TreePromptDialog(props: TreePromptDialogProps): React.ReactElement {
  const { style, rootRef, dragProps, handle } = useDialogFrame(props.dialogSizes, {
    key: 'tree-prompt',
    initial: INITIAL_SIZE,
    min: MIN_SIZE,
  })

  return (
    <div className="fixed inset-0 z-[9998] flex items-start justify-center bg-black/30 pt-24">
      <div
        ref={rootRef}
        className="relative flex flex-col overflow-hidden rounded-[12px] border border-[color:var(--ide-dialog-border)] bg-[var(--ide-dialog-bg)] px-5 pb-4 pt-3.5 shadow-2xl"
        style={style}
      >
        {/* 对话框标题：说明当前在做什么（新建文件 / 新建目录 / 重命名 / 删除确认），可按住在弹窗间拖动 */}
        <div
          className="mb-2.5 shrink-0 cursor-move select-none text-[13px] font-bold text-[color:var(--ide-dialog-fg)]"
          {...dragProps}
        >
          {props.title}
        </div>

        {!props.confirmOnly && (
          <input
            autoFocus
            value={props.value}
            onChange={(event) => props.onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') props.onConfirm()
              if (event.key === 'Escape') props.onCancel()
            }}
            className="mb-1 h-7 w-full shrink-0 rounded-[4px] border border-[color:var(--ide-dialog-control-border)] bg-[var(--ide-dialog-control-bg)] px-2 text-[13px] text-[color:var(--ide-dialog-fg)] outline-none focus:border-[color:var(--ide-dialog-accent)]"
          />
        )}

        <div className="mt-auto flex shrink-0 justify-end gap-2.5 pt-3">
          {/* 取消当前操作 */}
          <button
            type="button"
            onClick={props.onCancel}
            className="h-7 shrink-0 whitespace-nowrap rounded-[4px] border border-[color:var(--ide-dialog-control-border)] bg-[var(--ide-dialog-control-bg)] px-4 text-[13px] text-[color:var(--ide-dialog-fg)] hover:bg-[var(--ide-dialog-hover-bg)]"
          >
            {props.cancelLabel}
          </button>

          {/* 确认执行：新建、重命名与删除共用同一个主按钮样式 */}
          <button
            type="button"
            onClick={props.onConfirm}
            className="h-7 shrink-0 whitespace-nowrap rounded-[4px] border border-[color:var(--ide-dialog-accent-border)] bg-[var(--ide-dialog-accent)] px-6 text-[13px] font-medium text-white hover:bg-[var(--ide-dialog-accent-hover)]"
          >
            {props.confirmLabel}
          </button>
        </div>

        {handle}
      </div>
    </div>
  )
}
