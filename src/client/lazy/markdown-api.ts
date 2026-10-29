/**
 * Markdown 渲染 chunk 的接口声明。
 *
 * 主 bundle 不打包 marked，只依赖这个类型；真实实现在 `markdown-kernel.ts`，
 * 由 loader 在第一次需要预览时下载。
 */

/** Markdown 渲染器。 */
export interface MarkdownRenderer {
  /**
   * 把 Markdown 渲染成可直接插入 DOM 的 HTML。
   * @param text Markdown 原文
   * @returns HTML 字符串；原始 HTML 已被转义，不会执行文档里的脚本
   */
  render(text: string): string
}

/** chunk 的默认导出形态。 */
export interface MarkdownKernelModule {
  /** 创建渲染器实例。 */
  create(): MarkdownRenderer
}
