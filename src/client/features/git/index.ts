/**
 * Git feature 定义。
 *
 * 槽位为 bottomPanel：版本控制常驻下方面板，由左侧工具条下方的 Git 图标打开；
 * 面板自带 IDEA 风格头部（Git + Local Changes、Shelf、Log 三个常驻页签），因此对外壳隐藏默认标题栏。
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
  // 面板同时展示列表与差异/文件树，默认高度需要放得下两列内容
  preferredPanelHeight: 520,
  // Git 自己渲染页签头部，外壳不再额外画标题栏
  hideHeader: true,
}

export default gitFeature
