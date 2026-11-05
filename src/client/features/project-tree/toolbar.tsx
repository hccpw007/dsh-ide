/**
 * 项目树顶部的工具条与输入对话框。
 *
 * 两者都是纯展示 + 回调，单独成文件是因为它们与树的遍历逻辑无关：
 * 标题是视图切换下拉的入口，右侧是「切换忽略项显示 / 定位当前文件 / 全部展开 /
 * 全部折叠 / 刷新」五个动作，对话框只收集一个名字。
 */
import React, { useEffect, useRef } from 'react'

import { cn } from '../../../common/cn'
import type { DialogFrameStore } from '../../../common/dialog-size'
import { useDialogFrame } from '../../../common/dialog-frame'

import { chevronDownIcon } from './icons'

/** 输入框默认大小：与其它简单弹窗一致，刚好放下标题、输入框与按钮。 */
const INITIAL_SIZE = { widthRatio: 1, heightRatio: 1, maxWidth: 400, maxHeight: 116 }

/** 缩放下限：再小内容会被裁掉。 */
const MIN_SIZE = { width: 320, height: 116 }

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
    // 带 v2 是因为旧标识记过更大的尺寸，换新标识后首次打开回到贴合内容的默认大小
    key: 'tree-prompt-v2',
    initial: INITIAL_SIZE,
    min: MIN_SIZE,
    // 高度始终贴合内容：拖高后下次打开不在下方留空白
    rememberHeight: false,
  })

  const inputRef = useRef<HTMLInputElement | null>(null)

  /** 纯确认（删除）没有输入框，确认按钮始终可用；输入模式要求非空。 */
  const canConfirm = props.confirmOnly || props.value.trim() !== ''

  // 打开即聚焦并全选：重命名时可以直接覆盖旧名称
  useEffect(() => {
    const input = inputRef.current
    if (input === null) return

    input.focus()
    input.select()
  }, [])

  /**
   * 最新的确认条件与回调。
   *
   * 键盘监听只在挂载时绑定一次：把它写进依赖会让每次输入都退订再重订，
   * 与「输入框保持焦点」的交互互相打架。取值经 ref 读最新状态。
   */
  const latest = useRef({ canConfirm, onCancel: props.onCancel, onConfirm: props.onConfirm })
  latest.current = { canConfirm, onCancel: props.onCancel, onConfirm: props.onConfirm }

  // Enter 确认、Escape 取消：按钮获得焦点时也能生效，与其它弹窗一致
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        latest.current.onCancel()

        return
      }

      if (event.key === 'Enter' && latest.current.canConfirm) {
        event.preventDefault()
        latest.current.onConfirm()
      }
    }

    window.addEventListener('keydown', onKeyDown)

    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-start justify-center bg-black/30 pt-24"
      onClick={props.onCancel}
      onContextMenu={(event) => event.preventDefault()}
    >
      {/* 点击卡片本身不该关闭，拦在冒泡阶段 */}
      <div
        ref={rootRef}
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        className="relative flex flex-col rounded-md border border-line2 bg-surface2 p-3 shadow-2xl"
        style={style}
        onClick={(event) => event.stopPropagation()}
      >
        {/* 对话框标题：说明当前在做什么（新建文件 / 新建目录 / 重命名 / 删除确认），可按住拖动 */}
        <div className="mb-2 shrink-0 cursor-move select-none text-xs font-semibold text-primary" {...dragProps}>
          {props.title}
        </div>

        {/* 名称输入框；删除确认模式下不显示 */}
        {!props.confirmOnly && (
          <input
            ref={inputRef}
            type="text"
            value={props.value}
            aria-label={props.title}
            onChange={(event) => props.onChange(event.target.value)}
            className="mb-3 w-full shrink-0 rounded border border-inputborder bg-inputbg px-2 py-1 text-xs text-primary outline-none focus:border-info"
          />
        )}

        {/* 拖高弹窗时把多余空间留在中段，按钮始终贴底 */}
        <span className="flex-1" />

        <div className="flex shrink-0 justify-end gap-2">
          {/* 取消当前操作 */}
          <button
            type="button"
            onClick={props.onCancel}
            className="rounded border border-line2 px-2 py-1 text-xs text-primary transition-colors hover:bg-surface3"
          >
            {props.cancelLabel}
          </button>

          {/* 确认执行：新建、重命名与删除共用同一个主按钮样式；空名称时不可点 */}
          <button
            type="button"
            disabled={!canConfirm}
            onClick={props.onConfirm}
            className="rounded border border-info/60 px-2 py-1 text-xs text-primary transition-colors hover:bg-info/20 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent"
          >
            {props.confirmLabel}
          </button>
        </div>

        {handle}
      </div>
    </div>
  )
}
