/**
 * 分支 feature 定义。
 *
 * 槽位为 toolWindow：与项目树、版本控制、历史并列在工具条上方。
 */
import type { IdeFeature } from '../../shell/contract'

import { BranchesPanel } from './BranchesPanel'
import { branchesIcon } from './icons'
import { locales } from './locales'

/** 分支 feature。 */
const branchesFeature: IdeFeature = {
  id: 'branches',
  slot: 'toolWindow',
  order: 40,
  icon: branchesIcon,
  locales,
  view: BranchesPanel,
}

export default branchesFeature
