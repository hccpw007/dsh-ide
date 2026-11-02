/**
 * 对话页的 IDE 弹窗。
 *
 * 按用户要求做成「覆盖主区、尺寸固定、不可拖动也不可缩放」的浮层：矩形直接量
 * 宿主对话内容区（`[data-conversation-content]`），窗口变化时跟着重算；内容复用
 * 同一个 `Workbench`，因此项目树、编辑器、Git、终端与主区 IDE 完全一致。
 *
 * 弹窗不带标题栏，关闭入口是工具栏右上角设置图标旁的关闭图标；底部入口按钮
 * 再点一次也能收起，切换对话时同样自动收起。收起只关不清理：工作台实例与打开
 * 的文件、布局都留在原处，重新打开仍是同一份界面。之所以不用宿主的浮窗：
 * 宿主浮窗天生可拖拽缩放，无法满足「固定大小」；这里用 `shell.overlay` 承载，
 * 属于 AGENT.md 允许的对话页弹窗入口。
 *
 * 关闭只把弹窗隐藏、不卸载：再次打开要回到关闭前那一份界面，工作台重新挂载会
 * 让项目树重新列目录、编辑器重新读文件、终端重建，用户看到的就是「弹窗被重画了」。
 * 隐藏用 visibility 而不是 display，内部组件仍能量到真实尺寸，避免隐→显时布局跳变。
 */
import React, { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'

import { cn } from '../../../common/cn'
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
 * 渲染对话页的 IDE 弹窗；从未打开过时返回 null。
 * @param props 见 IdePopupProps
 * @returns 弹窗，或从未打开时的 null
 */
export function IdePopup({ t }: IdePopupProps): React.ReactElement | null {
  // 工作台文案按「IDE 语言」偏好取；弹窗入口按钮仍在宿主操作行，不经过这一层
  const workbenchT = useWorkbenchTranslate(t)
  const state = useSyncExternalStore(subscribeIdePopup, idePopupState, idePopupState)
  const [rect, setRect] = useState<PopupRect | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const open = state.open

  // 打开时量一次主区矩形，窗口或侧栏宽度变化后重新量，保证弹窗始终贴着主区
  useLayoutEffect(() => {
    const root = rootRef.current

    if (!open || root === null) return undefined

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
  }, [open])

  // 从未打开过就没有可复用的工作台实例，不渲染；关闭状态仍保留渲染树，供下次原样恢复
  if (state.openSessionId === '') return null

  return (
    <div
      ref={rootRef}
      // 弹窗浮在对话之上：按主区矩形定位，宽度高度固定，不响应拖拽与缩放手势；
      // 没有标题栏，直接是 IDE 工作台。关闭时只隐藏：卸载会让内部分区全部重建，
      // 再次打开就不是「之前那个弹窗」了。visibility 本身已把内容移出无障碍树，
      // 不再叠加 aria-hidden——关闭按钮此刻仍持有焦点，叠加会被浏览器判为冲突而告警
      className={cn(
        'absolute z-10 overflow-hidden rounded-md border border-line2 shadow-2xl',
        open ? 'pointer-events-auto' : 'pointer-events-none invisible',
      )}
      style={
        rect === null
          ? { visibility: 'hidden' }
          : { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
      }
    >
      {/*
        渲染上下文取该工作空间上次打开时的会话（`openSessionId`）：切换对话只收起弹窗，
        这里不换人，文件树、编辑区与终端才不会被重新挂载。key 取渲染会话，换到另一个
        工作空间打开时换 key，卸载上个项目的实例，而不是把旧内容顶上来。
      */}
      <Workbench
        key={state.openSessionId}
        t={workbenchT}
        sessionId={state.openSessionId}
        // @到对话要落到用户此刻所在的对话，而不是弹窗打开时的那个会话
        conversationSessionId={state.sessionId}
        surface="dialog"
        onClose={closeIdePopup}
      />
    </div>
  )
}
