/**
 * IDE 设置 feature 定义。
 *
 * 槽位为 editorTab：认领 `settings:` 前缀的标签，从欢迎页或状态栏进入。
 */
import type { IdeFeature } from '../../shell/contract'

import { locales } from './locales'
import { SettingsPage } from './SettingsPage'

/** 设置 feature。 */
const settingsFeature: IdeFeature = {
  id: 'settings',
  slot: 'editorTab',
  order: 50,
  locales,
  editor: {
    canOpen: (address) => address.startsWith('settings:'),
    render: SettingsPage,
  },
}

export default settingsFeature
