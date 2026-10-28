/**
 * 运行配置 feature 定义。
 *
 * 槽位为 bottomPanel：入口图标排在左侧工具条下方，点击后在工作台底部展开。
 */
import type { IdeFeature } from '../../shell/contract'

import { runIcon } from './icons'
import { locales } from './locales'
import { RunPanel } from './RunPanel'

/** 运行配置 feature。 */
const runFeature: IdeFeature = {
  id: 'run',
  slot: 'bottomPanel',
  order: 20,
  icon: runIcon,
  locales,
  view: RunPanel,
}

export default runFeature
