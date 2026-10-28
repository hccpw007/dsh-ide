/**
 * 差异视图 feature 定义。
 *
 * 槽位为 editorTab：认领 `diff:` 前缀的标签，差异源由外壳随标签一起传入。
 */
import type { IdeFeature } from '../../shell/contract'

import { locales } from './locales'
import { DiffViewer } from './DiffViewer'

/** 差异视图 feature。 */
const diffFeature: IdeFeature = {
  id: 'diff',
  slot: 'editorTab',
  order: 20,
  locales,
  editor: {
    canOpen: (address) => address.startsWith('diff:'),
    // 差异源由外壳解析标签时一并带下来；缺失说明标签数据损坏，交给空态处理
    render: DiffViewer,
  },
}

export default diffFeature
