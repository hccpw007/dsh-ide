/**
 * 项目树的中英文案。
 *
 * key 不带 feature 前缀，外壳注册时统一加 `projectTree.`。
 */
import type { LocaleDictionaries } from '../../../common/locale'

export const locales: LocaleDictionaries = {
  zh: {
    // 左侧工具窗口与工具条按钮名称
    title: '项目',
    // 目录正在请求子项时的占位文案
    loading: '加载中…',
    // 空目录的提示
    empty: '空目录',
    // 目录读取失败后的提示
    loadFailed: '目录读取失败',
    // 失败提示旁的按钮：重新请求当前目录
    retry: '重试',
    // 工具栏按钮：重新加载整棵树
    refresh: '刷新',
    // 工具栏按钮：收起所有已展开目录
    collapseAll: '全部折叠',
    // 工具栏按钮：切换隐藏文件（dotfiles）的显示
    toggleHidden: '显示隐藏文件',
    // 目录子项超过宿主上限时的截断提示
    truncated: '仅显示前 2000 项',
    // 承载面没有绑定会话时的提示
    noSession: '未绑定会话',
    // 宿主未提供 workspaceFiles 服务时的降级提示
    unavailable: '文件树不可用',
    // 右键菜单：把文件路径发送到 CC GUI 的扩展入口
    'menu.sendPath': '发送文件路径到 CC GUI',
    // 右键菜单：新建文件或目录的子菜单
    'menu.new': '新建',
    // 右键菜单：剪切
    'menu.cut': '剪切',
    // 右键菜单：复制
    'menu.copy': '复制',
    // 右键菜单：复制相对路径或引用串（当前可用）
    'menu.copyPath': '复制路径/引用…',
    // 右键菜单：粘贴
    'menu.paste': '粘贴',
    // 右键菜单：查找用法
    'menu.findUsages': '查找用法',
    // 右键菜单：代码分析子菜单
    'menu.analyze': '分析',
    // 右键菜单：重命名
    'menu.rename': '重命名…',
    // 右键菜单：重构子菜单
    'menu.refactor': '重构',
    // 右键菜单：书签子菜单
    'menu.bookmarks': '书签',
    // 右键菜单：重新格式化代码
    'menu.reformatCode': '重新格式化代码',
    // 右键菜单：优化导入
    'menu.optimizeImports': '优化导入',
    // 右键菜单：删除
    'menu.delete': '删除…',
    // 右键菜单：覆盖文件类型关联
    'menu.overrideFileType': '覆盖文件类型',
    // 右键菜单：在右侧分屏打开
    'menu.openInRightSplit': '在右侧分屏打开',
    // 右键菜单：用其它程序打开子菜单
    'menu.openIn': '打开于',
    // 右键菜单：本地历史子菜单
    'menu.localHistory': '本地历史',
    // 右键菜单：Git 操作子菜单
    'menu.git': 'Git',
    // 右键菜单：重建该文件的 IDE 索引
    'menu.repairIde': '修复此文件的 IDE 索引',
    // 右键菜单：从磁盘重新加载（当前可用）
    'menu.reloadFromDisk': '从磁盘重新加载',
    // 右键菜单：与另一个文件比较
    'menu.compareWith': '与…比较',
    // 右键菜单：标记文件类型子菜单
    'menu.markFileAs': '将文件标记为',
    // 右键菜单：结构图子菜单
    'menu.diagrams': '图表',
    // 右键菜单：加入 .gitignore 或取消忽略
    'menu.addToGitignore': '添加到 .gitignore（取消忽略）',
    // 右键菜单：创建 Gist
    'menu.createGist': '创建 Gist…',
  },
  en: {
    title: 'Project',
    loading: 'Loading…',
    empty: 'Empty directory',
    loadFailed: 'Failed to read directory',
    retry: 'Retry',
    refresh: 'Refresh',
    collapseAll: 'Collapse all',
    toggleHidden: 'Show hidden files',
    truncated: 'Showing first 2000 entries',
    noSession: 'No session bound',
    unavailable: 'File tree unavailable',
    'menu.sendPath': 'Send File Path to CC GUI',
    'menu.new': 'New',
    'menu.cut': 'Cut',
    'menu.copy': 'Copy',
    'menu.copyPath': 'Copy Path/Reference…',
    'menu.paste': 'Paste',
    'menu.findUsages': 'Find Usages',
    'menu.analyze': 'Analyze',
    'menu.rename': 'Rename…',
    'menu.refactor': 'Refactor',
    'menu.bookmarks': 'Bookmarks',
    'menu.reformatCode': 'Reformat Code',
    'menu.optimizeImports': 'Optimize Imports',
    'menu.delete': 'Delete…',
    'menu.overrideFileType': 'Override File Type',
    'menu.openInRightSplit': 'Open in Right Split',
    'menu.openIn': 'Open In',
    'menu.localHistory': 'Local History',
    'menu.git': 'Git',
    'menu.repairIde': 'Repair IDE on File',
    'menu.reloadFromDisk': 'Reload from Disk',
    'menu.compareWith': 'Compare With…',
    'menu.markFileAs': 'Mark File As',
    'menu.diagrams': 'Diagrams',
    'menu.addToGitignore': 'Add to .gitignore file (unignore)',
    'menu.createGist': 'Create Gist…',
  },
}
