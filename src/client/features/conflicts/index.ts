/**
 * 冲突解决 feature 定义。
 *
 * 槽位为 editorTab：认领 `conflict:` 前缀的标签，从 Git 面板的冲突文件进入。
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
