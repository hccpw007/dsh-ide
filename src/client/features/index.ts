/**
 * 装配清单：所有已注册的 feature。
 *
 * 新增 toolWindow / bottomPanel 功能：
 *   1. 新建 src/client/features/<id>/，提供 index.ts（含 id / slot / locales / view）
 *   2. 在下面的数组里追加该文件夹的默认导出
 *   3. 运行 npm run build 并刷新页面，工具条上即出现对应入口
 *
 * 新增 editorTab 功能：提供 editor 字段（canOpen + render）。
 * 新增 statusBar 功能：提供 status 字段。
 *
 * 数组顺序不重要，最终顺序由每个 feature 的 order 决定；同 order 保持这里的前后次序。
 */
import type { IdeFeature } from '../shell/contract'

import bookmarksFeature from './bookmarks'
import branchesFeature from './branches'
import conflictsFeature from './conflicts'
import diffFeature from './diff'
import editorFeature from './editor'
import gitFeature from './git'
import gitHistoryFeature from './git-history'
import outlineFeature from './outline'
import outputFeature from './output'
import problemsFeature from './problems'
import projectTreeFeature from './project-tree'
import runFeature from './run'
import searchFeature from './search'
import settingsFeature from './settings'
import statusInfoFeature from './status-info'
import terminalFeature from './terminal'
import todoFeature from './todo'
import welcomeFeature from './welcome'

// 顺序即左侧工具条上的排列顺序：上方工具窗口，下方底部面板入口
export const featureList: IdeFeature[] = [
  projectTreeFeature,
  gitFeature,
  gitHistoryFeature,
  branchesFeature,
  outlineFeature,
  todoFeature,
  bookmarksFeature,
  terminalFeature,
  runFeature,
  outputFeature,
  problemsFeature,
  searchFeature,
  editorFeature,
  diffFeature,
  conflictsFeature,
  welcomeFeature,
  settingsFeature,
  statusInfoFeature,
]
