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
  },
  en: {
    title: 'Output',
    empty: 'Run a configuration from the launcher to see its output here.',
  },
}
