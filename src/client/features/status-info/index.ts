/**
 * 状态栏条目 feature 定义。
 *
 * 槽位为 statusBar：只贡献一个「运行中 N」条目，没有工具条按钮，也不占面板。
 */
import type { IdeFeature } from '../../shell/contract'

import { locales } from './locales'
import { RunningStatus } from './RunningStatus'

/** 状态栏条目 feature。 */
const statusInfoFeature: IdeFeature = {
  id: 'statusInfo',
  slot: 'statusBar',
  order: 10,
  locales,
  status: RunningStatus,
}

export default statusInfoFeature
