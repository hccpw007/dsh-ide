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
    // 输出通道尚未接入时的占位说明
    empty: '输出将在后续阶段接入：构建、插件与诊断通道的增量日志。',
  },
  en: {
    title: 'Output',
    empty: 'Output arrives later: incremental logs from builds, plugins and diagnostics.',
  },
}
