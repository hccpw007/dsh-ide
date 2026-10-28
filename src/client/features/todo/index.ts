/**
 * TODO feature 定义。
 *
 * 槽位为 toolWindow：与项目树并列在工具条上方。
 */
import type { IdeFeature } from '../../shell/contract'

import { locales } from './locales'
import { TodoPanel } from './TodoPanel'
import { todoIcon } from './icons'

/** TODO feature。 */
const todoFeature: IdeFeature = {
  id: 'todo',
  slot: 'toolWindow',
  order: 60,
  icon: todoIcon,
  locales,
  view: TodoPanel,
}

export default todoFeature
