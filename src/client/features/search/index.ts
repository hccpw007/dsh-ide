/**
 * 搜索 feature 定义。
 *
 * 槽位为 bottomPanel：入口图标排在左侧工具条下方。
 */
import type { IdeFeature } from '../../shell/contract'

import { locales } from './locales'
import { SearchPanel } from './SearchPanel'
import { searchIcon } from './icons'

/** 搜索 feature。 */
const searchFeature: IdeFeature = {
  id: 'search',
  slot: 'bottomPanel',
  order: 30,
  icon: searchIcon,
  locales,
  view: SearchPanel,
}

export default searchFeature
