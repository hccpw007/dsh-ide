/**
 * 对话页 IDE 弹窗的插槽注册。
 *
 * 按钮与弹窗必须一起注册：按钮在宿主的底部操作行，弹窗在应用级覆盖层，
 * 任一处缺席另一处都没有意义，因此集中在同一个函数里装配。
 */
import React from 'react'

import type { PluginContext, Translate } from '../../../types/plugin'

import { readSessionId } from '../session-cwd'

import { IdePopup } from './IdePopup'
import { IdePopupButton } from './IdePopupButton'

/** 两个插槽共用的注册 id，保证同一宿主里只出现一份入口与一份弹窗。 */
const ENTRY_ID = 'ide-popup'

/**
 * 注册对话页的 IDE 弹窗入口。
 * @param ctx 插件上下文
 * @param t 外壳翻译函数
 */
export function registerIdePopup(ctx: PluginContext, t: Translate): void {
  /** 底部操作行里的入口：只负责开关，不渲染工作台。 */
  const Button = (props: Record<string, unknown>) => (
    <IdePopupButton t={t} sessionId={readSessionId(props)} />
  )

  // 排在宿主统计药丸之前，对应设计稿里最左侧的位置
  ctx.slots.inject('conversation.composer.dock', () =>
    ctx.slots.register({ name: 'conversation.composer.dock', id: ENTRY_ID, order: -10 }, Button),
  )

  // 弹窗挂在应用级覆盖层：对话页没有插件自己的容器，只能借这一层浮在主区之上
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register({ name: 'shell.overlay', id: ENTRY_ID, order: 50 }, () => <IdePopup t={t} />),
  )
}
