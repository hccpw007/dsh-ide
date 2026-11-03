/**
 * 对话页 IDE 弹窗的插槽注册。
 *
 * 按钮与弹窗必须一起注册：按钮在宿主的输入区，弹窗在应用级覆盖层，
 * 任一处缺席另一处都没有意义，因此集中在同一个函数里装配。
 * 入口按钮的显隐受设置页「显示 IDE 弹窗按钮」控制；关掉时顺带收起已打开的弹窗，
 * 否则用户会看到弹窗却找不到收起它的入口。
 *
 * 入口分两处：对话中在底部操作行（`conversation.composer.dock`），新对话首页
 * 没有这一行（宿主只在对话态渲染它），改在输入框工具行（`conversation.input.left`）
 * 注册，再由按钮自身绝对定位浮到输入卡片正下方，两处视觉位置一致。两处都按会话
 * 是否空白互斥渲染，同时只有一个入口可见。
 */
import React, { useEffect, useSyncExternalStore } from 'react'

import type { PluginContext, Translate } from '../../../types/plugin'

import { useIdePreferences } from '../ide-preferences'
import { readSessionBlank, readSessionCwd, readSessionId, subscribeSessions } from '../session-cwd'

import { IdePopup } from './IdePopup'
import { IdePopupButton } from './IdePopupButton'
import { closeIdePopup } from './popup-store'

/** 两个插槽共用的注册 id，保证同一宿主里只出现一份入口与一份弹窗。 */
const ENTRY_ID = 'ide-popup'

/** 新对话首页入口的注册 id；与底部入口分属不同插槽，不会互相覆盖。 */
const BLANK_SESSION_ENTRY_ID = 'ide-popup-blank-session'

/**
 * 注册对话页的 IDE 弹窗入口。
 * @param ctx 插件上下文
 * @param t 外壳翻译函数
 */
export function registerIdePopup(ctx: PluginContext, t: Translate): void {
  /** 底部操作行里的入口：只负责开关，不渲染工作台。 */
  const Button = (props: Record<string, unknown>) => {
    const preferences = useIdePreferences()

    // 按钮被设置关掉时，已打开的弹窗一并收起，避免留下没有入口的浮层
    useEffect(() => {
      if (!preferences.popupButtonVisible) closeIdePopup()
    }, [preferences.popupButtonVisible])

    if (!preferences.popupButtonVisible) return null

    return <IdePopupButton t={t} sessionId={readSessionId(props)} />
  }

  /** 新对话首页的入口：空白会话浮在输入卡片下方，发消息后让位给底部入口。 */
  const BlankSessionButton = (props: Record<string, unknown>) => {
    const preferences = useIdePreferences()
    const sessionId = readSessionId(props)
    // 会话列表变化后重读：工作目录选定、首条消息发出都会让入口显隐切换
    const blank = useSyncExternalStore(
      subscribeSessions,
      () => readSessionBlank(sessionId),
      () => readSessionBlank(sessionId),
    )
    const cwd = useSyncExternalStore(
      subscribeSessions,
      () => readSessionCwd(sessionId),
      () => readSessionCwd(sessionId),
    )

    // 设置里关掉入口时，已打开的弹窗一并收起，避免留下没有入口的浮层
    useEffect(() => {
      if (!preferences.popupButtonVisible) closeIdePopup()
    }, [preferences.popupButtonVisible])

    // 没有工作目录时工作台无根可展示，入口不出现，等用户选好工作区再提供
    if (!preferences.popupButtonVisible || !blank || cwd === '') return null

    /*
     * 新对话首页的宿主输入区没有底部操作行，这里用绝对定位把按钮浮到输入卡片正下方
     * 左侧，视觉位置与对话中的底部入口一致。包含块是宿主的输入卡片（`position:
     * relative`），因此不需要测量卡片位置：卡片高度随输入行数变化时按钮自动跟随。
     * 顶部间距 4px 与宿主底部操作行到卡片底边的间距相同。
     */
    return (
      <div className="absolute -bottom-[27px] left-2">
        <IdePopupButton t={t} sessionId={sessionId} />
      </div>
    )
  }

  // 排在宿主统计药丸之前，对应设计稿里最左侧的位置
  ctx.slots.inject('conversation.composer.dock', () =>
    ctx.slots.register({ name: 'conversation.composer.dock', id: ENTRY_ID, order: -10 }, Button),
  )

  // 新对话首页没有底部操作行，入口借输入框工具行注册，由按钮自身浮到卡片下方
  ctx.slots.inject('conversation.input.left', () =>
    ctx.slots.register(
      { name: 'conversation.input.left', id: BLANK_SESSION_ENTRY_ID, order: -10 },
      BlankSessionButton,
    ),
  )

  // 弹窗挂在应用级覆盖层：对话页没有插件自己的容器，只能借这一层浮在主区之上
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register({ name: 'shell.overlay', id: ENTRY_ID, order: 50 }, () => <IdePopup t={t} />),
  )
}
