/**
 * 终端重命名弹窗。
 *
 * 替代浏览器原生 prompt：IDEA 风格的模态输入框，打开即聚焦并全选，Enter 确认、
 * Escape 取消。默认尺寸贴合一行内容，同时支持拖标题栏移动、拖右下角调整大小，
 * 尺寸与位置按弹窗标识记忆。
 * 组件只负责展示与回传，重命名请求由终端面板执行。
 */
import React, { useEffect, useRef } from 'react'

import { useDialogFrame } from '../../../common/dialog-frame'
import type { DialogFrameStore } from '../../../common/dialog-size'

/** 默认尺寸：与一行输入 + 底部按钮的高度一致，不留下多余空白。 */
const INITIAL_SIZE = { widthRatio: 1, heightRatio: 1, maxWidth: 400, maxHeight: 116 }

/** 缩放下限：再小内容会被裁掉。 */
const MIN_SIZE = { width: 320, height: 116 }

/**
 * 弹窗标识：重命名弹窗跨会话共用一份记忆尺寸与位置。
 *
 * 带 v2 是因为早期版本用固定高度打开过同一标识，旧记录会把默认尺寸撑大；
 * 换标识后首次打开回到贴合内容的默认大小。
 */
const SIZE_KEY = 'terminal-rename-v2'

/** 重命名弹窗 props。 */
export interface RenameDialogProps {
  /** 弹窗标题。 */
  title: string
  /** 输入框占位提示。 */
  placeholder: string
  /** 当前输入值。 */
  value: string
  /** 输入变化。 */
  onChange(value: string): void
  /** 输入框无内容时为 false，确认按钮随之禁用。 */
  canConfirm: boolean
  /** 确认按钮文案。 */
  confirmLabel: string
  /** 取消按钮文案。 */
  cancelLabel: string
  /** 确认重命名。 */
  onConfirm(): void
  /** 取消并关闭。 */
  onCancel(): void
  /** 弹窗几何信息存取入口。 */
  dialogSizes: DialogFrameStore
}

/**
 * 渲染重命名弹窗。
 * @param props 见 RenameDialogProps
 * @returns 遮罩与输入框
 */
export function RenameDialog({
  title,
  placeholder,
  value,
  onChange,
  canConfirm,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  dialogSizes,
}: RenameDialogProps): React.ReactElement {
  const { style, rootRef, dragProps, handle } = useDialogFrame(dialogSizes, {
    key: SIZE_KEY,
    initial: INITIAL_SIZE,
    min: MIN_SIZE,
    // 高度始终贴合内容：拖高后下次打开不在下方留空白
    rememberHeight: false,
  })

  const inputRef = useRef<HTMLInputElement | null>(null)

  // 打开即聚焦并全选：用户可以直接输入新名称，不用先删旧名
  useEffect(() => {
    const input = inputRef.current
    if (input === null) return

    input.focus()
    input.select()
  }, [])

  /** 提交；空输入与取消等效，避免把页签改成空名。 */
  const confirm = (): void => {
    if (canConfirm) onConfirm()
  }

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-start justify-center bg-black/30 pt-24"
      onClick={onCancel}
      onContextMenu={(event) => event.preventDefault()}
    >
      {/* 点击卡片本身不该关闭，拦在冒泡阶段 */}
      <div
        ref={rootRef}
        role="dialog"
        aria-modal="true"
        className="relative flex flex-col rounded-md border border-line2 bg-surface2 p-3 shadow-2xl"
        style={style}
        onClick={(event) => event.stopPropagation()}
      >
        {/* 弹窗标题：可按住拖动弹窗位置 */}
        <div className="mb-2 shrink-0 cursor-move select-none text-xs font-semibold text-primary" {...dragProps}>
          {title}
        </div>

        {/* 终端名称输入框；Enter 确认、Escape 取消 */}
        <input
          ref={inputRef}
          type="text"
          value={value}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              confirm()
            }

            if (event.key === 'Escape') {
              event.preventDefault()
              onCancel()
            }
          }}
          className="mb-3 w-full shrink-0 rounded border border-inputborder bg-inputbg px-2 py-1 text-xs text-primary outline-none focus:border-info"
        />

        {/* 拖高弹窗时把多余空间留在输入框与按钮之间，按钮始终贴底 */}
        <span className="flex-1" />

        <div className="flex shrink-0 justify-end gap-2">
          {/* 取消：放弃本次修改 */}
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-line2 px-2 py-1 text-xs text-primary transition-colors hover:bg-surface3"
          >
            {cancelLabel}
          </button>
          {/* 确认：应用新名称，输入为空时不可点 */}
          <button
            type="button"
            disabled={!canConfirm}
            onClick={confirm}
            className="rounded border border-info/60 px-2 py-1 text-xs text-primary transition-colors hover:bg-info/20 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent"
          >
            {confirmLabel}
          </button>
        </div>

        {/* 右下角缩放柄 */}
        {handle}
      </div>
    </div>
  )
}
