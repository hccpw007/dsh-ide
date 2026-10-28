/**
 * 输出 feature 定义。
 *
 * 槽位为 bottomPanel：入口图标排在左侧工具条下方，点击后在工作台底部展开。
 */
import type { IdeFeature } from '../../shell/contract'

import { outputIcon } from './icons'
import { locales } from './locales'
import { OutputPanel } from './OutputPanel'

/** 输出 feature。 */
const outputFeature: IdeFeature = {
  id: 'output',
  slot: 'bottomPanel',
  order: 50,
  icon: outputIcon,
  locales,
  view: OutputPanel,
}

export default outputFeature
