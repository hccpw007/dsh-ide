/**
 * 自绘的项目树文件图标。
 *
 * IDEA 的平台图标集只有纯文本与未知文件图标，没有 Office 文档（xlsx/docx/pptx/pdf）
 * 和通用的「文件」纸张图标，这几类按 IDEA 的 16px 网格与同一套 `--ide-ic-*` 变量
 * 自绘，因此同样随明暗主题切换配色。
 */
export const CUSTOM_FILE_ICON_SVG: Readonly<Record<string, string>> = {
  /**
   * 通用文件：折角纸张轮廓。
   * 未知类型统一用它，避免回退成文本文件的横线图标。
   */
  file: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M4 1.5h5l3.5 3.5v9.5c0 .55-.45 1-1 1H4c-.55 0-1-.45-1-1V2.5c0-.55.45-1 1-1Z" fill="var(--ide-ic-gray-bg)" stroke="var(--ide-ic-gray)" stroke-linejoin="round"/>
  <path d="M9 1.5V5h3.5" stroke="var(--ide-ic-gray)" stroke-linejoin="round"/>
</svg>`,
  /** Excel 表格：绿色纸张 + 白色网格。 */
  excel: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M4 1.5h5l3.5 3.5v9.5c0 .55-.45 1-1 1H4c-.55 0-1-.45-1-1V2.5c0-.55.45-1 1-1Z" fill="var(--ide-ic-green)"/>
  <path d="M9 1.5 12.5 5H9V1.5Z" fill="var(--ide-ic-green-bg)"/>
  <rect x="5.3" y="7.3" width="5.4" height="4.6" rx=".3" stroke="var(--ide-ic-white)" stroke-width=".9"/>
  <path d="M5.3 9.6h5.4M8 7.3v4.6" stroke="var(--ide-ic-white)" stroke-width=".9"/>
</svg>`,
  /** Word 文档：蓝色纸张 + 白色 W。 */
  word: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M4 1.5h5l3.5 3.5v9.5c0 .55-.45 1-1 1H4c-.55 0-1-.45-1-1V2.5c0-.55.45-1 1-1Z" fill="var(--ide-ic-blue)"/>
  <path d="M9 1.5 12.5 5H9V1.5Z" fill="var(--ide-ic-blue-bg)"/>
  <path d="M5.2 7.6l1.1 3.5 1-2.4 1 2.4 1.1-3.5" stroke="var(--ide-ic-white)" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,
  /** PowerPoint 演示：橙色纸张 + 白色柱状图。 */
  powerpoint: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M4 1.5h5l3.5 3.5v9.5c0 .55-.45 1-1 1H4c-.55 0-1-.45-1-1V2.5c0-.55.45-1 1-1Z" fill="var(--ide-ic-orange)"/>
  <path d="M9 1.5 12.5 5H9V1.5Z" fill="var(--ide-ic-orange-bg)"/>
  <rect x="5.2" y="9.4" width="1.3" height="2.6" rx=".3" fill="var(--ide-ic-white)"/>
  <rect x="7.35" y="7.4" width="1.3" height="4.6" rx=".3" fill="var(--ide-ic-white)"/>
  <rect x="9.5" y="8.6" width="1.3" height="3.4" rx=".3" fill="var(--ide-ic-white)"/>
</svg>`,
  /** PDF 文档：红色纸张 + 白色文字行。 */
  pdf: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M4 1.5h5l3.5 3.5v9.5c0 .55-.45 1-1 1H4c-.55 0-1-.45-1-1V2.5c0-.55.45-1 1-1Z" fill="var(--ide-ic-red)"/>
  <path d="M9 1.5 12.5 5H9V1.5Z" fill="var(--ide-ic-red-bg)"/>
  <path d="M5.2 7.6h5.6M5.2 9.7h5.6M5.2 11.8h3.4" stroke="var(--ide-ic-white)" stroke-width="1" stroke-linecap="round"/>
</svg>`,
}
