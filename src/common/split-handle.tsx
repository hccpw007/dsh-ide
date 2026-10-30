/**
 * 面板分隔条。
 *
 * 用 Pointer 事件而不是 Mouse 事件：触控板、触屏与鼠标都产生 pointer 事件，
 * 一套实现覆盖全部输入；拖动期间捕获指针，快速拖动移出分隔条也不会丢事件。
 */
import React, { useCallback, useEffect, useRef } from 'react'

import { cn } from './cn'

/** 分隔条 props。 */
export interface SplitHandleProps {
  /** 拖动方向：vertical 改变宽度，horizontal 改变高度。 */
  orientation: 'vertical' | 'horizontal'
  /**
   * 尺寸所指的一侧：`front` 是左侧/上方区域，`back` 是右侧/下方区域。
   *
   * 不传时沿用各方向的既有默认：纵向按左侧宽度、横向按下方高度——现有调用都是
   * 这种语义，显式声明后两种方向就能表达任意一侧的尺寸。
   */
  anchor?: 'front' | 'back'
  /** 读取拖动开始时的尺寸（px），由调用方提供以免重复维护状态。 */
  current(): number
  /** 拖动过程中报告新尺寸（px）；调用方负责收窄到合法区间。 */
  onResize(next: number): void
}

/**
 * 渲染一条可拖拽的分隔条。
 * @param props 见 SplitHandleProps
 * @returns 分隔条元素
 */
export function SplitHandle({ orientation, anchor, current, onResize }: SplitHandleProps): React.ReactElement {
  const dragging = useRef(false)
  const origin = useRef({ pointer: 0, size: 0 })
  /** 待提交的尺寸；指针事件频率远高于刷新率，先攒着再按帧提交。 */
  const pendingSize = useRef<number | null>(null)
  /** 已排队的动画帧；null 表示没有待提交的尺寸。 */
  const frame = useRef<number | null>(null)
  /** 尺寸是否属于分隔条前方区域；缺省值保持既有调用方向。 */
  const front = anchor === undefined ? orientation === 'vertical' : anchor === 'front'

  /** 把攒下的尺寸交给布局；每帧最多一次，松手时立即补最后一次。 */
  const commit = useCallback((): void => {
    frame.current = null

    const size = pendingSize.current
    if (size === null) return

    pendingSize.current = null
    onResize(size)
  }, [onResize])

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      dragging.current = true
      origin.current = {
        pointer: orientation === 'vertical' ? event.clientX : event.clientY,
        size: current(),
      }

      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch (error) { // 捕获失败必须复位，否则拖拽状态会永久粘住，之后划过就改布局
        console.error('[dsh-ide] 指针捕获失败:', error)
        dragging.current = false
      }
    },
    [orientation, current],
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return

      const pointer = orientation === 'vertical' ? event.clientX : event.clientY
      const delta = pointer - origin.current.pointer

      // 右移或下移时，前方区域变大、后方区域变小；两者只差一个符号
      pendingSize.current = origin.current.size + (front ? delta : -delta)

      // 每次 pointermove 都提交会让布局与整棵工作台按事件频率重渲染，合并到一帧一次
      if (frame.current === null) frame.current = window.requestAnimationFrame(commit)
    },
    [commit, front, orientation],
  )

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return

    dragging.current = false

    // 松手时立即补上最后一次位移，避免最后一小段被丢帧
    if (frame.current !== null) {
      window.cancelAnimationFrame(frame.current)
      frame.current = null
    }

    commit()
    event.currentTarget.releasePointerCapture(event.pointerId)
  }, [commit])

  // 卸载时取消待提交的帧，避免回调落到已经卸载的组件上
  useEffect(
    () => () => {
      if (frame.current !== null) window.cancelAnimationFrame(frame.current)
    },
    [],
  )

  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn(
        'shrink-0 bg-line1 transition-colors hover:bg-line4',
        orientation === 'vertical' ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize',
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    />
  )
}
