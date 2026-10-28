/**
 * Git 面板的中英文案。
 *
 * key 不带 feature 前缀，外壳注册时统一加 `git.`。
 */
import type { LocaleDictionaries } from '../../../common/locale'

export const locales: LocaleDictionaries = {
  zh: {
    // 左侧列下方按钮与底部面板标题的名称
    title: 'Git',
    // 版本控制面板尚未接入时的占位说明
    empty: 'Git 面板将在 P5 阶段接入：状态、提交、分支与 diff。',
  },
  en: {
    title: 'Git',
    empty: 'Git arrives in P5: status, commits, branches and diffs.',
  },
}
