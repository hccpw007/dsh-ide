/**
 * 问题面板的中英文案。
 *
 * key 不带 feature 前缀，外壳注册时统一加 `problems.`。
 */
import type { LocaleDictionaries } from '../../../common/locale'

export const locales: LocaleDictionaries = {
  zh: {
    // 左侧列下方按钮与底部面板标题的名称
    title: '问题',
    // 运行诊断按钮
    run: '运行诊断',
    // 诊断执行中
    running: '诊断中…',
    // 错误计数标签
    errors: '错误',
    // 警告计数标签
    warnings: '警告',
    // 未配置诊断命令时的引导
    notConfigured: '尚未配置诊断命令。在 IDE 设置里填写命令（例如 npx tsc --noEmit）后即可运行。',
    // 没有问题时
    empty: '没有发现问题',
  },
  en: {
    title: 'Problems',
    run: 'Run diagnostics',
    running: 'Running…',
    errors: 'Errors',
    warnings: 'Warnings',
    notConfigured: 'No diagnostics command configured. Set one in IDE settings (e.g. npx tsc --noEmit).',
    empty: 'No problems found',
  },
}
