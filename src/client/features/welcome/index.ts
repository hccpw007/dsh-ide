/**
 * 欢迎页 feature 定义。
 *
 * 槽位为 editorTab：认领 `welcome:` 前缀的标签。
 */
import type { IdeFeature } from '../../shell/contract'

import { locales } from './locales'
import { WelcomePage } from './WelcomePage'

/** 欢迎页 feature。 */
const welcomeFeature: IdeFeature = {
  id: 'welcome',
  slot: 'editorTab',
  order: 30,
  locales,
  editor: {
    canOpen: (address) => address.startsWith('welcome:'),
    render: WelcomePage,
  },
}

export default welcomeFeature
