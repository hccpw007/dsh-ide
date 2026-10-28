/**
 * 终端 feature 定义。
 *
 * 槽位为 bottomPanel：入口图标排在左侧工具条下方，点击后在工作台底部展开。
 */
import type { IdeFeature } from '../../shell/contract'

import { terminalIcon } from './icons'
import { locales } from './locales'
import { TerminalPanel } from './TerminalPanel'

/** 终端 feature。 */
const terminalFeature: IdeFeature = {
  id: 'terminal',
  slot: 'bottomPanel',
  order: 10,
  icon: terminalIcon,
  locales,
  view: TerminalPanel,
}

export default terminalFeature
