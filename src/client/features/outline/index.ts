/**
 * 结构大纲 feature 定义。
 *
 * 槽位为 toolWindow：与项目树并列在工具条上方。
 */
import type { IdeFeature } from '../../shell/contract'

import { outlineIcon } from './icons'
import { locales } from './locales'
import { OutlinePanel } from './OutlinePanel'

/** 结构大纲 feature。 */
const outlineFeature: IdeFeature = {
  id: 'outline',
  slot: 'toolWindow',
  order: 50,
  icon: outlineIcon,
  locales,
  view: OutlinePanel,
}

export default outlineFeature
