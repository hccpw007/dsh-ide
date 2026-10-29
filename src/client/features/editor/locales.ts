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
  },
}
