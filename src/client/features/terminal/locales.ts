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
    // 终端尚未接入时的占位说明
    empty: '终端将在 P4 阶段接入：会话工作目录下的多实例 shell。',
  },
  en: {
    title: 'Terminal',
    empty: 'Terminals arrive in P4: multiple shells in the session working directory.',
  },
}
