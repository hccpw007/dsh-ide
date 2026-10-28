/**
 * 状态栏。
 *
 * P0 只显示工作台标识、承载形态与会话片段；分支、变更数、光标位置等条目
 * 由 statusBar 槽位的 feature 在后续阶段贡献。
 */
import React from 'react'

import type { Translate } from '../../types/plugin'

/** 状态栏 props。 */
export interface StatusBarProps {
  /** 当前会话 id；空串表示承载面未绑定会话。 */
  sessionId: string
  /** 承载形态，用于区分主区视图与右侧栏。 */
  surface: 'main' | 'sidebar'
  /** 外壳翻译函数。 */
  t: Translate
}

/**
 * 渲染状态栏。
 * @param props 见 StatusBarProps
 * @returns 底部一条细状态栏
 */
export function StatusBar({ sessionId, surface, t }: StatusBarProps): React.ReactElement {
  return (
    <div className="flex h-6 shrink-0 items-center gap-3 border-t border-line1 bg-layer1 px-3 text-xs text-secondary">
      {/* 工作台标识，说明当前这块区域是什么 */}
      <span className="text-primary">{t('shell.statusLabel')}</span>

      {/* 当前承载形态：主区视图或右侧栏 */}
      <span>{surface === 'main' ? t('shell.surfaceMain') : t('shell.surfaceSidebar')}</span>

      <span className="flex-1" />

      {/* 会话标识，未绑定会话时明确说明 */}
      <span>{sessionId === '' ? t('shell.noSession') : sessionId.slice(0, 8)}</span>
    </div>
  )
}
