/**
 * 终端面板的中英文案。
 *
 * key 不带 feature 前缀，外壳注册时统一加 `terminal.`。
 */
import type { LocaleDictionaries } from '../../../common/locale'

export const locales: LocaleDictionaries = {
  zh: {
    // 左侧列下方按钮与底部面板标题的名称
    title: '终端',
    // 没有终端时的引导文案
    empty: '还没有终端。',
    // 新建终端按钮
    newTerminal: '新建终端',
    // 关闭终端按钮的悬停提示
    closeTerminal: '关闭终端',
    // 终端进程已退出
    exited: '已结束',
    // 超过宿主上限的提示
    limitReached: '终端数量已达上限',
    // 创建失败
    createFailed: '终端创建失败',
    // 关闭失败
    closeFailed: '终端关闭失败',
    // 重命名失败
    renameFailed: '终端重命名失败',
    // 重命名输入框提示
    renamePrompt: '终端名称',
    // 宿主未提供 terminal Remote
    unavailable: '宿主未提供终端服务，终端暂不可用',
    // 右键菜单：复制选中文本
    menuCopy: '复制',
    // 右键菜单：粘贴到终端
    menuPaste: '粘贴',
    // 右键菜单：全选终端内容
    menuSelectAll: '全选',
    // 右键菜单：清屏
    menuClear: '清屏',
    // 右键菜单：查找（暂未实现）
    menuFind: '查找…',
    // 右键菜单：重命名终端
    menuRename: '重命名',
    // 复制到剪贴板失败的提示
    copyFailed: '复制失败',
    // 从剪贴板读取失败的提示
    pasteFailed: '粘贴失败',
  },
  en: {
    title: 'Terminal',
    empty: 'No terminal yet.',
    newTerminal: 'New terminal',
    closeTerminal: 'Close terminal',
    exited: 'exited',
    limitReached: 'Terminal limit reached',
    createFailed: 'Failed to create terminal',
    closeFailed: 'Failed to close terminal',
    renameFailed: 'Failed to rename terminal',
    renamePrompt: 'Terminal title',
    unavailable: 'The host provides no terminal service',
    menuCopy: 'Copy',
    menuPaste: 'Paste',
    menuSelectAll: 'Select All',
    menuClear: 'Clear',
    menuFind: 'Find…',
    menuRename: 'Rename',
    copyFailed: 'Could not copy',
    pasteFailed: 'Could not paste',
  },
}
