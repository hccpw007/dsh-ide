/**
 * 聊天输入行里的分支名称入口。
 *
 * 宿主在输入卡片工具行（`conversation.input.left`）渲染这个插槽，位置就在「权限」
 * 药丸右侧；新对话首页与对话中共用同一行，因此两态都能看到分支名。控件只在会话
 * 绑定了 Git 仓库时出现，未绑定目录或不是仓库时不留空位。
 *
 * 与 IDE 顶部菜单的分支控件同源：图标、同步箭头与分支选择弹窗都复用 git feature。
 */
import React from 'react'

import type { PluginContext, Translate } from '../../../types/plugin'

import { readSessionId } from '../session-cwd'

import { ComposerBranchButton } from './ComposerBranchButton'

/** 插槽注册 id；同一宿主里只应出现一份入口。 */
const ENTRY_ID = 'composer-branch'

/**
 * 注册聊天输入行的分支名称。
 * @param ctx 插件上下文
 * @param t 外壳翻译函数
 */
export function registerComposerBranch(ctx: PluginContext, t: Translate): void {
  /** 工具行里的分支控件；会话 id 由宿主按会话作用域注入 props。 */
  const BranchEntry = (props: Record<string, unknown>) => (
    <ComposerBranchButton t={t} sessionId={readSessionId(props)} />
  )

  // 排在同一个插槽里的 IDE 弹窗入口之后；那个入口靠绝对定位浮到卡片下方，不占流，
  // 因此分支按钮落在「权限」药丸右侧，与设计稿的位置一致
  ctx.slots.inject('conversation.input.left', () =>
    ctx.slots.register({ name: 'conversation.input.left', id: ENTRY_ID, order: 0 }, BranchEntry),
  )
}
