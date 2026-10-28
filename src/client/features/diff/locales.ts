/**
 * 差异视图的语言包。
 *
 * key 不带前缀，外壳注册时统一加 `diff.`。
 */
import type { LocaleDictionaries } from '../../../common/locale'

export const locales: LocaleDictionaries = {
  zh: {
    // 两段文本完全一致时的提示
    identical: '两段内容没有差异',
    // 折叠段的展开按钮，后接行数
    expandLines: '展开',
    // 全部恢复折叠
    collapseAll: '收起相同行',
    // 切到并排模式的按钮
    showSideBySide: '并排',
    // 切到行内模式的按钮
    showInline: '行内',
    // 忽略空白选项
    ignoreWhitespace: '忽略空白',
    // 忽略大小写选项
    ignoreCase: '忽略大小写',
    // 复制带文件与行号的引用
    copyReference: '复制引用',
    // 重新读取差异
    refresh: '刷新',
    // 读取中
    loading: '正在读取差异…',
    // 读取失败兜底
    loadFailed: '差异读取失败',
    // 超过大小上限的说明，后接实际大小
    tooLarge: '文件过大，无法显示差异：',
    // 复制成功
    copied: '已复制',
    // 复制失败
    copyFailed: '复制失败',
  },
  en: {
    identical: 'No differences',
    expandLines: 'Expand',
    collapseAll: 'Collapse unchanged',
    showSideBySide: 'Side by side',
    showInline: 'Inline',
    ignoreWhitespace: 'Ignore whitespace',
    ignoreCase: 'Ignore case',
    copyReference: 'Copy reference',
    refresh: 'Refresh',
    loading: 'Reading diff…',
    loadFailed: 'Failed to read diff',
    tooLarge: 'File too large to diff: ',
    copied: 'Copied',
    copyFailed: 'Copy failed',
  },
}
