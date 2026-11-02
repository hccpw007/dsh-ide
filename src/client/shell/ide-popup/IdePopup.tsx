/**
 * 对话页的 IDE 弹窗。
 *
 * 按用户要求做成「覆盖主区、尺寸固定、不可拖动也不可缩放」的浮层：矩形直接量
 * 宿主对话内容区（`[data-conversation-content]`），窗口变化时跟着重算；内容复用
 * 同一个 `Workbench`，因此项目树、编辑器、Git、终端与主区 IDE 完全一致。
 *
 * 弹窗不带标题栏，关闭入口是工具栏右上角设置图标旁的关闭图标；底部入口按钮
 * 再点一次也能收起。之所以不用宿主的浮窗：宿主浮窗天生可拖拽缩放，无法满足
 * 「固定大小」；这里用 `shell.overlay` 承载，属于 AGENT.md 允许的对话页弹窗入口。
 */
import React, { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'

import type { Translate } from '../../../types/plugin'

import { Workbench } from '../Workbench'
import { useWorkbenchTranslate } from '../ide-translate'

import { closeIdePopup, idePopupState, subscribeIdePopup } from './popup-store'

/** 弹窗相对覆盖层的矩形（px）。 */
interface PopupRect {
  /** 左边缘。 */
  left: number
  /** 上边缘。 */
  top: number
  /** 宽度。 */
  width: number
  /** 高度。 */
  height: number
}

/** 量不到对话内容区时的兜底比例：覆盖层可视区域的 80%。 */
const FALLBACK_RATIO = 0.8

/** 宿主对话内容区的标记；弹窗按它对齐主区。 */
const TARGET_SELECTOR = '[data-conversation-content]'

/** 宿主输入区的标记；弹窗止于它的上边缘。 */
const COMPOSER_SELECTOR = '[data-conversation-region="composer"]'

/** 弹窗底边与输入框之间的空隙（px）：留一点呼吸感，避免和输入框贴成一块。 */
const POPUP_GAP = 5

/**
 * 按宿主对话内容区计算弹窗矩形。
 *
 * 矩形取相对覆盖层的坐标：覆盖层铺满整个应用框架，与弹窗共用同一坐标系，
 * 因此窗口缩放后不需要再算一次偏移。底部停在输入区上边缘上方 5px 而不是窗口
 * 底部，是为了让宿主的输入框与底部入口按钮继续可用——否则弹窗一开就没办法
 * 边看代码边追问，也点不到入口按钮收起弹窗。
 * @param overlay 覆盖层根元素
 * @returns 弹窗矩形
 */
function measurePopup(overlay: HTMLElement): PopupRect {
  const frame = overlay.getBoundingClientRect()
  const target = document.querySelector(TARGET_SELECTOR)

  // 对话内容区缺席（例如切换到其它视图）时退回居中比例框，弹窗仍可用
  if (target === null) {
    const width = frame.width * FALLBACK_RATIO
    const height = frame.height * FALLBACK_RATIO

    return {
      left: (frame.width - width) / 2,
      top: (frame.height - height) / 2,
      width,
      height,
    }
  }

  const rect = target.getBoundingClientRect()
  const composer = document.querySelector(COMPOSER_SELECTOR)
  const bottom =
    composer === null
      ? rect.bottom
      : Math.min(rect.bottom, composer.getBoundingClientRect().top - POPUP_GAP)

  return {
    left: rect.left - frame.left,
    top: rect.top - frame.top,
    width: rect.width,
    height: Math.max(0, bottom - rect.top),
  }
}

/** 弹窗 props。 */
export interface IdePopupProps {
  /** 外壳翻译函数。 */
  t: Translate
}

/**
 * 渲染对话页的 IDE 弹窗；关闭时返回 null，卸载其中的工作台。
 * @param props 见 IdePopupProps
 * @returns 弹窗，或关闭时的 null
 */
export function IdePopup({ t }: IdePopupProps): React.ReactElement | null {
  // 工作台文案按「IDE 语言」偏好取；弹窗入口按钮仍在宿主操作行，不经过这一层
  const workbenchT = useWorkbenchTranslate(t)
  const state = useSyncExternalStore(subscribeIdePopup, idePopupState, idePopupState)
  const [rect, setRect] = useState<PopupRect | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)

  // 打开时量一次主区矩形，窗口或侧栏宽度变化后重新量，保证弹窗始终贴着主区
  useLayoutEffect(() => {
    const root = rootRef.current

    if (!state.open || root === null) return undefined

    const overlay = root.closest<HTMLElement>('[data-shell-overlay]')

    if (overlay === null) return undefined

    const update = (): void => setRect(measurePopup(overlay))

    update()

    // 同时观察覆盖层与对话内容区：窗口缩放只改前者，右侧栏开关只改后者
    const observer = new ResizeObserver(update)
    observer.observe(overlay)

    const target = document.querySelector(TARGET_SELECTOR)

    if (target !== null) observer.observe(target)

    return () => observer.disconnect()
  }, [state.open])

  if (!state.open || state.sessionId === '') return null

  return (
    <div
      ref={rootRef}
      // 弹窗浮在对话之上：按主区矩形定位，宽度高度固定，不响应拖拽与缩放手势；
      // 没有标题栏，直接是 IDE 工作台
      className="pointer-events-auto absolute z-10 overflow-hidden rounded-md border border-line2 shadow-2xl"
      style={
        rect === null
          ? { visibility: 'hidden' }
          : { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
      }
    >
      <Workbench t={workbenchT} sessionId={state.sessionId} surface="dialog" onClose={closeIdePopup} />
    </div>
  )
}
