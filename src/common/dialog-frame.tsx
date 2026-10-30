/**
 * 弹窗的尺寸与位置控制。
 *
 * 尺寸与位置都按弹窗标识记进设置：拖动过程中只改本地状态，松手时才写回一次，避免每帧落盘。
 * 位置由标题栏拖动产生；没有位置记录时沿用布局给出的默认位置（居中），用户拖过之后改用
 * 相对定位参照元素的绝对定位，下次打开直接落回原处。
 * 上限默认按视口算；挂在面板内部的弹窗要传 `bounds`，否则固定尺寸会撑出面板。
 * 下限由各弹窗自己给出，防止内容挤成一团。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'

import { clampDialogSize, clampOffset, frameArea, initialDialogSize, measureOffset } from './dialog-geometry'
import type { DialogFrameStore, DialogInitialSize, DialogOffset, DialogSize } from './dialog-size'

/** 右下角拖拽手柄的边长（px）。 */
const HANDLE_SIZE = 14

/** 标题栏里自带交互的元素：按下这些元素时不该把弹窗拖走。 */
const INTERACTIVE_SELECTOR = 'button, a, input, textarea, select, [role="button"]'

/** 一次缩放拖拽的起点：指针位置与当时的尺寸。 */
interface ResizeOrigin {
  /** 指针按下时的横坐标。 */
  x: number
  /** 指针按下时的纵坐标。 */
  y: number
  /** 指针按下时的宽度。 */
  width: number
  /** 指针按下时的高度。 */
  height: number
}

/** 一次移动拖拽的起点：指针位置、拖动起点偏移与拖动前的位置。 */
interface MoveOrigin {
  /** 指针按下时的横坐标。 */
  x: number
  /** 指针按下时的纵坐标。 */
  y: number
  /** 拖动起点左上角的横坐标。 */
  left: number
  /** 拖动起点左上角的纵坐标。 */
  top: number
  /** 拖动前的位置；null 表示当时还是布局默认位置（居中）。 */
  before: DialogOffset | null
}

/** hook 参数。 */
export interface DialogFrameOptions {
  /** 弹窗标识；同一标识跨会话沿用同一份尺寸与位置。 */
  key: string
  /** 尚无保存记录时的默认大小。 */
  initial: DialogInitialSize
  /** 允许缩到的最小大小。 */
  min: DialogSize
  /** 尺寸上限的参照元素；弹窗挂在面板内部而不是整页时必须给，省略时按浏览器视口算。 */
  bounds?: React.RefObject<HTMLElement | null>
}

/** hook 返回值。 */
export interface DialogFrameControls {
  /** 弹窗根元素的 style：尺寸，用户移动过时再加上绝对定位坐标。 */
  style: React.CSSProperties
  /** 绑定到弹窗根元素的 ref；量当前位置与收窄拖动范围都要用它。 */
  rootRef: React.RefCallback<HTMLDivElement>
  /** 标题栏的拖动事件；挂到标题栏元素上，并自行加 `cursor-move` 与 `select-none`。 */
  dragProps: React.HTMLAttributes<HTMLElement>
  /** 右下角拖拽手柄；放进对话框根元素。 */
  handle: React.ReactElement
}

/**
 * 让弹窗可通过右下角拖拽调整大小、通过标题栏拖动移动，并把尺寸与位置写回设置。
 * @param store 设置里的几何信息存取入口
 * @param options 弹窗标识、默认尺寸、最小尺寸与可选的上限参照元素
 * @returns 当前样式、根元素 ref、标题栏拖动事件与右下角手柄
 */
