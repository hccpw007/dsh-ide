/**
 * 对话页的「IDE」入口按钮。
 *
 * 对话中由宿主的 composer dock 承载，位于输入卡片下方的底部状态行最左侧；新对话
 * 首页没有这一行，由注册处用绝对定位把同一个按钮浮到输入卡片正下方，两处位置一致。
 * 点击后由 `shell.overlay` 那边的弹窗接管渲染，按钮自身不渲染任何 IDE 内容。
 * 按钮订阅弹窗状态：打开时呈激活态，让用户一眼看出弹窗来自这里、再点一次收起。
 *
 * 同一工作空间内切换对话不换人：这里比较弹窗绑定的会话与眼前的会话，只要不是
 * 同一个就把弹窗收起。收起只改开关，工作台实例与打开的文件、布局都留着，重新
 * 点按钮还能回到关闭前那一份；跨工作空间的旧实例在换项目打开时随渲染会话切换卸载，
 * 回来时按项目记录重建并从工作空间状态池恢复标签与布局。
 */
import React, { useEffect, useSyncExternalStore } from 'react'

import { cn } from '../../../common/cn'
import type { Translate } from '../../../types/plugin'
import { readSessionCwd, subscribeSessions, workspaceIdOf } from '../session-cwd'

import {
  closeIdePopup,
  followIdePopup,
  idePopupState,
  subscribeIdePopup,
  toggleIdePopup,
} from './popup-store'

/** 按钮 props。 */
export interface IdePopupButtonProps {
  /** 外壳翻译函数。 */
  t: Translate
  /** 按钮所属会话；空串表示还没有会话，按钮不可用。 */
  sessionId: string
}

/**
 * 入口图标：一个带标题栏的窗口轮廓。
 * @returns 图标节点
 */
function popupIcon(): React.ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      aria-hidden="true"
      className="shrink-0"
    >
      <rect x="2.2" y="2.8" width="11.6" height="10.4" rx="1.4" />
      <path d="M2.2 6.2h11.6" />
    </svg>
  )
}

/**
 * 渲染弹窗入口按钮。
 * @param props 见 IdePopupButtonProps
 * @returns 带激活态的胶囊按钮
 */
export function IdePopupButton({ t, sessionId }: IdePopupButtonProps): React.ReactElement {
  const state = useSyncExternalStore(subscribeIdePopup, idePopupState, idePopupState)
  const cwd = useSyncExternalStore(
    subscribeSessions,
    () => readSessionCwd(sessionId),
    () => readSessionCwd(sessionId),
  )
  /** 当前会话的工作空间标识；空串表示尚未绑定工作目录。 */
  const workspaceKey = workspaceIdOf(cwd)
  // 弹窗绑定在这个对话上才算「已打开」：切换对话后弹窗会被收起，按钮不应再显示激活态
  const open = state.open && state.sessionId === sessionId

  // 切换对话时收起弹窗：只关不清理，实例与文件、布局都留着，重新打开即原样恢复
  useEffect(() => {
    if (!state.open || sessionId === '') return

    // 弹窗绑定的对话与眼前这个不是同一个：收起，下次点按钮再恢复
    if (state.sessionId !== sessionId) {
      closeIdePopup()

      return
    }

    // 同一对话换了工作目录：原内容已不属于这个项目，收起；
    // 同一对话从「未绑定目录」变成绑定目录时只补记工作空间，界面原地保留
    if (workspaceKey !== '' && workspaceKey !== state.workspaceKey) {
      if (state.workspaceKey === '') followIdePopup(sessionId, workspaceKey)
      else closeIdePopup()
    }
  }, [sessionId, state.open, state.sessionId, state.workspaceKey, workspaceKey])

  return (
    <button
      type="button"
      title={open ? t('shell.popupClose') : t('shell.popupOpen')}
      disabled={sessionId === ''}
      // 与宿主状态药丸同语义：展开时置 aria-expanded，样式也由这个属性驱动
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => toggleIdePopup(sessionId, workspaceKey)}
      className={cn(
        /*
         * 尺寸与配色对齐宿主底部状态药丸：12px 常规字重、20px 行高、无边框、透明底，
         * 悬停时才浮出宿主的中性底色。
         *
         * preflight 是关闭的，`<button>` 会带着浏览器默认的灰底与 2px 立体边框，所以
         * 边框与底色都必须显式清零；否则这一个按钮会比旁边的药丸高出一截、也厚重得多，
         * 与 DSH 的整体风格脱节。
         */
        'flex shrink-0 items-center gap-1.5 rounded-lg border-0 bg-transparent px-2 py-[1px] text-[12px] font-normal leading-5 text-tertiary transition-colors disabled:opacity-50',
        'enabled:hover:bg-hoverbg enabled:hover:text-secondary',
        // 弹窗打开时保持宿主药丸的展开态外观，并用比悬停深一档的底色提示「已打开」
        'aria-expanded:bg-activebg aria-expanded:text-secondary',
      )}
    >
      {popupIcon()}
      {/* 弹窗入口的可见文案 */}
      <span>{t('shell.popupEntry')}</span>
    </button>
  )
}
