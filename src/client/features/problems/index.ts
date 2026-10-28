/**
 * 问题面板 feature 定义。
 *
 * 槽位为 bottomPanel：入口图标排在左侧工具条下方。
 */
import type { IdeFeature } from '../../shell/contract'

import { problemsIcon } from './icons'
import { locales } from './locales'
import { ProblemsPanel } from './ProblemsPanel'

/** 问题面板 feature。 */
const problemsFeature: IdeFeature = {
  id: 'problems',
  slot: 'bottomPanel',
  order: 40,
  icon: problemsIcon,
  locales,
  view: ProblemsPanel,
}

export default problemsFeature