export function useDialogFrame(store: DialogFrameStore, options: DialogFrameOptions): DialogFrameControls {
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
  const savedX = saved?.x
  const savedY = saved?.y

  const [size, setSize] = useState<DialogSize>(() =>
    savedWidth === undefined || savedHeight === undefined
      ? initialDialogSize(initial, min, bounds?.current ?? null)
      : clampDialogSize(savedWidth, savedHeight, min, bounds?.current ?? null),
  )
  const [offset, setOffset] = useState<DialogOffset | null>(() =>
    savedX === undefined || savedY === undefined ? null : { x: savedX, y: savedY },
  )

  const rootRef = useRef<HTMLDivElement | null>(null)
  /** 以回调形式暴露根元素 ref：不同 React 版本的 RefObject 类型对 null 的处理不一致。 */
  const setRootRef = useCallback<React.RefCallback<HTMLDivElement>>((element) => {
    rootRef.current = element
  }, [])
  const resizeOriginRef = useRef<ResizeOrigin | null>(null)
  const moveOriginRef = useRef<MoveOrigin | null>(null)
  /** 当前几何信息：松手写盘时尺寸与位置要一起存，避免用闭包里的旧值抹掉另一半。 */
  const frameRef = useRef<{ size: DialogSize; offset: DialogOffset | null }>({ size, offset })
  frameRef.current = { size, offset }

  // 设置从宿主读回后同步到本地尺寸；拖拽进行中不打断用户
  useEffect(() => {
    if (resizeOriginRef.current !== null || moveOriginRef.current !== null) return

    if (savedWidth === undefined || savedHeight === undefined) return

    setSize(
      clampDialogSize(
        savedWidth,
        savedHeight,
        { width: minWidth, height: minHeight },
        bounds?.current ?? null,
      ),
    )
  }, [bounds, savedHeight, savedWidth, minHeight, minWidth])

  // 位置同样从设置读回；用户正在拖动时不打断
  useEffect(() => {
    if (moveOriginRef.current !== null) return

    setOffset((previous) => {
      if (savedX === undefined || savedY === undefined) return previous === null ? previous : null

      return previous !== null && previous.x === savedX && previous.y === savedY ? previous : { x: savedX, y: savedY }
    })
  }, [savedX, savedY])

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
                bounds?.current ?? null,
              )
            : clampDialogSize(
                previous.width,
                previous.height,
                { width: minWidth, height: minHeight },
                bounds?.current ?? null,
              )

        // 尺寸没被改动时返回原对象，避免 ResizeObserver 回调引发无谓渲染
        return next.width === previous.width && next.height === previous.height ? previous : next
      })
    }

    apply()

    const observer = new ResizeObserver(apply)
    observer.observe(element)

    return () => observer.disconnect()
  }, [bounds, heightRatio, maxHeight, maxWidth, minHeight, minWidth, savedHeight, savedWidth, widthRatio])

  /**
   * 把当前位置收窄到参照区域内。
   *
   * 只在位置真的被改动时才返回新对象，窗口缩放与面板变化不会引发无谓渲染。
   */
  const clampOffsetToArea = useCallback((): void => {
    if (moveOriginRef.current !== null) return

    setOffset((previous) => {
      if (previous === null) return previous

      const next = clampOffset(previous, frameRef.current.size, frameArea(rootRef.current, bounds?.current ?? null))

      return next.x === previous.x && next.y === previous.y ? previous : next
    })
  }, [bounds])

  // 尺寸变化或窗口缩放后重新收窄位置，避免上次记录的位置把弹窗留在视野外
  useEffect(() => {
    clampOffsetToArea()
    window.addEventListener('resize', clampOffsetToArea)

    return () => window.removeEventListener('resize', clampOffsetToArea)
  }, [clampOffsetToArea, size.height, size.width])

  const startResize = useCallback(
    (event: React.PointerEvent<HTMLElement>): void => {
      // 拦掉默认行为，否则拖动时会顺带选中弹窗里的文字
      event.preventDefault()
      event.stopPropagation()

      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch (error) { // 指针在按下瞬间已释放时捕获会失败，拖拽仍能靠指针位置继续
        console.error('[dsh-ide] 弹窗缩放手柄捕获指针失败:', error)
      }

      resizeOriginRef.current = { x: event.clientX, y: event.clientY, width: size.width, height: size.height }
    },
    [size.height, size.width],
  )

  const moveResize = useCallback(
    (event: React.PointerEvent<HTMLElement>): void => {
      const origin = resizeOriginRef.current
      if (origin === null) return

      setSize(
        clampDialogSize(
          origin.width + event.clientX - origin.x,
          origin.height + event.clientY - origin.y,
          { width: minWidth, height: minHeight },
          bounds?.current ?? null,
        ),
      )
    },
    [bounds, minHeight, minWidth],
  )

  // 松手时定格尺寸并写回设置；位置一并保留，否则只写尺寸会把记住的位置抹掉
  const endResize = useCallback(
    (event: React.PointerEvent<HTMLElement>): void => {
      const origin = resizeOriginRef.current
      if (origin === null) return

      resizeOriginRef.current = null

      const next = clampDialogSize(
        origin.width + event.clientX - origin.x,
        origin.height + event.clientY - origin.y,
        { width: minWidth, height: minHeight },
        bounds?.current ?? null,
      )

      setSize(next)
      store.save(key, { ...next, ...(frameRef.current.offset ?? {}) })
    },
    [bounds, key, minHeight, minWidth, store],
  )

  // 指针被系统抢走（如切到别的应用）时取消事件的坐标不可信，回到按下前的尺寸
  const abortResize = useCallback((): void => {
    const origin = resizeOriginRef.current
    if (origin === null) return

    resizeOriginRef.current = null
    setSize(
      clampDialogSize(
        origin.width,
        origin.height,
        { width: minWidth, height: minHeight },
        bounds?.current ?? null,
      ),
    )
  }, [bounds, minHeight, minWidth])

  const startMove = useCallback((event: React.PointerEvent<HTMLElement>): void => {
    // 标题栏里的按钮、输入框有自己的交互，按下这些元素时不该把弹窗拖走
    if (event.target instanceof Element && event.target.closest(INTERACTIVE_SELECTOR) !== null) return

    const root = rootRef.current
    if (root === null) return

    event.preventDefault()

    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch (error) { // 指针在按下瞬间已释放时捕获会失败，拖动仍能靠指针位置继续
      console.error('[dsh-ide] 弹窗标题栏捕获指针失败:', error)
    }

    const before = frameRef.current.offset
    // 首次拖动时把布局算出来的默认位置量成偏移，切到绝对定位后视觉位置不变
    const start = before ?? measureOffset(root)

    if (before === null) setOffset(start)

    moveOriginRef.current = { x: event.clientX, y: event.clientY, left: start.x, top: start.y, before }
  }, [])

  const moveMove = useCallback(
    (event: React.PointerEvent<HTMLElement>): void => {
      const origin = moveOriginRef.current
      if (origin === null) return

      setOffset(
        clampOffset(
          { x: origin.left + event.clientX - origin.x, y: origin.top + event.clientY - origin.y },
          frameRef.current.size,
          frameArea(rootRef.current, bounds?.current ?? null),
        ),
      )
    },
    [bounds],
  )

  // 松手时定格位置并写回设置
  const endMove = useCallback(
    (event: React.PointerEvent<HTMLElement>): void => {
      const origin = moveOriginRef.current
      if (origin === null) return

      moveOriginRef.current = null

      const next = clampOffset(
        { x: origin.left + event.clientX - origin.x, y: origin.top + event.clientY - origin.y },
        frameRef.current.size,
        frameArea(rootRef.current, bounds?.current ?? null),
      )

      setOffset(next)
      store.save(key, { ...frameRef.current.size, x: next.x, y: next.y })
    },
    [bounds, key, store],
  )

  // 指针被系统抢走时坐标不可信，回到按下前的位置（原本居中则继续居中）
  const abortMove = useCallback((): void => {
    const origin = moveOriginRef.current
    if (origin === null) return

    moveOriginRef.current = null
    setOffset(origin.before)
  }, [])

  const style: React.CSSProperties =
    offset === null
      ? { width: size.width, height: size.height }
      : { width: size.width, height: size.height, position: 'absolute', left: offset.x, top: offset.y }

  const handle = (
    <span
      aria-hidden="true"
      onPointerDown={startResize}
      onPointerMove={moveResize}
      onPointerUp={endResize}
      onPointerCancel={abortResize}
      className="absolute bottom-0 right-0 z-20 flex cursor-nwse-resize touch-none items-end justify-end text-secondary/70"
      style={{ width: HANDLE_SIZE, height: HANDLE_SIZE }}
    >
      {/* 右下角两条斜线，与 IDEA 对话框的缩放手柄同形 */}
      <svg viewBox="0 0 14 14" width={HANDLE_SIZE} height={HANDLE_SIZE} aria-hidden="true">
        <path d="M13 6 6 13M13 10l-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      </svg>
    </span>
  )

  return {
    style,
    rootRef: setRootRef,
    dragProps: {
      onPointerDown: startMove,
      onPointerMove: moveMove,
      onPointerUp: endMove,
      onPointerCancel: abortMove,
      onLostPointerCapture: abortMove,
    },
    handle,
  }
}
