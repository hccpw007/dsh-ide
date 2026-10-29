/**
 * 编辑器 feature 的语言包。
 *
 * key 不带前缀，外壳注册时统一加 `editor.`。
 */
import type { LocaleDictionaries } from '../../../common/locale'

export const locales: LocaleDictionaries = {
  zh: {
    // 加载文件内容时的提示
    loading: '正在读取文件…',
    // 读取失败时的兜底文案
    loadFailed: '文件读取失败',
    // 未绑定会话工作区时的提示
    noWorkspace: '当前会话还没有工作目录',
    // 保存失败前缀
    saveFailed: '保存失败',
    // 超大文件的只读说明
    tooLarge: '文件过大，仅预览',
    // 保存冲突说明
    conflictHint: '文件已被外部修改，请选择保留哪一份内容。',
    // 冲突处理：用磁盘内容替换编辑器
    reloadFromDisk: '重新加载',
    // 冲突处理：用编辑器内容覆盖磁盘
    overwriteDisk: '覆盖磁盘',
    // 重新加载完成提示
    reloaded: '已重新加载磁盘内容',
    // Markdown 视图切换：只看源码
    viewSource: '源码',
    // Markdown 视图切换：左源码右预览
    viewSplit: '分栏',
    // Markdown 视图切换：只看预览
    viewPreview: '预览',
    // 右键菜单：撤销（编辑器自管撤销栈，暂未接入）
    menuUndo: '撤销',
    // 右键菜单：重做（编辑器自管撤销栈，暂未接入）
    menuRedo: '重做',
    // 右键菜单：剪切
    menuCut: '剪切',
    // 右键菜单：复制
    menuCopy: '复制',
    // 右键菜单：粘贴
    menuPaste: '粘贴',
    // 右键菜单：全选
    menuSelectAll: '全选',
    // 右键菜单：打开查找
    menuFind: '查找…',
    // 右键菜单：跳到指定行（暂未实现）
    menuGoToLine: '转到行…',
    // 右键菜单：保存
    menuSave: '保存',
    // 右键菜单：从磁盘重新加载
    menuReload: '从磁盘重新加载',
    // 右键菜单：复制文件路径
    menuCopyPath: '复制路径',
    // 右键菜单：重新格式化代码（暂未实现）
    menuReformat: '重新格式化代码',
    // 右键菜单：本地历史（暂未实现）
    menuLocalHistory: '本地历史',
    // 右键菜单：Git 子菜单（暂未实现）
    menuGit: 'Git',
    // 右键菜单：文件编码（暂未实现）
    menuEncoding: '文件编码',
    // 右键菜单：行分隔符（暂未实现）
    menuLineSeparators: '行分隔符',
    // 复制路径失败的提示
    menuCopyFailed: '复制路径失败',
  },
  en: {
    loading: 'Reading file…',
    loadFailed: 'Failed to read file',
    noWorkspace: 'This session has no working directory yet',
    saveFailed: 'Save failed',
    tooLarge: 'File too large, preview only',
    conflictHint: 'The file changed on disk. Choose which content to keep.',
    reloadFromDisk: 'Reload',
    overwriteDisk: 'Overwrite',
    reloaded: 'Reloaded from disk',
    viewSource: 'Source',
    viewSplit: 'Split',
    viewPreview: 'Preview',
    menuUndo: 'Undo',
    menuRedo: 'Redo',
    menuCut: 'Cut',
    menuCopy: 'Copy',
    menuPaste: 'Paste',
    menuSelectAll: 'Select All',
    menuFind: 'Find…',
    menuGoToLine: 'Go to Line…',
    menuSave: 'Save',
    menuReload: 'Reload from Disk',
    menuCopyPath: 'Copy Path/Reference…',
    menuReformat: 'Reformat Code',
    menuLocalHistory: 'Local History',
    menuGit: 'Git',
    menuEncoding: 'File Encoding',
    menuLineSeparators: 'Line Separators',
    menuCopyFailed: 'Could not copy the path',
  },
}
