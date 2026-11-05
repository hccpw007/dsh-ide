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
 * 高亮结果缓存的上限。
 *
 * 同一文件在差异视图里被反复打开、切换两侧都会走这里；整篇解析要 100 ms–1 s，
 * 每次重算纯属浪费。按「路径 + 长度 + 内容指纹」缓存最近几份，条目数很小，
 * 内存上界可控（每份最多 512 KB 原文对应的高亮片段）。
 */
const MAX_HIGHLIGHT_CACHE = 4

/** 高亮结果缓存：键是路径与内容指纹，值是按行索引的片段。 */
const highlightCache = new Map<string, SyntaxLines>()

/**
 * 计算内容的快速指纹。
 *
 * 整篇解析远比这段扫描贵，因此用 O(n) 的 FNV-1a 换掉重复的解析是净收益。
 * @param text 文本
 * @returns 32 位无符号指纹
 */
function fingerprintOf(text: string): number {
  let hash = 0x811c9dc5

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }

  return hash >>> 0
}

/**
 * 判断一篇文本是否会因为超限而放弃语法高亮。
 *
 * 差异视图据此给用户一句「文件过大，已按纯文本显示」，而不是让颜色无声消失。
 * @param text 文本
 * @returns 超限时返回 true
 */
export function highlightSuppressed(text: string): boolean {
  return text.length > MAX_HIGHLIGHT_LENGTH
}

/**
 * 对一篇文本做整篇语法高亮。
 * @param path 文件路径，决定用哪种语言解析
 * @param text 文本
 * @returns 按行索引的语法片段；不支持、超限或失败时返回空数组
 */
export async function highlightLines(path: string, text: string): Promise<SyntaxLines> {
  if (path === '' || text === '' || highlightSuppressed(text)) return []

  // 指纹之外再带首尾片段：32 位哈希理论上可能碰撞，碰撞会显示另一份文件的高亮
  const key = `${path}#${String(text.length)}#${String(fingerprintOf(text))}#${text.slice(0, 24)}#${text.slice(-24)}`
  const cached = highlightCache.get(key)

  if (cached !== undefined) return cached

  try {
    const kernel = await loadLazyChunk<EditorKernelModule>('editor-kernel')
    const lines = await kernel.highlight(path, text)

    highlightCache.set(key, lines)

    // 超出上限时淘汰最旧的一份（Map 按插入序迭代）
    if (highlightCache.size > MAX_HIGHLIGHT_CACHE) {
      const oldest = highlightCache.keys().next().value

      if (oldest !== undefined) highlightCache.delete(oldest)
    }

    return lines
  } catch (error) { // 高亮失败只影响配色，不能影响差异内容本身
    console.error('[dsh-ide] 语法高亮失败，按纯文本显示:', path, error)

    return []
  }
}
