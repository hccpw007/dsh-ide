/**
 * 弹窗右下角拖拽调整大小。
 *
 * 尺寸按弹窗标识记进设置：拖动过程中只改本地状态，松手时才写回一次，避免每帧落盘。
 * 上限默认按视口算；挂在面板内部的弹窗要传 `bounds`，否则固定尺寸会撑出面板。
 * 下限由各弹窗自己给出，防止内容挤成一团。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'

import type { DialogSize, DialogSizeStore } from './dialog-size'

/** 弹窗与可用区域边缘之间至少保留的距离（px）；同时够遮罩层的 p-4 内边距。 */
const VIEWPORT_MARGIN = 16

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

/**
 * 弹窗的默认尺寸。
 *
 * 用「占可用区域的比例 + 像素上限」而不是固定像素：低分辨率屏幕上按比例收缩，
 * 高分屏上也不会撑到半屏以上，等价于 CSS 的 `min(比例 × 可用区域, 上限)`。
 */
export interface DialogInitialSize {
  /** 占可用区域宽度的比例（0～1）；1 表示用到上限或可用宽度。 */
  widthRatio: number
  /** 占可用区域高度的比例（0～1）；1 表示用到上限或可用高度。 */
  heightRatio: number
  /** 宽度上限（px）。 */
  maxWidth: number
  /** 高度上限（px）。 */
  maxHeight: number
}

/** hook 参数。 */
export interface DialogResizeOptions {
  /** 弹窗标识；同一标识跨会话沿用同一份尺寸。 */
  key: string
  /** 尚无保存记录时的默认大小。 */
  initial: DialogInitialSize
  /** 允许缩到的最小大小。 */
  min: DialogSize
  /** 尺寸上限的参照元素；弹窗挂在面板内部而不是整页时必须给，省略时按浏览器视口算。 */
  bounds?: React.RefObject<HTMLElement | null>
}

/** hook 返回值。 */
export interface DialogResize {
  /** 当前尺寸；铺给对话框根元素的 `style`。 */
  size: DialogSize
  /** 右下角拖拽手柄；放进对话框根元素，根元素需 `relative` 定位。 */
  handle: React.ReactElement
}

/**
 * 取可用区域的尺寸。
 * @param bounds 参照元素；为空时用浏览器视口
 * @returns 可用的宽高
 */
function availableArea(bounds?: React.RefObject<HTMLElement | null>): DialogSize {
  const element = bounds?.current ?? null

  return {
    width: element === null ? window.innerWidth : element.clientWidth,
    height: element === null ? window.innerHeight : element.clientHeight,
  }
}

/**
 * 把尺寸收窄到「最小尺寸～可用区域」之间。
 * @param width 期望宽度
 * @param height 期望高度
 * @param min 最小尺寸
 * @param bounds 可用区域的参照元素；为空时用视口
 * @returns 收窄后的尺寸
 */
function clampDialogSize(
  width: number,
  height: number,
  min: DialogSize,
  bounds?: React.RefObject<HTMLElement | null>,
): DialogSize {
  const area = availableArea(bounds)

  // 上限不小于下限：可用区域极小时仍保证最小尺寸可用，否则弹窗会被压成 0
  const maxWidth = Math.max(min.width, area.width - VIEWPORT_MARGIN * 2)
  const maxHeight = Math.max(min.height, area.height - VIEWPORT_MARGIN * 2)

  return {
    width: Math.round(Math.min(Math.max(width, min.width), maxWidth)),
    height: Math.round(Math.min(Math.max(height, min.height), maxHeight)),
  }
}

/**
 * 按比例与上限算出默认尺寸。
 * @param initial 比例与上限
 * @param min 最小尺寸
 * @param bounds 可用区域的参照元素；为空时用视口
 * @returns 默认尺寸
 */
function initialDialogSize(
  initial: DialogInitialSize,
  min: DialogSize,
  bounds?: React.RefObject<HTMLElement | null>,
): DialogSize {
  const area = availableArea(bounds)

  return clampDialogSize(
    Math.min(initial.maxWidth, area.width * initial.widthRatio),
    Math.min(initial.maxHeight, area.height * initial.heightRatio),
    min,
    bounds,
  )
}

