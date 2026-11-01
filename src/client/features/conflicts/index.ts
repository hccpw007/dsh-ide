/**
 * 冲突解决 feature 定义。
 *
 * 槽位为 editorTab：认领两种地址——`conflict:` 是逐块三选一的简化视图（Git 面板
 * 冲突文件的 Resolve Conflicts 进入），`merge:` 是三栏合并窗口（冲突列表窗的
 * Resolve Manually 进入）。两个视图共用本 feature 的语言包与三方内容取数。
 */
import type { IdeFeature } from '../../shell/contract'

import { ConflictsEditor } from './ConflictsEditor'
import { locales } from './locales'

/** 冲突解决 feature。 */
const conflictsFeature: IdeFeature = {
  id: 'conflicts',
  slot: 'editorTab',
  order: 40,
  locales,
  editor: {
    canOpen: (address) => address.startsWith('conflict:') || address.startsWith('merge:'),
    render: ConflictsEditor,
  },
}

export default conflictsFeature
