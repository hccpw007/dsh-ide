/**
 * 输出 feature 定义。
 *
 * 槽位为 bottomPanel：入口图标排在左侧工具条下方，点击后在工作台底部展开。
 * 输出通道在后续阶段接入，这里先给占位视图，保证入口点击有明确反馈而不是空白。
 */
import React from 'react'

import type { IdeFeature, FeatureViewProps } from '../../shell/contract'

import { outputIcon } from './icons'
import { locales } from './locales'

/**
 * 输出面板占位视图。
 * @param props 外壳传入的 feature props
 * @returns 说明当前阶段与后续接入内容的空态
 */
function OutputView({ t }: FeatureViewProps): React.ReactElement {
  return <div className="p-3 text-xs text-secondary">{t('empty')}</div>
}

/** 输出 feature。 */
const outputFeature: IdeFeature = {
  id: 'output',
  slot: 'bottomPanel',
  order: 30,
  icon: outputIcon,
  locales,
  view: OutputView,
}

export default outputFeature
