/**
 * 大纲面板的中英文案。
 *
 * key 不带 feature 前缀，外壳注册时统一加 `outline.`。
 */
import type { LocaleDictionaries } from '../../../common/locale'

export const locales: LocaleDictionaries = {
  zh: {
    // 工具条按钮与工具窗口标题
    title: '结构',
    // 编辑器里没有活动文件
    noFile: '在编辑器里打开一个文件后，这里会列出它的结构。',
    // 没有识别到符号
    empty: '没有识别到符号（当前只支持常见语言的轻量解析）',
  },
  en: {
    title: 'Structure',
    noFile: 'Open a file in the editor to see its structure.',
    empty: 'No symbols found (lightweight parsing for common languages only)',
  },
}
