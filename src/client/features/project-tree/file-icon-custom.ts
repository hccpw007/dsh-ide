/**
 * 自绘的项目树文件图标。
 *
 * 两类图标在这里：IDEA 平台图标集里没有的 Office 文档（xlsx/docx/pptx/pdf）与通用
 * 「文件」纸张图标；IDEA 不内置支持、官方因此没有图标的语言与工程文件（R、Lua、
 * Dart、Svelte、Makefile、LICENSE）。都按 IDEA 的 16px 网格与同一套 `--ide-ic-*`
 * 变量自绘，因此同样随明暗主题切换配色。
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
  /**
   * R 语言：蓝色描边方块 + R 字形。
   * IDEA 不内置 R 支持，官方没有对应图标，按 IDEA 的字母方块套路自绘。
   */
  r: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" fill="var(--ide-ic-blue-bg)" stroke="var(--ide-ic-blue)"/>
  <path d="M5.9 11.5V4.5h2.3a2 2 0 0 1 0 4H5.9M8.2 8.5 10.5 11.5" stroke="var(--ide-ic-blue)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,
  /** Lua：紫色描边方块 + L 字形与右上角的卫星点（Lua 官方标志里的月亮）。 */
  lua: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" fill="var(--ide-ic-purple-bg)" stroke="var(--ide-ic-purple)"/>
  <path d="M6.1 4.8v6.4h3.6" stroke="var(--ide-ic-purple)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="10.3" cy="5.5" r="0.9" fill="var(--ide-ic-purple)"/>
</svg>`,
  /** Dart：实心蓝方块 + 白色 D 字形。 */
  dart: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="2" width="12" height="12" rx="2" fill="var(--ide-ic-blue)"/>
  <path d="M5.7 4.9v6.2h1.6a3.1 3.1 0 0 0 0-6.2H5.7Z" fill="var(--ide-ic-white)"/>
</svg>`,
  /** Svelte：实心橙方块 + 白色 S 曲线。 */
  svelte: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="2" width="12" height="12" rx="2" fill="var(--ide-ic-orange)"/>
  <path d="M10.4 5.6c-.4-.7-1.2-1.1-2.1-1.1-1.2 0-2.2.8-2.2 1.8 0 1.1 1 1.5 2.1 1.8 1.2.3 2.2.7 2.2 1.9 0 1-1 1.8-2.2 1.8-1 0-1.9-.4-2.3-1.2" stroke="var(--ide-ic-white)" stroke-width="1.2" stroke-linecap="round"/>
</svg>`,
  /** Makefile：灰色描边方块 + M 折线，IDEA 不内置 Makefile 支持。 */
  makefile: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" fill="var(--ide-ic-gray-bg)" stroke="var(--ide-ic-gray)"/>
  <path d="M5.2 11.3V5l2.8 3.7L10.8 5v6.3" stroke="var(--ide-ic-gray)" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,
  /** LICENSE / COPYING：灰纸张 + 版权符号。 */
  license: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M4 1.5h5l3.5 3.5v9.5c0 .55-.45 1-1 1H4c-.55 0-1-.45-1-1V2.5c0-.55.45-1 1-1Z" fill="var(--ide-ic-gray-bg)" stroke="var(--ide-ic-gray)" stroke-linejoin="round"/>
  <path d="M9 1.5V5h3.5" stroke="var(--ide-ic-gray)" stroke-linejoin="round"/>
  <circle cx="8" cy="10.2" r="2.6" stroke="var(--ide-ic-gray)"/>
  <path d="M9.2 9.4a1.4 1.4 0 1 0 0 1.6" stroke="var(--ide-ic-gray)" stroke-width=".9" stroke-linecap="round"/>
</svg>`,
}
