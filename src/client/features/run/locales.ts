/**
 * 运行配置面板的中英文案。
 *
 * key 不带 feature 前缀，外壳注册时统一加 `run.`。
 */
import type { LocaleDictionaries } from '../../../common/locale'

export const locales: LocaleDictionaries = {
  zh: {
    // 左侧列下方按钮与底部面板标题的名称
    title: '启动器',
    // 未绑定工作区
    noSession: '当前会话还没有工作目录',
    // 新建配置按钮
    newConfig: '新建配置',
    // 编辑配置对话框标题
    editConfig: '编辑运行配置',
    // 运行中实例数标签
    runningCount: '运行中',
    // 没有配置时的空态
    noConfigs: '还没有运行配置',
    // 运行实例分组标题
    instances: '实例',
    // 启动按钮
    start: '启动',
    // 已在该配置上运行
    alreadyRunning: '已在运行',
    // 编辑按钮
    edit: '编辑',
    // 删除按钮
    delete: '删除',
    // 没有输出
    noOutput: '（没有输出）',
    // 配置名占位
    namePlaceholder: '配置名称，如 dev',
    // 命令占位
    commandPlaceholder: '命令，如 pnpm dev',
    // 取消
    cancel: '取消',
    // 保存
    save: '保存',
  },
  en: {
    title: 'Run',
    noSession: 'This session has no working directory yet',
    newConfig: 'New configuration',
    editConfig: 'Edit run configuration',
    runningCount: 'Running',
    noConfigs: 'No run configuration yet',
    instances: 'Instances',
    start: 'Start',
    alreadyRunning: 'Already running',
    edit: 'Edit',
    delete: 'Delete',
    noOutput: '(no output)',
    namePlaceholder: 'Configuration name, e.g. dev',
    commandPlaceholder: 'Command, e.g. pnpm dev',
    cancel: 'Cancel',
    save: 'Save',
  },
}
