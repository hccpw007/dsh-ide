/**
 * IDE 设置页的中英文案。
 *
 * key 不带 feature 前缀，外壳注册时统一加 `settings.`。
 */
import type { LocaleDictionaries } from '../../../common/locale'

export const locales: LocaleDictionaries = {
  zh: {
    // 设置页标题
    title: 'IDE 设置',
    // 设置页说明
    subtitle: '修改立即生效，并保存在宿主数据目录的 settings.json 里。',
    // 分组标题：通用
    sectionGeneral: '通用',
    // 分组标题：编辑器
    sectionEditor: '编辑器',
    // 分组标题：差异与搜索
    sectionDiffSearch: '差异与搜索',
    // 分组标题：诊断与终端
    sectionTools: '诊断与终端',
    // 工作台配色
    theme: '配色',
    // 跟随宿主主题
    themeSystem: '跟随 DSH',
    // 强制浅色
    themeLight: '浅色',
    // 强制深色
    themeDark: '深色',
    // 编辑器字号
    fontSize: '编辑器字号',
    // 编辑器行距（相对字号的倍数）
    lineHeight: '行距（倍数）',
    // 制表宽度
    tabSize: '缩进宽度',
    // 自动保存开关
    autoSave: '自动保存',
    // 自动保存延迟
    autoSaveDelay: '自动保存延迟（毫秒）',
    // 差异上下文行数
    diffContext: '差异上下文行数',
    // 搜索排除 glob
    searchExclude: '搜索排除（逗号分隔）',
    // 诊断命令
    diagnoseCommand: '诊断命令',
    // 终端默认 shell
    terminalShell: '终端 shell 路径',
    // 右键菜单：撤销输入
    menuUndo: '撤销',
    // 右键菜单：重做输入
    menuRedo: '重做',
    // 右键菜单：剪切输入内容
    menuCut: '剪切',
    // 右键菜单：复制输入内容
    menuCopy: '复制',
    // 右键菜单：粘贴到输入框
    menuPaste: '粘贴',
    // 右键菜单：全选输入内容
    menuSelectAll: '全选',
  },
  en: {
    title: 'IDE Settings',
    subtitle: 'Changes apply immediately and persist to settings.json in the host data directory.',
    sectionGeneral: 'General',
    sectionEditor: 'Editor',
    sectionDiffSearch: 'Diff & Search',
    sectionTools: 'Diagnostics & Terminal',
    theme: 'Theme',
    themeSystem: 'Follow DSH',
    themeLight: 'Light',
    themeDark: 'Dark',
    fontSize: 'Editor font size',
    lineHeight: 'Line height (×)',
    tabSize: 'Indent width',
    autoSave: 'Auto save',
    autoSaveDelay: 'Auto save delay (ms)',
    diffContext: 'Diff context lines',
    searchExclude: 'Search excludes (comma separated)',
    diagnoseCommand: 'Diagnostics command',
    terminalShell: 'Terminal shell path',
    menuUndo: 'Undo',
    menuRedo: 'Redo',
    menuCut: 'Cut',
    menuCopy: 'Copy',
    menuPaste: 'Paste',
    menuSelectAll: 'Select All',
  },
}
