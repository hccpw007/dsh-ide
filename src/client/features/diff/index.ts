/**
 * 差异视图 feature 定义。
 *
 * 槽位为 editorTab：认领 `diff:` 前缀的标签，差异源由外壳随标签一起传入。
 * 正文复用 Git 面板的 DiffView，文案走 git 命名空间，因此本 feature 没有自己的文案。
 */
import type { IdeFeature } from '../../shell/contract'

import { DiffTab } from './DiffTab'

/** 差异视图 feature。 */
const diffFeature: IdeFeature = {
  id: 'diff',
  slot: 'editorTab',
  order: 20,
  locales: {},
  editor: {
    canOpen: (address) => address.startsWith('diff:'),
    // 差异源由外壳解析标签时一并带下来；缺失说明标签数据损坏，交给空态处理
    render: DiffTab,
  },
}

export default diffFeature
