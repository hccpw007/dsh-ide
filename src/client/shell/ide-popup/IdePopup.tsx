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
import React, { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'

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

/**
 * 宿主输入卡片的标记；弹窗止于它的上边缘。
 *
 * 不用整个输入区（`[data-conversation-region="composer"]`）的上沿：新对话首页的
 * 输入区还包含居中的大标题与工作区行，按它的上沿量会把弹窗压到半屏。输入卡片
 * 在对话页与新对话页都贴着内容区底部，量它才能让弹窗大小两处一致。
 */
const CARD_SELECTOR = '[data-composer-card]'

/**
 * 输入区里可能占住底部的块标记，按优先级排列：普通输入卡片、提问、审批、计划确认。
 *
 * 后三者出现时宿主会把普通输入卡片藏起来（矩形归零），只留交互块占着输入区。
 * 锚点若仍取被藏起来的卡片，`top` 是 0，弹窗高度会被算成 0——表现就是「点了打不开」。
 */
const COMPOSER_BLOCK_SELECTORS = [
  CARD_SELECTOR,
  '[data-question-key]',
  '[data-approval-key]',
  '[data-plan-review-key]',
] as const

/**
 * 弹窗打开期间挂在对话内容区上的标记。
 *
 * 新对话首页的输入卡片垂直居中，弹窗按输入框上沿量高度就只能得到半屏；打开时给
 * 内容区打上这个标记，插件样式表把输入卡片沉到内容区底部，弹窗因此与对话中一样
 * 占满整块区域。标记只在弹窗打开期间存在，关闭后输入卡片立刻回到居中位置。
 */
const POPUP_OPEN_ATTRIBUTE = 'data-dsh-ide-popup-open'

/** 弹窗与主区边缘之间的空隙（px）：左右各留一份，底部与输入框之间也留一份，避免贴成一块。 */
const POPUP_GAP = 5

/** 弹窗与主区顶边之间的空隙（px）：顶部没有相邻控件，留得比左右更窄一些。 */
const POPUP_TOP_GAP = 3

/**
 * 关闭后保持挂载的时长。
 *
 * 关闭只隐藏是为了「再次打开还是原样」，但无限期保留会让后台轮询、Git 订阅与
 * 终端内核一直活着。超过这个时长仍处于关闭状态就真正卸载：标签与布局都在
 * 模块级状态池里，重新挂载会从池里恢复，只是需要重新列一次目录。
 */
const IDLE_UNMOUNT_MS = 10 * 60_000

/**
 * 取输入区里真正占位的那一块。
 * @returns 可见块元素；输入区整体不可用（例如切换到其它视图）时为 null
 */
function composerBlockOf(): Element | null {
  for (const selector of COMPOSER_BLOCK_SELECTORS) {
    // 同一标记可能有多份：隐藏视图里的残留矩形为 0，只认真正有高度的那一份
    for (const el of Array.from(document.querySelectorAll(selector))) {
      if (el.getBoundingClientRect().height > 0) return el
    }
  }

  return null
}

/**
 * 取新对话页输入卡片上方那一行（工作区 / 模式 / 技能包）。
 *
 * 卡片嵌在插槽包装里，包装与工作区行同属宿主的输入区栈。新对话页在输入栏之前
 * 还有标题行与工作区行，取离输入栏最近、又真正占高的那一块——零高度的插槽占位
 * 会被跳过。对话页没有这些行，返回 null。
 * @param card 宿主输入卡片
 * @returns 工作区行元素；不存在的布局下为 null
 */
function workspaceRowOf(card: Element): Element | null {
  // 卡片 → 输入栏根 → 插槽包装；包装的兄弟才是输入区栈的其它行
  let row = card.parentElement?.parentElement?.previousElementSibling ?? null

  while (row !== null) {
    // 插槽占位可能没有高度，跳过它继续往上找真正显示的块
    if (row.getBoundingClientRect().height > 0) return row

    row = row.previousElementSibling
  }

  return null
}

/**
 * 按宿主对话内容区计算弹窗矩形。
 *
 * 矩形取相对覆盖层的坐标：覆盖层铺满整个应用框架，与弹窗共用同一坐标系，
 * 因此窗口缩放后不需要再算一次偏移。左右各留 5px、顶部留 3px 空隙，底部停在
 * 输入区块（输入卡片，或提问 / 审批 / 计划确认交互块）上边缘上方 5px 而不是窗口
 * 底部，是为了让宿主的输入区与底部入口按钮继续可用——否则弹窗一开就没办法
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
  const block = composerBlockOf()
  // 新对话页的普通输入卡片上方还有「工作区 / 模式 / 技能包」一行：弹窗止于这一行，
  // 不把它盖住；对话页没有这一行，直接止于输入区块。提问与审批块同理止于块顶部，
  // 用户正在回答的内容始终留在弹窗下方可见
  const anchor =
    block === null
      ? null
      : target.getAttribute('data-content-phase') === 'hero' && block.matches(CARD_SELECTOR)
        ? workspaceRowOf(block) ?? block
        : block
  const bottom =
    anchor === null
      ? rect.bottom
      : Math.min(rect.bottom, anchor.getBoundingClientRect().top - POPUP_GAP)

  return {
    // 左右各让出 POPUP_GAP：弹窗不贴满主区两侧，与宿主的侧边栏、内容边界之间留出空隙
    left: rect.left - frame.left + POPUP_GAP,
    // 顶部也让出 POPUP_TOP_GAP，高度随之收紧：底边位置仍由输入卡片决定，不能一起下移
    top: rect.top - frame.top + POPUP_TOP_GAP,
    width: Math.max(0, rect.width - POPUP_GAP * 2),
    height: Math.max(0, bottom - rect.top - POPUP_TOP_GAP),
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
  /** 是否渲染工作台：关闭超过一定时长后置 false，真正卸载内部实例。 */
  const [mounted, setMounted] = useState(false)

  // 打开即挂载；关闭后等一段空闲再卸载，给「关掉又马上打开」留出零成本路径
  useEffect(() => {
    if (open) {
      setMounted(true)

      return undefined
    }

    if (!mounted) return undefined

    const timer = window.setTimeout(() => setMounted(false), IDLE_UNMOUNT_MS)

    return () => window.clearTimeout(timer)
  }, [mounted, open])

  // 先决定新对话页的输入卡片要不要沉底，再量弹窗：标记生效后底边位置才是最终值
  useLayoutEffect(() => {
    const content = document.querySelector<HTMLElement>(TARGET_SELECTOR)

    if (content === null) return undefined

    // 关闭时同步摘掉标记，新对话页的输入卡片回到居中位置
    if (!open) {
      content.removeAttribute(POPUP_OPEN_ATTRIBUTE)

      return undefined
    }

    content.setAttribute(POPUP_OPEN_ATTRIBUTE, '')

    return () => content.removeAttribute(POPUP_OPEN_ATTRIBUTE)
  }, [open])

  // 打开时量一次主区矩形，窗口或侧栏宽度变化后重新量，保证弹窗始终贴着主区
  useLayoutEffect(() => {
    const root = rootRef.current

    if (!open || root === null) return undefined

    const overlay = root.closest<HTMLElement>('[data-shell-overlay]')

    if (overlay === null) return undefined

    /** 上一次应用过的矩形签名；面板拖拽时 ResizeObserver 每帧都触发，相同结果不必重渲染。 */
    let lastKey = ''
    /** 待执行的重算帧；一帧内多次尺寸变化只量一次。 */
    let frame: number | null = null

    const update = (): void => {
      frame = null

      const next = measurePopup(overlay)
      const key = `${String(next.left)}:${String(next.top)}:${String(next.width)}:${String(next.height)}`

      if (key === lastKey) return

      lastKey = key
      setRect(next)
    }

    /**
     * 排一次重算。
     *
     * ResizeObserver 每秒可触发上百次，直接 measure 会在读取几何与写样式之间
     * 反复触发强制布局（布局抖动）；合并到一帧一次即可。
     */
    const schedule = (): void => {
      if (frame === null) frame = window.requestAnimationFrame(update)
    }

    schedule()

    // 同时观察覆盖层与对话内容区：窗口缩放只改前者，右侧栏开关只改后者
    const observer = new ResizeObserver(schedule)
    observer.observe(overlay)

    const target = document.querySelector(TARGET_SELECTOR)

    if (target !== null) observer.observe(target)

    // 输入区块本身也要观察：提问 / 审批块出现或收起时，弹窗要跟着让位或恢复高度
    const block = composerBlockOf()

    if (block !== null) observer.observe(block)

    return () => {
      observer.disconnect()
      if (frame !== null) window.cancelAnimationFrame(frame)
    }
    // mounted 必须参与依赖：首次打开时 open 先变 true，但工作台要到下一次渲染
    // 才真正挂载；少了它，rootRef 在这一次布局阶段还是 null，之后不再重算，
    // 弹窗会永远停在 visibility:hidden
  }, [mounted, open])

  // 从未打开过、或关闭太久已经卸载时没有可渲染的实例
  if (state.openSessionId === '' || !mounted) return null

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
        // 收起后暂停后台同步：隐藏期间不该继续起 git 进程、刷隐藏的渲染树
        active={open}
        onClose={closeIdePopup}
      />
    </div>
  )
}
