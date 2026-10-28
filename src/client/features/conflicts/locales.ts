/**
 * 冲突解决视图的中英文案。
 *
 * key 不带 feature 前缀，外壳注册时统一加 `conflicts.`。
 */
import type { LocaleDictionaries } from '../../../common/locale'

export const locales: LocaleDictionaries = {
  zh: {
    // 保存解决结果的按钮
    save: '保存',
    // 保存成功的提示
    saved: '冲突已解决并保存',
    // 文件里没有冲突标记
    noConflicts: '这个文件里没有冲突标记',
    // 冲突块序号前缀
    conflictBlock: '冲突块',
    // 接受当前分支内容
    acceptOurs: '当前',
    // 接受传入分支内容
    acceptTheirs: '传入',
    // 两侧都保留
    acceptBoth: '双方',
  },
  en: {
    save: 'Save',
    saved: 'Conflicts resolved and saved',
    noConflicts: 'This file has no conflict markers',
    conflictBlock: 'Conflict',
    acceptOurs: 'Ours',
    acceptTheirs: 'Theirs',
    acceptBoth: 'Both',
  },
}
