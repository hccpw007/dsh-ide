/**
 * 项目树 feature 定义。
 *
 * 槽位为 toolWindow：注册后左侧工具条出现「项目」入口，展开后渲染会话工作区的
 * 只读文件树。目录数据走宿主的 workspaceFiles Remote，不注册插件自己的路由。
 */
import type { IdeFeature } from '../../shell/contract'

import { projectTreeIcon } from './icons'
import { locales } from './locales'
import { ProjectTree } from './ProjectTree'

/** 项目树 feature。 */
const projectTreeFeature: IdeFeature = {
  id: 'projectTree',
  slot: 'toolWindow',
  order: 10,
  icon: projectTreeIcon,
  locales,
  view: ProjectTree,
}

export default projectTreeFeature
