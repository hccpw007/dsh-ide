/**
 * 通用二次确认弹窗。
 *
 * 危险操作（删除配置、丢弃搁置记录等）在真正执行前都要过这一层，避免误点直接生效。
 * 只负责展示与回传，不持有业务状态：发起方传一个请求对象，确认时执行其中的动作。
 */
import React from 'react'

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
 * @param props 请求对象与关闭回调
 * @returns 遮罩 + 对话框；由调用方在请求为空时不渲染
 */
export function ConfirmDialog({ request, onClose }: { request: ConfirmRequest; onClose(): void }): React.ReactElement {
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
        className="w-[360px] rounded-md border border-line2 bg-surface2 p-3 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-2 text-xs font-semibold text-primary">{request.title}</div>

        <div className="mb-3 text-xs text-secondary">{request.message}</div>

        <div className="flex justify-end gap-2">
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
      </div>
    </div>
  )
}
