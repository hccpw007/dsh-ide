/**
 * Git 历史 feature 定义。
 *
 * 槽位为 toolWindow：与项目树、版本控制并列在工具条上方。
 */
import type { IdeFeature } from '../../shell/contract'

import { GitHistory } from './GitHistory'
import { historyIcon } from './icons'
import { locales } from './locales'

/** Git 历史 feature。 */
const gitHistoryFeature: IdeFeature = {
  id: 'gitHistory',
  slot: 'toolWindow',
  order: 30,
  icon: historyIcon,
  locales,
  view: GitHistory,
}

export default gitHistoryFeature
