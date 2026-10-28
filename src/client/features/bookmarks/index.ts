/**
 * 书签 feature 定义。
 *
 * 槽位为 toolWindow：与项目树并列在工具条上方。
 */
import type { IdeFeature } from '../../shell/contract'

import { BookmarksPanel } from './BookmarksPanel'
import { bookmarksIcon } from './icons'
import { locales } from './locales'

/** 书签 feature。 */
const bookmarksFeature: IdeFeature = {
  id: 'bookmarks',
  slot: 'toolWindow',
  order: 70,
  icon: bookmarksIcon,
  locales,
  view: BookmarksPanel,
}

export default bookmarksFeature
