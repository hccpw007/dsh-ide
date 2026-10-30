/**
 * 项目树顶部的工具条与输入对话框。
 *
 * 两者都是纯展示 + 回调，单独成文件是因为它们与树的遍历逻辑无关：
 * 标题是视图切换下拉的入口，右侧是「切换忽略项显示 / 定位当前文件 / 全部展开 /
 * 全部折叠 / 刷新」五个动作，对话框只收集一个名字。
 */
import React from 'react'

import { cn } from '../../../common/cn'

import { chevronDownIcon } from './icons'

/** 工具条小按钮 props。 */
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

        {/* 刷新：重新加载整棵树 */}
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
  /** 确认按钮是否使用危险色。 */
  danger: boolean
  onChange(value: string): void
  onCancel(): void
  onConfirm(): void
}

/**
 * 渲染新建 / 重命名 / 删除确认对话框。
 * @param props 见 TreePromptDialogProps
 * @returns 居中的模态框
 */
export function TreePromptDialog(props: TreePromptDialogProps): React.ReactElement {
  return (
    <div className="fixed inset-0 z-[9998] flex items-start justify-center bg-black/20 pt-24">
      <div className="w-80 rounded-md border border-line2 bg-overlay p-3 shadow-lg">
        {/* 对话框标题：说明当前在做什么 */}
        <div className="mb-2 text-xs text-primary">{props.title}</div>

        {!props.confirmOnly && (
          <input
            autoFocus
            value={props.value}
            onChange={(event) => props.onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') props.onConfirm()
              if (event.key === 'Escape') props.onCancel()
            }}
            className="mb-2 w-full rounded border border-line2 bg-base px-2 py-1 text-xs text-primary outline-none focus:border-line4"
          />
        )}

        <div className="flex justify-end gap-2">
          {/* 取消当前操作 */}
          <button
            type="button"
            onClick={props.onCancel}
            className="rounded border border-line2 px-2 py-1 text-xs text-primary hover:bg-surface2"
          >
            {props.cancelLabel}
          </button>

          {/* 确认执行 */}
          <button
            type="button"
            onClick={props.onConfirm}
            className={cn(
              'rounded border px-2 py-1 text-xs hover:bg-surface2',
              props.danger ? 'border-danger text-danger' : 'border-line2 text-primary',
            )}
          >
            {props.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