/**
 * 让弹窗可通过右下角拖拽调整大小。
 * @param store 设置里的尺寸存取入口
 * @param options 弹窗标识、默认尺寸、最小尺寸与可选的上限参照元素
 * @returns 当前尺寸与右下角手柄
 */
export function useDialogResize(store: DialogSizeStore, options: DialogResizeOptions): DialogResize {
  const { bounds, initial, key, min } = options
  const minWidth = min.width
  const minHeight = min.height
  const maxWidth = initial.maxWidth
  const maxHeight = initial.maxHeight
  const widthRatio = initial.widthRatio
  const heightRatio = initial.heightRatio
  const saved = store.read()[key]
  const savedWidth = saved?.width
  const savedHeight = saved?.height

  const [size, setSize] = useState<DialogSize>(() =>
    savedWidth === undefined || savedHeight === undefined
      ? initialDialogSize(initial, min, bounds)
      : clampDialogSize(savedWidth, savedHeight, min, bounds),
  )
  const originRef = useRef<DragOrigin | null>(null)

  // 设置从宿主读回后同步到本地尺寸；拖拽进行中不打断用户
  useEffect(() => {
    if (originRef.current !== null || savedWidth === undefined || savedHeight === undefined) return

    setSize(clampDialogSize(savedWidth, savedHeight, { width: minWidth, height: minHeight }, bounds))
  }, [bounds, savedHeight, savedWidth, minHeight, minWidth])

  // 参照元素挂载后才有尺寸：先按它算一次默认尺寸，之后面板缩放时继续跟着调整
  useEffect(() => {
    const element = bounds?.current ?? null
    if (element === null) return undefined

    const apply = (): void => {
      setSize((previous) => {
        // 用户拖过就尊重保存的像素值，只做收窄；没拖过则按比例重算默认尺寸
        const next =
          savedWidth === undefined || savedHeight === undefined
            ? initialDialogSize(
                { widthRatio, heightRatio, maxWidth, maxHeight },
                { width: minWidth, height: minHeight },
                bounds,
              )
            : clampDialogSize(previous.width, previous.height, { width: minWidth, height: minHeight }, bounds)

        // 尺寸没被改动时返回原对象，避免 ResizeObserver 回调引发无谓渲染
        return next.width === previous.width && next.height === previous.height ? previous : next
      })
    }

    apply()

    const observer = new ResizeObserver(apply)
    observer.observe(element)

    return () => observer.disconnect()
  }, [bounds, heightRatio, maxHeight, maxWidth, minHeight, minWidth, savedHeight, savedWidth, widthRatio])

  const startDrag = useCallback(
    (event: React.PointerEvent<HTMLElement>): void => {
      // 拦掉默认行为，否则拖动时会顺带选中弹窗里的文字
      event.preventDefault()
      event.stopPropagation()

      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch (error) { // 指针在按下瞬间已释放时捕获会失败，拖拽仍能靠指针位置继续
        console.error('[dsh-ide] 弹窗缩放手柄捕获指针失败:', error)
      }

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
          bounds,
        ),
      )
    },
    [bounds, minHeight, minWidth],
  )

  // 松手时定格尺寸并写回设置
  const endDrag = useCallback(
    (event: React.PointerEvent<HTMLElement>): void => {
      const origin = originRef.current
      if (origin === null) return

      originRef.current = null

      const next = clampDialogSize(
        origin.width + event.clientX - origin.x,
        origin.height + event.clientY - origin.y,
        { width: minWidth, height: minHeight },
        bounds,
      )

      setSize(next)
      store.save(key, next)
    },
    [bounds, key, minHeight, minWidth, store],
  )

  // 指针被系统抢走（如切到别的应用）时取消事件的坐标不可信，回到按下前的尺寸
  const abortDrag = useCallback((): void => {
    const origin = originRef.current
    if (origin === null) return

    originRef.current = null
    setSize(clampDialogSize(origin.width, origin.height, { width: minWidth, height: minHeight }, bounds))
  }, [bounds, minHeight, minWidth])

  const handle = (
    <span
      aria-hidden="true"
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={abortDrag}
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
