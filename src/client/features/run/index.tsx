/**
 * 启动器 feature 定义。
 *
 * 槽位为 bottomPanel：入口图标排在左侧工具条下方，点击后在工作台底部展开。
 * 运行配置属于 P6，这里先给占位视图，保证入口点击有明确反馈而不是空白。
 */
import React from 'react'

import type { IdeFeature, FeatureViewProps } from '../../shell/contract'

import { runIcon } from './icons'
import { locales } from './locales'

/**
 * 启动器面板占位视图。
 * @param props 外壳传入的 feature props
 * @returns 说明当前阶段与后续接入内容的空态
 */
function RunView({ t }: FeatureViewProps): React.ReactElement {
  return <div className="p-3 text-xs text-secondary">{t('empty')}</div>
}

/** 启动器 feature。 */
const runFeature: IdeFeature = {
  id: 'run',
  slot: 'bottomPanel',
  order: 20,
  icon: runIcon,
  locales,
  view: RunView,
}

export default runFeature
