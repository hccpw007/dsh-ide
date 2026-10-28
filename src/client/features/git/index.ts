/**
 * Git feature 定义。
 *
 * 槽位为 bottomPanel：与 IDEA 一致，版本控制常驻下方面板，由左侧工具条下方的
 * Git 图标打开；面板内部再分本地变更、日志、控制台三个页签。
 */
import type { IdeFeature } from '../../shell/contract'

import { GitPanel } from './GitPanel'
import { gitIcon } from './icons'
import { locales } from './locales'

/** 版本控制 feature。 */
const gitFeature: IdeFeature = {
  id: 'git',
  slot: 'bottomPanel',
  order: 60,
  icon: gitIcon,
  locales,
  view: GitPanel,
  // Git 面板左右分栏，200px 的默认高度放不下变更列表与差异
  preferredPanelHeight: 420,
}

export default gitFeature
