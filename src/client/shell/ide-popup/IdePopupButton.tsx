/**
 * 对话页底部状态行里的「IDE」按钮。
 *
 * 宿主的 composer dock 是对话页唯一常驻的操作条，按钮放在这里最容易被找到；
 * 点击后由 `shell.overlay` 那边的弹窗接管渲染，按钮自身不渲染任何 IDE 内容。
 */
import React, { useEffect } from 'react'

import type { Translate } from '../../../types/plugin'

import { closeIdePopup, idePopupState, toggleIdePopup } from './popup-store'

/** 按钮 props。 */
export interface IdePopupButtonProps {
  /** 外壳翻译函数。 */
  t: Translate
  /** 按钮所属会话；空串表示还没有会话，按钮不可用。 */
  sessionId: string
}

/**
 * 弹窗图标：一个带标题栏的窗口轮廓。
 * @returns 图标节点
 */
function popupIcon(): React.ReactElement {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      aria-hidden="true"
      className="shrink-0"
    >
      <rect x="2.2" y="2.8" width="11.6" height="10.4" rx="1.2" />
      <path d="M2.2 6.2h11.6" />
    </svg>
  )
}

/**
 * 渲染弹窗入口按钮。
 * @param props 见 IdePopupButtonProps
 * @returns 与宿主底部统计药丸同高的胶囊按钮
 */
export function IdePopupButton({ t, sessionId }: IdePopupButtonProps): React.ReactElement {
  // 切到另一个会话后旧弹窗还开着会显示上一个会话的 IDE，这里主动收起
  useEffect(() => {
    const state = idePopupState()

    if (state.open && sessionId !== '' && state.sessionId !== sessionId) closeIdePopup()
  }, [sessionId])

  return (
    <button
      type="button"
      title={t('shell.popupOpen')}
      disabled={sessionId === ''}
      onClick={() => toggleIdePopup(sessionId)}
      className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-secondary enabled:hover:bg-surface2 enabled:hover:text-primary disabled:opacity-50"
    >
      {popupIcon()}
      {/* 弹窗入口的可见文案 */}
      <span>{t('shell.popupEntry')}</span>
    </button>
  )
}
