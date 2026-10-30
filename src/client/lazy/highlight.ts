/**
 * 差异视图的语法高亮取数。
 *
 * 高亮由编辑器内核 chunk 提供：语言装配与配色与编辑器正文共用同一份实现，差异
 * 面板因此不会出现「编辑器有颜色、比较视图没有」的割裂。这里统一加上限与降级：
 * 整篇解析在主线程同步完成，超大文本宁可只显示纯文本，也不能让面板卡住。
 */
import type { SyntaxLines } from '../../common/syntax-highlight'

import type { EditorKernelModule } from './editor-api'
import { loadLazyChunk } from './loader'

/** 参与高亮的文本长度上限（字符）；超出后放弃语法着色，差异正文仍完整显示。 */
const MAX_HIGHLIGHT_LENGTH = 512 * 1024

/**
 * 对一篇文本做整篇语法高亮。
 * @param path 文件路径，决定用哪种语言解析
 * @param text 文本
 * @returns 按行索引的语法片段；不支持、超限或失败时返回空数组
 */
export async function highlightLines(path: string, text: string): Promise<SyntaxLines> {
  if (path === '' || text === '' || text.length > MAX_HIGHLIGHT_LENGTH) return []

  try {
    const kernel = await loadLazyChunk<EditorKernelModule>('editor-kernel')

    return await kernel.highlight(path, text)
  } catch (error) { // 高亮失败只影响配色，不能影响差异内容本身
    console.error('[dsh-ide] 语法高亮失败，按纯文本显示:', path, error)

    return []
  }
}
