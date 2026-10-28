/**
 * 装配清单：所有已注册的 feature。
 *
 * 新增 toolWindow / bottomPanel 功能：
 *   1. 新建 src/client/features/<id>/，提供 index.ts（含 id / slot / locales / view）
 *   2. 在下面的数组里追加该文件夹的默认导出
 *   3. 运行 npm run build 并刷新页面，工具条上即出现对应入口
 *
 * 新增 editorTab 功能：提供 editor 字段（canOpen + render）。
 * 新增 service 功能：提供 host 字段，并在 src/host/features.ts 里登记同一模块。
 */
import type { IdeFeature } from '../shell/contract'

import gitFeature from './git'
import outputFeature from './output'
import projectTreeFeature from './project-tree'
import runFeature from './run'
import terminalFeature from './terminal'

// 顺序即左侧工具条上的排列顺序：上方工具窗口，下方底部面板入口
export const featureList: IdeFeature[] = [
  projectTreeFeature,
  terminalFeature,
  runFeature,
  outputFeature,
  gitFeature,
]
