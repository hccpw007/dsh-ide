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
    // 目录读取失败的状态行
    loadFailed: '读取失败',
    // 失败行的重试按钮
    retry: '重试',
    // 条目数超过上限时的提示
    truncated: '条目过多，仅显示前 2000 项',
    // 忽略文件开关：显示或隐藏被 .gitignore 忽略的文件
    toggleIgnored: '显示/隐藏忽略的文件',
    // 全部折叠按钮
    collapseAll: '全部折叠',
    // 全部展开按钮
    expandAll: '全部展开',
    // 定位当前文件按钮：展开并滚动到编辑器里正在显示的文件
    locateActiveFile: '定位当前文件',
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
    // 右键菜单：新建（父项，展开后选文件或目录）
    'menu.new': '新建',
    // 右键菜单：新建子菜单里的文件项
    'menu.newFile': '文件',
    // 右键菜单：新建子菜单里的目录项
    'menu.newDirectory': '目录',
    // 右键菜单：复制文件名
    'menu.copy': '复制',
    // 右键菜单：复制绝对路径
    'menu.copyPath': '复制路径/引用…',
    // 右键菜单：粘贴工作区内的同名条目
    'menu.paste': '粘贴',
    // 右键菜单：重命名
    'menu.rename': '重命名…',
    // 右键菜单：删除（移入回收站）
    'menu.delete': '删除…',
    // 右键菜单：打开运行面板新建/编辑运行配置
    'menu.modifyRunConfig': '修改运行配置…',
    // 右键菜单：Git 子菜单父项
    'menu.git': 'Git',
    // 右键菜单：Git 子菜单，把目标加入暂存区
    'menu.gitAdd': '添加到暂存区',
    // 右键菜单：Git 子菜单，显示工作区改动差异
    'menu.showDiff': '显示差异',
    // 右键菜单：重读目标所在目录
    'menu.reloadFromDisk': '从磁盘重新加载',
    // 右键菜单：与工作区版本比较
    'menu.compareWith': '与…比较',
    // 右键菜单：把目标加入 .gitignore
    'menu.addToGitignore': '添加到 .gitignore 文件',
    // 右键菜单：目标已被忽略时，追加取消忽略规则
    'menu.addToGitignoreUnignore': '添加到 .gitignore 文件（取消忽略）',
    // 工具窗口空白处右键菜单：打开 IDE 设置
    'menu.panelSettings': '设置…',
    // .gitignore 写入成功提示
    gitignoreAdded: '已加入 .gitignore',
    // 取消忽略规则写入成功提示
    gitignoreUnignored: '已取消忽略',
    // 相同规则已存在时的提示
    gitignoreExists: '该条目已存在于 .gitignore',
  },
  en: {
    title: 'Project',
    viewProject: 'Project',
    viewPackages: 'Packages',
    viewChanged: 'All Changed Files',
    noChanges: 'No changed files',
    loading: 'Loading…',
    loadFailed: 'Failed to read',
    retry: 'Retry',
    truncated: 'Too many entries, showing first 2000',
    toggleIgnored: 'Show/hide ignored files',
    collapseAll: 'Collapse all',
    // 全部展开按钮
    expandAll: 'Expand all',
    // 定位当前文件按钮：展开并滚动到编辑器里正在显示的文件
    locateActiveFile: 'Select opened file',
    refresh: 'Refresh',
    noSession: 'This session has no working directory yet',
    copied: 'Copied',
    copyFailed: 'Copy failed',
    pasteEmpty: 'Clipboard holds no file name',
    created: 'Created',
    gitStaged: 'Staged',
    deleted: 'Moved to trash',
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
    // 右键菜单：新建（父项，展开后选文件或目录）
    'menu.new': 'New',
    // 右键菜单：新建子菜单里的文件项
    'menu.newFile': 'File',
    // 右键菜单：新建子菜单里的目录项
    'menu.newDirectory': 'Directory',
    // 右键菜单：复制文件名
    'menu.copy': 'Copy',
    // 右键菜单：复制绝对路径
    'menu.copyPath': 'Copy Path/Reference...',
    // 右键菜单：粘贴工作区内的同名条目
    'menu.paste': 'Paste',
    // 右键菜单：重命名
    'menu.rename': 'Rename...',
    // 右键菜单：删除（移入回收站）
    'menu.delete': 'Delete...',
    // 右键菜单：打开运行面板新建/编辑运行配置
    'menu.modifyRunConfig': 'Modify Run Configuration...',
    // 右键菜单：Git 子菜单父项
    'menu.git': 'Git',
    // 右键菜单：Git 子菜单，把目标加入暂存区
    'menu.gitAdd': 'Add',
    // 右键菜单：Git 子菜单，显示工作区改动差异
    'menu.showDiff': 'Show Diff',
    // 右键菜单：重读目标所在目录
    'menu.reloadFromDisk': 'Reload from Disk',
    // 右键菜单：与工作区版本比较
    'menu.compareWith': 'Compare With...',
    // 右键菜单：把目标加入 .gitignore
    'menu.addToGitignore': 'Add to .gitignore file',
    // 右键菜单：目标已被忽略时，追加取消忽略规则
    'menu.addToGitignoreUnignore': 'Add to .gitignore file (unignore)',
    // 工具窗口空白处右键菜单：打开 IDE 设置
    'menu.panelSettings': 'Settings…',
    // .gitignore 写入成功提示
    gitignoreAdded: 'Added to .gitignore',
    // 取消忽略规则写入成功提示
    gitignoreUnignored: 'Unignored',
    // 相同规则已存在时的提示
    gitignoreExists: 'Entry already in .gitignore',
  },
}
