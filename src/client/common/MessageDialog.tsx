/**
 * 通用信息提示框。
 *
 * 与 ConfirmDialog 的分工：确认框有「确认 / 取消」两个出口，用于危险操作前的拦截；
 * 这里只有一个 OK，用于「这次操作做不了，告诉用户原因」（例如没有变更时点 Commit）。
 * 不持有业务状态，调用方给标题与正文，关闭时回传即可。
 */
import React, { useEffect } from 'react'

/** 一次消息框请求。 */
export interface MessageRequest {
  /** 标题，概括结论。 */
  title: string
  /** 正文，说明原因。 */
  message: string
  /** OK 按钮文案。 */
  okLabel: string
}

/**
 * 渲染消息提示框。
 * @param props 请求对象与关闭回调
 * @returns 遮罩 + 对话框；由调用方决定何时渲染
 */
export function MessageDialog({
  request,
  onClose,
}: {
  request: MessageRequest
  onClose(): void
}): React.ReactElement {
  // Esc 关闭：消息框没有取消动作，Esc 与 OK 等价
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onKeyDown)

    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      {/* 点击对话框本身不该关闭，拦在冒泡阶段 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={request.title}
        className="flex w-[460px] max-w-full flex-col rounded-[12px] border border-[color:var(--ide-dialog-border)] bg-[var(--ide-dialog-bg)] p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-4">
          {/* 信息图标：蓝底白 i，与 IDEA 的系统消息框一致 */}
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--ide-dialog-accent)]">
            <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false">
              <circle cx="8" cy="4" r="1.4" />
              <rect x="6.9" y="6.8" width="2.2" height="6" rx="0.8" />
            </svg>
          </span>

          <div className="min-w-0 flex-1">
            {/* 标题：结论 */}
            <div className="text-[15px] font-bold leading-[20px] text-[color:var(--ide-dialog-fg)]">
              {request.title}
            </div>

            {/* 正文：原因说明 */}
            <div className="mt-2.5 text-[13px] leading-[19px] text-[color:var(--ide-dialog-fg)]">{request.message}</div>
          </div>
        </div>

        {/* 唯一出口：OK，默认聚焦以便回车关闭 */}
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            autoFocus
            onClick={onClose}
            className="h-7 min-w-[76px] rounded-[4px] border border-[color:var(--ide-dialog-accent-border)] bg-[var(--ide-dialog-accent)] px-4 text-[13px] font-medium text-white outline-none hover:bg-[var(--ide-dialog-accent-hover)]"
          >
            {request.okLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
