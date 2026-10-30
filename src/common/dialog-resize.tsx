/**
 * 弹窗右下角拖拽调整大小。
 *
 * 尺寸按弹窗标识记进设置：拖动过程中只改本地状态，松手时才写回一次，避免每帧落盘。
 * 上限跟着视口走，弹窗不会被拖到屏幕外；下限由各弹窗自己给出，防止内容挤成一团。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'

import type { DialogSize, DialogSizeStore } from './dialog-size'

/** 弹窗与视口边缘之间至少保留的距离（px）。 */
const VIEWPORT_MARGIN = 8

/** 右下角拖拽手柄的边长（px）。 */
const HANDLE_SIZE = 14

/** 一次拖拽的起点：指针位置与当时的尺寸。 */
interface DragOrigin {
  /** 指针按下时的横坐标。 */
  x: number
  /** 指针按下时的纵坐标。 */
  y: number
  /** 指针按下时的宽度。 */
  width: number
  /** 指针按下时的高度。 */
  height: number
}

/** hook 参数。 */
export interface DialogResizeOptions {
  /** 弹窗标识；同一标识跨会话沿用同一份尺寸。 */
  key: string
  /** 尚无保存记录时的默认大小。 */
  initial: DialogSize
  /** 允许缩到的最小大小。 */
  min: DialogSize
}

/** hook 返回值。 */
export interface DialogResize {
  /** 当前尺寸；铺给对话框根元素的 `style`。 */
  size: DialogSize
  /** 右下角拖拽手柄；放进对话框根元素，根元素需 `relative` 定位。 */
  handle: React.ReactElement
}

/**
 * 把尺寸收窄到「最小尺寸～视口」之间。
 * @param width 期望宽度
 * @param height 期望高度
 * @param min 最小尺寸
 * @returns 收窄后的尺寸
 */
function clampDialogSize(width: number, height: number, min: DialogSize): DialogSize {
  // 上限不小于下限：窗口极小时仍然保证最小尺寸可用，否则弹窗会被压成 0
  const maxWidth = Math.max(min.width, window.innerWidth - VIEWPORT_MARGIN * 2)
  const maxHeight = Math.max(min.height, window.innerHeight - VIEWPORT_MARGIN * 2)

  return {
    width: Math.round(Math.min(Math.max(width, min.width), maxWidth)),
    height: Math.round(Math.min(Math.max(height, min.height), maxHeight)),
  }
}

/**
 * 让弹窗可通过右下角拖拽调整大小。
 * @param store 设置里的尺寸存取入口
 * @param options 弹窗标识、默认尺寸与最小尺寸
 * @returns 当前尺寸与右下角手柄
 */
export function useDialogResize(store: DialogSizeStore, options: DialogResizeOptions): DialogResize {
  const { initial, key, min } = options
  const minWidth = min.width
  const minHeight = min.height
  const saved = store.read()[key]
  const savedWidth = saved?.width
  const savedHeight = saved?.height

  const [size, setSize] = useState<DialogSize>(() =>
    clampDialogSize(savedWidth ?? initial.width, savedHeight ?? initial.height, min),
  )
  const originRef = useRef<DragOrigin | null>(null)

  // 设置从宿主读回后同步到本地尺寸；拖拽进行中不打断用户
  useEffect(() => {
    if (originRef.current !== null || savedWidth === undefined || savedHeight === undefined) return

    setSize(clampDialogSize(savedWidth, savedHeight, { width: minWidth, height: minHeight }))
  }, [savedHeight, savedWidth, minHeight, minWidth])

  const startDrag = useCallback(
    (event: React.PointerEvent<HTMLElement>): void => {
      // 拦掉默认行为，否则拖动时会顺带选中弹窗里的文字
      event.preventDefault()
      event.stopPropagation()
      event.currentTarget.setPointerCapture(event.pointerId)
      originRef.current = { x: event.clientX, y: event.clientY, width: size.width, height: size.height }
    },
    [size.height, size.width],
  )

  const moveDrag = useCallback(
    (event: React.PointerEvent<HTMLElement>): void => {
      const origin = originRef.current
      if (origin === null) return

      setSize(
        clampDialogSize(
          origin.width + event.clientX - origin.x,
          origin.height + event.clientY - origin.y,
          { width: minWidth, height: minHeight },
        ),
      )
    },
    [minHeight, minWidth],
  )

  // 松手与取消走同一条收尾：先定格尺寸，再写回设置
  const endDrag = useCallback(
    (event: React.PointerEvent<HTMLElement>): void => {
      const origin = originRef.current
      if (origin === null) return

      originRef.current = null

      const next = clampDialogSize(
        origin.width + event.clientX - origin.x,
        origin.height + event.clientY - origin.y,
        { width: minWidth, height: minHeight },
      )

      setSize(next)
      store.save(key, next)
    },
    [key, minHeight, minWidth, store],
  )

  const handle = (
    <span
      aria-hidden="true"
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className="absolute bottom-0 right-0 z-20 flex cursor-nwse-resize touch-none items-end justify-end text-secondary/70"
      style={{ width: HANDLE_SIZE, height: HANDLE_SIZE }}
    >
      {/* 右下角两条斜线，与 IDEA 对话框的缩放手柄同形 */}
      <svg viewBox="0 0 14 14" width={HANDLE_SIZE} height={HANDLE_SIZE} aria-hidden="true">
        <path d="M13 6 6 13M13 10l-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      </svg>
    </span>
  )

  return { size, handle }
}
