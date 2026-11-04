/**
 * 侧边栏 IDE 入口与弹窗的插槽注册。
 *
 * 入口按钮在左侧边栏底部（`sidebar.footer.action`），弹窗在应用级覆盖层
 * （`shell.overlay`），两处必须一起注册：任一处缺席另一处都没有意义，因此集中
 * 在同一个函数里装配。入口的显隐受设置页「在侧边栏显示 IDE 入口」控制；关掉时
 * 顺带收起已打开的弹窗，否则用户会看到弹窗却找不到收起它的入口。
 *
 * 侧边栏底部插槽不携带会话上下文（宿主只给 `wide` 标志），而入口必须与眼前的
 * 会话严格一致：这里在会话页的两处插槽各注册一个不渲染界面的跟踪组件，把宿主
 * 传入的会话 id 记成「当前会话」，供侧边栏按钮读取。对话中走底部操作行
 * （`conversation.composer.dock`），新对话首页走输入框工具行
 * （`conversation.input.left`），两处恰好覆盖全部会话页。
 */
import React, { useEffect } from 'react'

import type { PluginContext, Translate } from '../../../types/plugin'

import { useIdePreferences } from '../ide-preferences'
import { clearCurrentSession, readSessionId, setCurrentSession } from '../session-cwd'

import { IdePopup } from './IdePopup'
import { IdePopupButton } from './IdePopupButton'
import { closeIdePopup } from './popup-store'

/** 侧边栏入口与弹窗共用的注册 id。 */
const ENTRY_ID = 'ide-popup'

/** 会话跟踪组件的注册 id；对话中与首页各一份，分属不同插槽，不会互相覆盖。 */
const SESSION_TRACKER_ID = 'ide-popup-session'

/** 新对话首页的会话跟踪 id。 */
const BLANK_SESSION_TRACKER_ID = 'ide-popup-session-blank'

/**
 * 会话跟踪：不渲染界面，只把宿主传入的会话 id 记成「当前会话」。
 *
 * 卸载时清空自己记录的值，离开会话页后入口随之置灰——不用上一次的会话去开一份
 * 与眼前页面无关的工作台。
 * @param props 宿主传给插槽组件的 props
 * @returns 不渲染任何节点
 */
function SessionTracker(props: Record<string, unknown>): null {
  const sessionId = readSessionId(props)

  useEffect(() => {
    setCurrentSession(sessionId)

    return () => {
      clearCurrentSession(sessionId)
    }
  }, [sessionId])

  return null
}

/**
 * 注册侧边栏的 IDE 入口与弹窗。
 * @param ctx 插件上下文
 * @param t 外壳翻译函数
 */
export function registerIdePopup(ctx: PluginContext, t: Translate): void {
  /** 侧边栏底部的入口：设置关掉时不渲染，并把已打开的弹窗一并收起。 */
  const Button = () => {
    const preferences = useIdePreferences()

    // 按钮被设置关掉时收起弹窗，避免留下没有入口的浮层
    useEffect(() => {
      if (!preferences.popupButtonVisible) closeIdePopup()
    }, [preferences.popupButtonVisible])

    if (!preferences.popupButtonVisible) return null

    return <IdePopupButton t={t} />
  }

  // 会话页的两处插槽各注册一份跟踪器，覆盖「对话中」与「新对话首页」
  ctx.slots.inject('conversation.composer.dock', () =>
    ctx.slots.register(
      { name: 'conversation.composer.dock', id: SESSION_TRACKER_ID, order: -10 },
      SessionTracker,
    ),
  )
  ctx.slots.inject('conversation.input.left', () =>
    ctx.slots.register(
      { name: 'conversation.input.left', id: BLANK_SESSION_TRACKER_ID, order: -10 },
      SessionTracker,
    ),
  )

  // 侧边栏底部的全局入口：纯图标按钮，绑定当前会话
  ctx.slots.inject('sidebar.footer.action', () =>
    ctx.slots.register({ name: 'sidebar.footer.action', id: ENTRY_ID, order: 10 }, Button),
  )

  // 弹窗挂在应用级覆盖层：对话页没有插件自己的容器，只能借这一层浮在主区之上
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register({ name: 'shell.overlay', id: ENTRY_ID, order: 50 }, () => <IdePopup t={t} />),
  )
}
