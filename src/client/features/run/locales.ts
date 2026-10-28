/**
 * 启动器面板的中英文案。
 *
 * key 不带 feature 前缀，外壳注册时统一加 `run.`。
 */
import type { LocaleDictionaries } from '../../../common/locale'

export const locales: LocaleDictionaries = {
  zh: {
    // 左侧列下方按钮与底部面板标题的名称
    title: '启动器',
    // 运行配置尚未接入时的占位说明
    empty: '启动器将在 P6 阶段接入：运行配置、启动与停止、进程输出。',
  },
  en: {
    title: 'Run',
    empty: 'Run configurations arrive in P6: start, stop and stream process output.',
  },
}
