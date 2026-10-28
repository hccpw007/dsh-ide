/**
 * 分支面板的中英文案。
 *
 * key 不带 feature 前缀，外壳注册时统一加 `branches.`。
 */
import type { LocaleDictionaries } from '../../../common/locale'

export const locales: LocaleDictionaries = {
  zh: {
    // 工具条按钮与工具窗口标题
    title: '分支',
    // 未绑定工作区
    noSession: '当前会话还没有工作目录',
    // 刷新按钮
    refresh: '刷新',
    // 本地分支分组
    groupLocal: '本地',
    // 远程分支分组
    groupRemote: '远程',
    // 标签分组
    groupTags: '标签',
    // 新建分支按钮
    newBranch: '新建分支',
    // 新建标签按钮
    newTag: '新建标签',
    // 从远程分支签出本地分支
    checkoutAsLocal: '签出',
    // 删除按钮
    delete: '删除',
    // 当前分支标记
    current: '当前',
    // 通用操作失败
    actionFailed: '操作失败',
    // 新建分支对话框
    promptCreateBranch: '新分支名（从当前提交切出）',
    // 重命名分支对话框
    promptRenameBranch: '重命名为',
    // 新建标签对话框
    promptCreateTag: '新标签名',
    // 取消
    cancel: '取消',
    // 确认
    confirm: '确定',
    // 右键菜单：签出
    'menu.checkout': '签出',
    // 右键菜单：重命名
    'menu.rename': '重命名',
    // 右键菜单：合并到当前
    'menu.merge': '合并到当前分支',
    // 右键菜单：变基当前到此
    'menu.rebase': '把当前分支变基到此',
    // 右键菜单：获取
    'menu.fetch': '获取',
    // 右键菜单：拉取
    'menu.pull': '拉取',
    // 右键菜单：推送
    'menu.push': '推送',
    // 右键菜单：删除
    'menu.delete': '删除分支',
  },
  en: {
    title: 'Branches',
    noSession: 'This session has no working directory yet',
    refresh: 'Refresh',
    groupLocal: 'Local',
    groupRemote: 'Remote',
    groupTags: 'Tags',
    newBranch: 'New branch',
    newTag: 'New tag',
    checkoutAsLocal: 'Checkout',
    delete: 'Delete',
    current: 'current',
    actionFailed: 'Action failed',
    promptCreateBranch: 'New branch name (from current commit)',
    promptRenameBranch: 'Rename to',
    promptCreateTag: 'New tag name',
    cancel: 'Cancel',
    confirm: 'OK',
    'menu.checkout': 'Checkout',
    'menu.rename': 'Rename',
    'menu.merge': 'Merge into current',
    'menu.rebase': 'Rebase current onto this',
    'menu.fetch': 'Fetch',
    'menu.pull': 'Pull',
    'menu.push': 'Push',
    'menu.delete': 'Delete branch',
  },
}
