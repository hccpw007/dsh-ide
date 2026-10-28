/**
 * 编辑器 feature 定义。
 *
 * 槽位为 editorTab：编辑器区按地址认领 `file:` 前缀，交给 `FileEditor` 渲染。
 * 这里不注册视图，因为编辑器区的内容由外壳的标签页管理，feature 只提供「怎么画」。
 */
import type { IdeFeature } from '../../shell/contract'

import { FileEditor } from './FileEditor'
import { locales } from './locales'

/** 编辑器 feature。 */
const editorFeature: IdeFeature = {
  id: 'editor',
  slot: 'editorTab',
  order: 10,
  locales,
  editor: {
    // 外壳用 `file:<相对路径>` 作为文件标签的地址
    canOpen: (address) => address.startsWith('file:'),
    render: FileEditor,
  },
}

export default editorFeature
