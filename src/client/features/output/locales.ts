/**
 * 输出面板的中英文案。
 *
 * key 不带 feature 前缀，外壳注册时统一加 `output.`。
 */
import type { LocaleDictionaries } from '../../../common/locale'

export const locales: LocaleDictionaries = {
  zh: {
    // 左侧列下方按钮与底部面板标题的名称
    title: '输出',
    // 没有选中运行实例时的说明
    empty: '在「启动器」里运行一个配置后，这里会显示它的输出。',
    // 右键菜单：复制全部输出
    menuCopyAll: '全部复制',
    // 右键菜单：选中全部输出
    menuSelectAll: '全选',
    // 右键菜单：清空当前显示（不影响进程输出缓冲）
    menuClear: '清空',
    // 右键菜单：查找（暂未实现）
    menuFind: '查找…',
    // 右键菜单：打开 IDE 设置
    menuSettings: '设置…',
    // 复制失败的提示
    menuCopyFailed: '复制失败',
  },
  en: {
    title: 'Output',
    empty: 'Run a configuration from the launcher to see its output here.',
    menuCopyAll: 'Copy All',
    menuSelectAll: 'Select All',
    menuClear: 'Clear',
    menuFind: 'Find…',
    menuSettings: 'Settings…',
    menuCopyFailed: 'Could not copy',
  },
}
