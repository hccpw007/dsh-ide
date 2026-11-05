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
    placeholder: '在文件名与文件内容中搜索…（回车执行）',
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
    // 结果分段：文件名命中
    sectionFiles: '文件名',
    // 结果分段：文件内容命中
    sectionText: '内容',
    // 文件名命中数量超限的提示
    filesTruncated: '文件名结果过多，仅显示前 200 个，请收窄查询条件',
    // 未绑定工作区
    noSession: '当前会话还没有工作目录',
    // 无结果
    empty: '没有匹配',
    // 结果被上限截断
    truncated: '结果过多，仅显示前 2000 条，请收窄查询条件',
    // 右键菜单：重新执行搜索
    menuRerun: '重新搜索',
    // 右键菜单：清空结果列表
    menuClearResults: '清空结果',
    // 右键菜单：复制查询词
    menuCopyQuery: '复制查询词',
    // 右键菜单：打开 IDE 设置
    menuSettings: '设置…',
    // 复制查询词失败的提示
    menuCopyFailed: '复制失败',
    // 正则被安全校验拒绝：写法可能指数级回溯
    regexUnsafe: '这个正则可能指数级回溯并卡住宿主，请改写成不重叠的写法',
    // 正则过长
    regexTooLong: '正则过长，请精简后再试',
    // 正则语法错误
    regexInvalid: '正则语法有误',
  },
  en: {
    title: 'Search',
    placeholder: 'Search file names and contents… (Enter)',
    search: 'Search',
    searching: 'Searching…',
    regex: 'Regex',
    caseSensitive: 'Match case',
    wholeWord: 'Whole word',
    excludePlaceholder: 'Exclude: *.lock, dist/**',
    // 结果分段：文件名命中（对应 zh 的 sectionFiles）
    sectionFiles: 'File names',
    // 结果分段：文件内容命中（对应 zh 的 sectionText）
    sectionText: 'Contents',
    // 文件名命中数量超限的提示（对应 zh 的 filesTruncated）
    filesTruncated: 'Too many file matches, showing first 200. Narrow the query.',
    noSession: 'This session has no working directory yet',
    empty: 'No matches',
    truncated: 'Too many results, showing first 2000. Narrow the query.',
    menuRerun: 'Rerun Search',
    menuClearResults: 'Clear Results',
    menuCopyQuery: 'Copy Query',
    menuSettings: 'Settings…',
    // 正则被安全校验拒绝：写法可能指数级回溯（对应 zh 的 regexUnsafe）
    regexUnsafe: 'This pattern can backtrack exponentially and freeze the host; rewrite it without overlapping alternatives',
    // 正则过长（对应 zh 的 regexTooLong）
    regexTooLong: 'The pattern is too long; shorten it and try again',
    // 正则语法错误（对应 zh 的 regexInvalid）
    regexInvalid: 'The pattern has a syntax error',
    menuCopyFailed: 'Could not copy',
  },
}
