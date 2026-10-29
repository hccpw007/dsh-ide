/**
 * Markdown 渲染内核：marked 的封装。
 *
 * 本文件属于懒加载 chunk，只有打开 Markdown 且切到预览/分栏时才下载。
 *
 * 预览插入的是 `dangerouslySetInnerHTML`，而文档内容可能来自 AI 生成或外部仓库，
 * 因此这里对原文中的三类危险内容做了收口：原始 HTML 一律转义成文本、链接只放行
 * http/https/mailto 与相对路径、图片同样限制协议。宁可少渲染，也不能让工作区里的
 * 一个 .md 文件把脚本带进会话页面。
 */
import { Marked, type Tokens } from 'marked'

import type { MarkdownRenderer } from './markdown-api'

/**
 * 转义 HTML 特殊字符。
 * @param text 原始文本
 * @returns 可直接拼进 HTML 的文本
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
}

/**
 * 判断链接协议是否安全。
 * @param href 链接地址
 * @returns 允许时为 true
 */
function safeHref(href: string | null | undefined): boolean {
  if (typeof href !== 'string' || href === '') return false

  // 相对路径与锚点放行；绝对地址只认三个协议
  if (!/^[a-z][a-z\d+.-]*:/iu.test(href)) return true

  return /^(?:https?|mailto):/iu.test(href)
}

/**
 * 创建渲染器。
 * @returns 带安全收口的 marked 实例
 */
function create(): MarkdownRenderer {
  const marked = new Marked({ gfm: true, breaks: false })

  marked.use({
    renderer: {
      // 原始 HTML 不直接输出，按纯文本展示
      html(token: Tokens.HTML | Tokens.Tag): string {
        return escapeHtml(token.text)
      },
      // 链接只保留安全协议，其余整段丢弃 href
      link(token: Tokens.Link): string {
        const label = this.parser.parseInline(token.tokens)

        if (!safeHref(token.href)) return label

        const title = token.title === null || token.title === undefined ? '' : ` title="${escapeHtml(token.title)}"`

        return `<a href="${escapeHtml(token.href)}"${title} rel="noreferrer noopener" target="_blank">${label}</a>`
      },
      // 图片同理；不安全的地址降级为纯文本
      image(token: Tokens.Image): string {
        if (!safeHref(token.href)) return escapeHtml(token.text)

        return `<img src="${escapeHtml(token.href)}" alt="${escapeHtml(token.text)}" />`
      },
    },
  })

  return {
    render(text: string): string {
      return marked.parse(text, { async: false })
    },
  }
}

/** chunk 的默认导出。 */
const module = { create }

export default module
