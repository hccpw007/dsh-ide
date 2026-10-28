/**
 * 版本控制 feature 定义。
 *
 * 槽位为 toolWindow：放在工具条上方的工具窗口组里，与项目树并列——
 * 变更列表是常驻面板，不占底部空间。
 */
import type { IdeFeature } from '../../shell/contract'

import { GitPanel } from './GitPanel'
import { gitIcon } from './icons'
import { locales } from './locales'

/** 版本控制 feature。 */
const gitFeature: IdeFeature = {
  id: 'git',
  slot: 'toolWindow',
  order: 20,
  icon: gitIcon,
  locales,
  view: GitPanel,
}

export default gitFeature
