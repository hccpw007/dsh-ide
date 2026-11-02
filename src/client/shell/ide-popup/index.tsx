/**
 * 对话页 IDE 弹窗的插槽注册。
 *
 * 按钮与弹窗必须一起注册：按钮在宿主的底部操作行，弹窗在应用级覆盖层，
 * 任一处缺席另一处都没有意义，因此集中在同一个函数里装配。
 * 入口按钮的显隐受设置页「显示 IDE 弹窗按钮」控制；关掉时顺带收起已打开的弹窗，
 * 否则用户会看到弹窗却找不到收起它的入口。
 */
import React, { useEffect } from 'react'

import type { PluginContext, Translate } from '../../../types/plugin'

import { useIdePreferences } from '../ide-preferences'
import { readSessionId } from '../session-cwd'

import { IdePopup } from './IdePopup'
import { IdePopupButton } from './IdePopupButton'
import { closeIdePopup } from './popup-store'

/** 两个插槽共用的注册 id，保证同一宿主里只出现一份入口与一份弹窗。 */
const ENTRY_ID = 'ide-popup'

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

  // 排在宿主统计药丸之前，对应设计稿里最左侧的位置
  ctx.slots.inject('conversation.composer.dock', () =>
    ctx.slots.register({ name: 'conversation.composer.dock', id: ENTRY_ID, order: -10 }, Button),
  )

  // 弹窗挂在应用级覆盖层：对话页没有插件自己的容器，只能借这一层浮在主区之上
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register({ name: 'shell.overlay', id: ENTRY_ID, order: 50 }, () => <IdePopup t={t} />),
  )
}
