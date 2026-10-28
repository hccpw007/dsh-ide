/**
 * 欢迎页的中英文案。
 *
 * key 不带 feature 前缀，外壳注册时统一加 `welcome.`。
 */
import type { LocaleDictionaries } from '../../../common/locale'

export const locales: LocaleDictionaries = {
  zh: {
    // 欢迎页标题
    title: 'IDE 工作台',
    // 欢迎页说明
    subtitle: '浏览项目、打开文件（Cmd/Ctrl+S 保存）、查看差异与提交。',
    // 打开设置入口
    openSettings: 'IDE 设置',
    // 展开项目树入口
    openProject: '项目',
    // 最近文件分组标题
    recentFiles: '最近打开',
    // 没有最近文件
    noRecent: '还没有打开过文件',
  },
  en: {
    title: 'IDE Workbench',
    subtitle: 'Browse the project, open files (Cmd/Ctrl+S to save), review diffs and commits.',
    openSettings: 'IDE settings',
    openProject: 'Project',
    recentFiles: 'Recent',
    noRecent: 'No file opened yet',
  },
}
