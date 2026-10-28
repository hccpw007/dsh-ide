/**
 * 状态栏条目的中英文案。
 *
 * key 不带 feature 前缀，外壳注册时统一加 `statusInfo.`。
 */
import type { LocaleDictionaries } from '../../../common/locale'

export const locales: LocaleDictionaries = {
  zh: {
    // 光标位置条目：行与列
    cursor: '行',
    // 运行中实例计数
    running: '运行中',
    // 问题计数
    problems: '问题',
  },
  en: {
    cursor: 'Ln',
    running: 'Running',
    problems: 'Problems',
  },
}
