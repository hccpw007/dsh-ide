/**
 * Git 历史面板的中英文案。
 *
 * key 不带 feature 前缀，外壳注册时统一加 `gitHistory.`。
 */
import type { LocaleDictionaries } from '../../../common/locale'

export const locales: LocaleDictionaries = {
  zh: {
    // 工具条按钮与工具窗口标题
    title: '提交历史',
    // 未绑定工作区
    noSession: '当前会话还没有工作目录',
    // 过滤框占位
    filterPlaceholder: '按分支或路径过滤（回车生效）',
    // 刷新按钮
    refresh: '刷新',
    // 没有提交时的空态
    empty: '没有可显示的提交（或当前目录不是 Git 仓库）',
    // 加载下一页
    loading: '加载中…',
    // 从详情返回列表
    backToHistory: '返回历史',
  },
  en: {
    title: 'History',
    noSession: 'This session has no working directory yet',
    filterPlaceholder: 'Filter by branch or path (Enter)',
    refresh: 'Refresh',
    empty: 'No commits to show (or this is not a Git repository)',
    loading: 'Loading…',
    backToHistory: 'Back',
  },
}
