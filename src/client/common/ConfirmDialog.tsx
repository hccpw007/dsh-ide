/**
 * 通用二次确认弹窗。
 *
 * 危险操作（删除配置、丢弃搁置记录等）在真正执行前都要过这一层，避免误点直接生效。
 * 只负责展示与回传，不持有业务状态：发起方传一个请求对象，确认时执行其中的动作。
 */
import React from 'react'

import type { DialogSizeStore } from '../../common/dialog-size'
import { useDialogResize } from '../../common/dialog-resize'

/** 确认框默认大小；正文较长时也够用，用户可再拖大。 */
const INITIAL_SIZE = { width: 360, height: 160 }

/** 缩放下限：再小标题与按钮就挤在一起了。 */
const MIN_SIZE = { width: 280, height: 140 }

/** 弹窗标识：所有二次确认共用一份记忆尺寸。 */
const SIZE_KEY = 'confirm'

/** 一次确认请求。 */
export interface ConfirmRequest {
  /** 标题。 */
  title: string
  /** 说明正文，写清将要发生什么。 */
  message: string
  /** 确认按钮文案。 */
  confirmLabel: string
  /** 取消按钮文案。 */
  cancelLabel: string
  /** 确认按钮用错误色。 */
  danger?: boolean
  /** 点击确认后执行。 */
  run(): void
}

/**
 * 渲染确认弹窗。
 * @param props 请求对象、关闭回调与弹窗尺寸存取入口
 * @returns 遮罩 + 对话框；由调用方在请求为空时不渲染
 */
export function ConfirmDialog({
  request,
  onClose,
  dialogSizes,
}: {
  request: ConfirmRequest
  onClose(): void
  /** 尺寸存取入口；右下角拖拽结束后写回设置。 */
  dialogSizes: DialogSizeStore
}): React.ReactElement {
  const { size, handle } = useDialogResize(dialogSizes, {
    key: SIZE_KEY,
    initial: INITIAL_SIZE,
    min: MIN_SIZE,
  })

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-start justify-center bg-black/30 pt-24"
      onClick={onClose}
      onContextMenu={(event) => event.preventDefault()}
    >
      {/* 点击卡片本身不该关闭，拦在冒泡阶段 */}
      <div
        role="dialog"
        aria-modal="true"
        className="relative flex flex-col rounded-md border border-line2 bg-surface2 p-3 shadow-2xl"
        style={size}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-2 shrink-0 text-xs font-semibold text-primary">{request.title}</div>

        {/* 正文：拖高时占满中段，文案超长时在内部滚动 */}
        <div className="mb-3 min-h-0 flex-1 overflow-auto text-xs text-secondary">{request.message}</div>

        <div className="flex shrink-0 justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-line2 px-2 py-1 text-xs text-primary transition-colors hover:bg-surface3"
          >
            {request.cancelLabel}
          </button>

          <button
            type="button"
            onClick={() => {
              onClose()
              request.run()
            }}
            className={
              request.danger === true
                ? 'rounded border border-danger/60 px-2 py-1 text-xs text-danger transition-colors hover:bg-danger/15'
                : 'rounded border border-info/60 px-2 py-1 text-xs text-primary transition-colors hover:bg-info/20'
            }
          >
            {request.confirmLabel}
          </button>
        </div>

        {handle}
      </div>
    </div>
  )
}
