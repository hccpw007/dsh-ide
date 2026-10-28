/**
 * Git feature 定义。
 *
 * 槽位为 bottomPanel：入口图标排在左侧工具条下方，点击后在工作台底部展开。
 * 版本控制能力属于 P5，这里先给占位视图，保证入口点击有明确反馈而不是空白。
 */
import React from 'react'

import type { IdeFeature, FeatureViewProps } from '../../shell/contract'

import { gitIcon } from './icons'
import { locales } from './locales'

/**
 * Git 面板占位视图。
 * @param props 外壳传入的 feature props
 * @returns 说明当前阶段与后续接入内容的空态
 */
function GitView({ t }: FeatureViewProps): React.ReactElement {
  return <div className="p-3 text-xs text-secondary">{t('empty')}</div>
}

/** Git feature。 */
const gitFeature: IdeFeature = {
  id: 'git',
  slot: 'bottomPanel',
  order: 40,
  icon: gitIcon,
  locales,
  view: GitView,
}

export default gitFeature
