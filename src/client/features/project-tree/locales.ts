/**
 * 项目树的中英文案。
 *
 * key 不带 feature 前缀，外壳注册时统一加 `projectTree.`。
 */
import type { LocaleDictionaries } from '../../../common/locale'

export const locales: LocaleDictionaries = {
  zh: {
    // 左侧工具条按钮与工具窗口标题的名称
    title: '项目',
    // 视图下拉：带项目根节点的完整目录树
    viewProject: 'Project',
    // 视图下拉：直接列出工作区内容（改造前的显示方式）
    viewPackages: 'Packages',
    // 视图下拉：只显示 Git 变更文件
    viewChanged: 'All Changed Files',
    // All Changed Files 视图没有变更文件时的提示
    noChanges: '没有变更的文件',
    // 目录加载中的状态行
    loading: '加载中…',
    // 空目录的状态行
    empty: '空目录',
    // 目录读取失败的状态行
    loadFailed: '读取失败',
    // 失败行的重试按钮
    retry: '重试',
    // 条目数超过上限时的提示
    truncated: '条目过多，仅显示前 2000 项',
    // 隐藏文件开关
    toggleHidden: '显示/隐藏点文件',
    // 全部折叠按钮
    collapseAll: '全部折叠',
    // 刷新按钮
    refresh: '刷新',
    // 未绑定工作区时的说明
    noSession: '当前会话还没有工作目录',
    // 复制成功提示
    copied: '已复制',
    // 复制失败提示
    copyFailed: '复制失败',
    // 剪贴板为空或内容不是文件名的提示
    pasteEmpty: '剪贴板里没有可粘贴的文件名',
    // 新建 / 复制成功提示
    created: '已创建',
    // Git 暂存成功提示
    gitStaged: '已暂存',
    // 删除成功提示
    deleted: '已移入回收站',
    // 删除后通知里的撤销按钮
    undo: '撤销',
    // 撤销时说明回收站位置
    trashHint: '文件在回收站批次',
    // 名称不合法提示
    invalidName: '名称不能为空，也不能包含 /',
    // 新建文件对话框标题
    promptNewFile: '新建文件',
    // 新建目录对话框标题
    promptNewDirectory: '新建目录',
    // 重命名对话框标题
    promptRename: '重命名为',
    // 删除确认
    deleteConfirm: '确定删除？文件会移入回收站：',
    // 取消按钮
    cancel: '取消',
    // 确认按钮
    confirm: '确定',
    // 删除按钮
    delete: '删除',
    // 读屏器：目录行的角色说明
    directoryLabel: '目录',
    // 读屏器：文件行的角色说明
    fileLabel: '文件',
    // 右键菜单：打开
    'menu.open': '打开',
    // 右键菜单：在编辑器中打开
    'menu.openInEditor': '在编辑器中打开',
    // 右键菜单：发送路径
    'menu.sendPath': '发送路径…',
    // 右键菜单：新建
    'menu.new': '新建',
    // 右键菜单：新建目录
    'menu.newDirectory': '目录',
    // 右键菜单：剪切
    'menu.cut': '剪切',
    // 右键菜单：复制
    'menu.copy': '复制',
    // 右键菜单：复制路径
    'menu.copyPath': '复制路径',
    // 右键菜单：复制相对路径
    'menu.copyRelativePath': '复制相对路径',
    // 右键菜单：粘贴
    'menu.paste': '粘贴',
    // 右键菜单：查找用法
    'menu.findUsages': '查找用法',
    // 右键菜单：在文件中查找
    'menu.findInFiles': '在文件中查找',
    // 右键菜单：分析
    'menu.analyze': '分析',
    // 右键菜单：重命名
    'menu.rename': '重命名',
    // 右键菜单：重构
    'menu.refactor': '重构',
    // 右键菜单：书签
    'menu.bookmarks': '书签',
    // 右键菜单：重新格式化代码
    'menu.reformatCode': '重新格式化代码',
    // 右键菜单：优化导入
    'menu.optimizeImports': '优化导入',
    // 右键菜单：删除
    'menu.delete': '删除',
    // 右键菜单：覆盖文件类型
    'menu.overrideFileType': '覆盖文件类型',
    // 右键菜单：在右侧分屏打开
    'menu.openInRightSplit': '在右侧分屏打开',
    // 右键菜单：打开方式
    'menu.openIn': '打开方式',
    // 右键菜单：本地历史
    'menu.localHistory': '本地历史',
    // 右键菜单：Git
    'menu.git': 'Git',
    // 右键菜单：加入暂存
    'menu.gitAdd': '加入暂存区',
    // 右键菜单：显示差异
    'menu.showDiff': '显示差异',
    // 右键菜单：修复 IDE
    'menu.repairIde': '修复 IDE',
    // 右键菜单：从磁盘重新加载
    'menu.reloadFromDisk': '从磁盘重新加载',
    // 右键菜单：与…比较
    'menu.compareWith': '与…比较',
    // 右键菜单：标记为
    'menu.markFileAs': '标记文件为',
    // 右键菜单：图表
    'menu.diagrams': '图表',
    // 右键菜单：添加到 .gitignore
    'menu.addToGitignore': '添加到 .gitignore',
    // 右键菜单：创建 Gist
    'menu.createGist': '创建 Gist',
    // 工具窗口空白处右键菜单：打开 IDE 设置
    'menu.panelSettings': '设置…',
  },
  en: {
    title: 'Project',
    viewProject: 'Project',
    viewPackages: 'Packages',
    viewChanged: 'All Changed Files',
    noChanges: 'No changed files',
    loading: 'Loading…',
    empty: 'Empty directory',
    loadFailed: 'Failed to read',
    retry: 'Retry',
    truncated: 'Too many entries, showing first 2000',
    toggleHidden: 'Show/hide dotfiles',
    collapseAll: 'Collapse all',
    refresh: 'Refresh',
    noSession: 'This session has no working directory yet',
    copied: 'Copied',
    copyFailed: 'Copy failed',
    pasteEmpty: 'Clipboard holds no file name',
    created: 'Created',
    gitStaged: 'Staged',
    deleted: 'Moved to trash',
    undo: 'Undo',
    trashHint: 'Files are in trash batch',
    invalidName: 'Name must be non-empty and contain no /',
    promptNewFile: 'New file',
    promptNewDirectory: 'New directory',
    promptRename: 'Rename to',
    deleteConfirm: 'Delete? The file moves to trash:',
    cancel: 'Cancel',
    confirm: 'OK',
    delete: 'Delete',
    directoryLabel: 'directory',
    fileLabel: 'file',
    'menu.open': 'Open',
    'menu.openInEditor': 'Open in editor',
    'menu.sendPath': 'Send path…',
    'menu.new': 'New',
    'menu.newDirectory': 'Directory',
    'menu.cut': 'Cut',
    'menu.copy': 'Copy',
    'menu.copyPath': 'Copy path',
    'menu.copyRelativePath': 'Copy relative path',
    'menu.paste': 'Paste',
    'menu.findUsages': 'Find usages',
    'menu.findInFiles': 'Find in files',
    'menu.analyze': 'Analyze',
    'menu.rename': 'Rename',
    'menu.refactor': 'Refactor',
    'menu.bookmarks': 'Bookmarks',
    'menu.reformatCode': 'Reformat code',
    'menu.optimizeImports': 'Optimize imports',
    'menu.delete': 'Delete',
    'menu.overrideFileType': 'Override file type',
    'menu.openInRightSplit': 'Open in right split',
    'menu.openIn': 'Open in',
    'menu.localHistory': 'Local history',
    'menu.git': 'Git',
    'menu.gitAdd': 'Add to staging',
    'menu.showDiff': 'Show diff',
    'menu.repairIde': 'Repair IDE',
    'menu.reloadFromDisk': 'Reload from disk',
    'menu.compareWith': 'Compare with…',
    'menu.markFileAs': 'Mark file as',
    'menu.diagrams': 'Diagrams',
    'menu.addToGitignore': 'Add to .gitignore',
    'menu.createGist': 'Create Gist',
    'menu.panelSettings': 'Settings…',
  },
}
