/**
 * 冲突解决 feature 定义。
 *
 * 槽位为 editorTab：认领 `conflict:` 地址，即逐块三选一的简化视图（Git 面板冲突文件
 * 的 Resolve Conflicts 进入）。三栏合并窗口不占标签，由工作台以浮动窗口呈现。
 */
import type { IdeFeature } from '../../shell/contract'

import { ConflictViewer } from './ConflictViewer'
import { locales } from './locales'

/** 冲突解决 feature。 */
const conflictsFeature: IdeFeature = {
  id: 'conflicts',
  slot: 'editorTab',
  order: 40,
  locales,
  editor: {
    canOpen: (address) => address.startsWith('conflict:'),
    render: ConflictViewer,
  },
}

export default conflictsFeature
