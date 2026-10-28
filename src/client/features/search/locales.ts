/**
 * 搜索面板的中英文案。
 *
 * key 不带 feature 前缀，外壳注册时统一加 `search.`。
 */
import type { LocaleDictionaries } from '../../../common/locale'

export const locales: LocaleDictionaries = {
  zh: {
    // 左侧列下方按钮与底部面板标题的名称
    title: '搜索',
    // 查询框占位
    placeholder: '在工作区中搜索…（回车执行）',
    // 执行搜索按钮
    search: '搜索',
    // 搜索进行中
    searching: '搜索中…',
    // 正则匹配选项
    regex: '正则',
    // 区分大小写选项
    caseSensitive: '区分大小写',
    // 全词匹配选项
    wholeWord: '全词',
    // 排除 glob 输入框占位
    excludePlaceholder: '排除：*.lock, dist/**',
    // 未绑定工作区
    noSession: '当前会话还没有工作目录',
    // 无结果
    empty: '没有匹配',
    // 结果被上限截断
    truncated: '结果过多，仅显示前 2000 条，请收窄查询条件',
  },
  en: {
    title: 'Search',
    placeholder: 'Search in workspace… (Enter)',
    search: 'Search',
    searching: 'Searching…',
    regex: 'Regex',
    caseSensitive: 'Match case',
    wholeWord: 'Whole word',
    excludePlaceholder: 'Exclude: *.lock, dist/**',
    noSession: 'This session has no working directory yet',
    empty: 'No matches',
    truncated: 'Too many results, showing first 2000. Narrow the query.',
  },
}
