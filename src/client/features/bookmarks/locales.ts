/**
 * 书签面板的中英文案。
 *
 * key 不带 feature 前缀，外壳注册时统一加 `bookmarks.`。
 */
import type { LocaleDictionaries } from '../../../common/locale'

export const locales: LocaleDictionaries = {
  zh: {
    // 工具条按钮与工具窗口标题
    title: '书签',
    // 在活动文件当前行切换书签
    toggle: '切换书签',
    // 行号输入框的悬停提示
    lineLabel: '书签行号',
    // 没有活动文件
    noFile: '先在编辑器里打开一个文件',
    // 没有书签
    empty: '还没有书签',
    // 右键菜单：在当前行切换书签
    menuToggle: '切换书签',
    // 右键菜单：移除全部书签
    menuRemoveAll: '移除全部书签',
    // 右键菜单：打开 IDE 设置
    menuSettings: '设置…',
  },
  en: {
    title: 'Bookmarks',
    toggle: 'Toggle',
    lineLabel: 'Bookmark line',
    noFile: 'Open a file in the editor first',
    empty: 'No bookmarks yet',
    menuToggle: 'Toggle Bookmark',
    menuRemoveAll: 'Remove All Bookmarks',
    menuSettings: 'Settings…',
  },
}
