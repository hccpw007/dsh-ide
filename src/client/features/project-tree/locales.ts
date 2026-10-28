/**
 * 项目树的中英文案。
 *
 * key 不带 feature 前缀，外壳注册时统一加 `projectTree.`。
 */
import type { LocaleDictionaries } from '../../../common/locale'

export const locales: LocaleDictionaries = {
  zh: {
    // 左侧工具窗口与工具条按钮名称
    title: '项目',
    // 目录正在请求子项时的占位文案
    loading: '加载中…',
    // 空目录的提示
    empty: '空目录',
    // 目录读取失败后的提示
    loadFailed: '目录读取失败',
    // 失败提示旁的按钮：重新请求当前目录
    retry: '重试',
    // 工具栏按钮：重新加载整棵树
    refresh: '刷新',
    // 工具栏按钮：收起所有已展开目录
    collapseAll: '全部折叠',
    // 工具栏按钮：切换隐藏文件（dotfiles）的显示
    toggleHidden: '显示隐藏文件',
    // 目录子项超过宿主上限时的截断提示
    truncated: '仅显示前 2000 项',
    // 承载面没有绑定会话时的提示
    noSession: '未绑定会话',
    // 宿主未提供 workspaceFiles 服务时的降级提示
    unavailable: '文件树不可用',
  },
  en: {
    title: 'Project',
    loading: 'Loading…',
    empty: 'Empty directory',
    loadFailed: 'Failed to read directory',
    retry: 'Retry',
    refresh: 'Refresh',
    collapseAll: 'Collapse all',
    toggleHidden: 'Show hidden files',
    truncated: 'Showing first 2000 entries',
    noSession: 'No session bound',
    unavailable: 'File tree unavailable',
  },
}
