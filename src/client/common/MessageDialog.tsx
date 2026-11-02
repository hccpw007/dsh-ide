/**
 * 通用信息提示框。
 *
 * 与 ConfirmDialog 的分工：确认框有「确认 / 取消」两个出口，用于危险操作前的拦截；
 * 这里只有一个 OK，用于「这次操作做不了，告诉用户原因」（例如没有变更时点 Commit）。
 * 视觉与几何能力跟确认框、终端重命名弹窗保持一致，避免同一工作台出现多套对话框样式。
 * 不持有业务状态，调用方给标题与正文，关闭时回传即可。
 */
import React, { useEffect } from 'react'

import { useDialogFrame } from '../../common/dialog-frame'
import type { DialogFrameStore } from '../../common/dialog-size'

/** 默认大小：与其它简单弹窗一致，刚好放下标题、正文与 OK。 */
const INITIAL_SIZE = { widthRatio: 1, heightRatio: 1, maxWidth: 400, maxHeight: 116 }

/** 缩放下限：再小内容会被裁掉。 */
const MIN_SIZE = { width: 320, height: 116 }

/** 弹窗标识：消息框跨会话共用一份记忆尺寸与位置。 */
const SIZE_KEY = 'message-v2'

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
 * @param props 请求对象、关闭回调与弹窗几何信息存取入口
 * @returns 遮罩 + 对话框；由调用方决定何时渲染
 */
export function MessageDialog({
  request,
  onClose,
  dialogSizes,
}: {
  request: MessageRequest
  onClose(): void
  /** 几何信息存取入口；拖拽结束后写回设置。 */
  dialogSizes: DialogFrameStore
}): React.ReactElement {
  const { style, rootRef, dragProps, handle } = useDialogFrame(dialogSizes, {
    key: SIZE_KEY,
    initial: INITIAL_SIZE,
    min: MIN_SIZE,
  })

  // Enter 或 Escape 都关闭：消息框只有一个出口，两种按键等价
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' || event.key === 'Enter') {
        event.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)

    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-start justify-center bg-black/30 pt-24"
      onClick={onClose}
      onContextMenu={(event) => event.preventDefault()}
    >
      {/* 点击对话框本身不该关闭，拦在冒泡阶段 */}
      <div
        ref={rootRef}
        role="dialog"
        aria-modal="true"
        aria-label={request.title}
        className="relative flex flex-col rounded-md border border-line2 bg-surface2 p-3 shadow-2xl"
        style={style}
        onClick={(event) => event.stopPropagation()}
      >
        {/* 标题：可按住拖动弹窗位置 */}
        <div className="mb-2 shrink-0 cursor-move select-none text-xs font-semibold text-primary" {...dragProps}>
          {request.title}
        </div>

        {/* 正文：说明原因，过长时在内部滚动 */}
        <div className="mb-3 min-h-0 flex-1 overflow-auto text-xs text-secondary">{request.message}</div>

        {/* 唯一出口：OK，默认聚焦以便回车关闭 */}
        <div className="flex shrink-0 justify-end gap-2">
          <button
            type="button"
            autoFocus
            onClick={onClose}
            className="rounded border border-info/60 px-2 py-1 text-xs text-primary transition-colors hover:bg-info/20"
          >
            {request.okLabel}
          </button>
        </div>

        {handle}
      </div>
    </div>
  )
}
