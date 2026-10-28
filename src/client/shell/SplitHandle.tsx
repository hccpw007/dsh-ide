/**
 * 面板分隔条。
 *
 * 用 Pointer 事件而不是 Mouse 事件：触控板、触屏与鼠标都产生 pointer 事件，
 * 一套实现覆盖全部输入；拖动期间捕获指针，快速拖动移出分隔条也不会丢事件。
 */
import React, { useCallback, useRef } from 'react'

import { cn } from '../../common/cn'

/** 分隔条 props。 */
export interface SplitHandleProps {
  /** 拖动方向：vertical 改变宽度，horizontal 改变高度。 */
  orientation: 'vertical' | 'horizontal'
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
export function SplitHandle({ orientation, current, onResize }: SplitHandleProps): React.ReactElement {
  const dragging = useRef(false)
  const origin = useRef({ pointer: 0, size: 0 })

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      dragging.current = true
      origin.current = {
        pointer: orientation === 'vertical' ? event.clientX : event.clientY,
        size: current(),
      }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [orientation, current],
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return

      const pointer = orientation === 'vertical' ? event.clientX : event.clientY
      const delta = pointer - origin.current.pointer

      // 纵向分隔条右移加宽，横向分隔条下移则下方区域变矮，因此横向取反向
      onResize(origin.current.size + (orientation === 'vertical' ? delta : -delta))
    },
    [orientation, onResize],
  )

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return

    dragging.current = false
    event.currentTarget.releasePointerCapture(event.pointerId)
  }, [])

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
