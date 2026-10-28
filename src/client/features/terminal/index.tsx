/**
 * 终端 feature 定义。
 *
 * 槽位为 bottomPanel：入口图标排在左侧工具条下方，点击后在工作台底部展开。
 * 终端本体属于 P4，这里先给占位视图，保证入口点击有明确反馈而不是空白。
 */
import React from 'react'

import type { IdeFeature, FeatureViewProps } from '../../shell/contract'

import { terminalIcon } from './icons'
import { locales } from './locales'

/**
 * 终端面板占位视图。
 * @param props 外壳传入的 feature props
 * @returns 说明当前阶段与后续接入内容的空态
 */
function TerminalView({ t }: FeatureViewProps): React.ReactElement {
  return <div className="p-3 text-xs text-secondary">{t('empty')}</div>
}

/** 终端 feature。 */
const terminalFeature: IdeFeature = {
  id: 'terminal',
  slot: 'bottomPanel',
  order: 10,
  icon: terminalIcon,
  locales,
  view: TerminalView,
}

export default terminalFeature
