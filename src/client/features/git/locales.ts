/**
 * Git 面板的界面文案。
 *
 * 按产品要求，Git 面板与右键菜单固定使用英文：两个语言槽共用同一份英文文案，
 * 宿主切到中文时也不会出现中英混排。key 不带 feature 前缀，注册时统一加 `git.`。
 */
import type { LocaleDictionaries } from '../../../common/locale'

/** Git 面板的英文文案。 */
const ENGLISH: Record<string, string> = {
  // 底部面板标题与工具条按钮提示
  title: 'Git',
  // 面板页签：工作区变更
  tabLocal: 'Local Changes',
  // 面板页签：提交日志
  tabLog: 'Log',
  // 面板页签：Git 命令输出
  tabConsole: 'Console',
  // 面板页签：搁置的改动
  tabShelf: 'Shelf',

  // 关闭当前面板
  closePanel: 'Close',
  // 新建控制台页签
  newTab: 'New Tab',
  // 页签列表下拉
  tabList: 'Show Tabs',
  // 面板右上角更多操作
  moreActions: 'More Actions',
  // 收起面板
  minimize: 'Minimize',

  // 会话尚未绑定工作目录
  noSession: 'No working directory is bound to this session',
  // 工作目录不是仓库
  notRepository: 'Not a Git repository',
  // 工作区没有变更
  clean: 'No changes',
  // 右侧差异的初始提示
  selectFile: 'Select a file to view its diff',
  // 刷新状态
  refresh: 'Refresh',
  // 收起全部变更分组
  collapseAll: 'Collapse All',
  // 展开全部目录
  expandAll: 'Expand All',
  // 提交文件树按目录分组
  groupByDirectory: 'Group by Directory',
  // 提交文件树显示增删行数
  showFileStats: 'Show Change Statistics',
  // 变更分组：未暂存与未跟踪
  groupChanges: 'Changes',
  // 变更分组：已暂存
  groupStaged: 'Staged',
  // 变更分组：冲突
  groupConflicted: 'Merge Conflicts',
  // 单个文件
  file: 'file',
  // 多个文件
  files: 'files',
  // 差异视图：差异块数量单位
  difference: 'difference',
  // 差异视图：差异块数量单位（复数）
  differences: 'differences',
  // 差异右侧标题
  currentVersion: 'Current version',
  // 跳到上一个差异
  previousDifference: 'Previous Difference',
  // 跳到下一个差异
  nextDifference: 'Next Difference',
  // 切换到上一个文件
  previousFile: 'Previous File',
  // 切换到下一个文件
  nextFile: 'Next File',
  // 关闭差异视图
  closeDiff: 'Close Diff',
  // 差异设置
  diffSettings: 'Diff Settings',
  // 忽略空白差异
  ignoreWhitespace: 'Ignore Whitespace',
  // 忽略大小写差异
  ignoreCase: 'Ignore Case',
  // 并排布局
  sideBySide: 'Side by Side',
  // 行内布局
  singleColumn: 'Single Column',
  // 在编辑器中打开
  openInEditor: 'Open in Editor',
  // 差异内容加载中
  loading: 'Loading…',
  // 差异读取失败
  loadFailed: 'Failed to load diff',
  // 二进制文件无法按文本比较
  binaryFile: 'Binary file — diff is not available',
  // 文件超过可比较上限
  tooLarge: 'File is too large to compare',
  // 两侧内容一致
  identical: 'No differences',
  // 折叠行提示，后接行数
  expandLines: 'Expand',
  // 折叠段里的行数单位
  linesLabel: 'lines',

  // 分支树搜索框
  branchOrTag: 'Branch or tag',
  // 当前分支入口
  headCurrent: 'HEAD (Current Branch)',
  // 本地分支分组
  local: 'Local',
  // 远程分支分组
  remote: 'Remote',
  // 标签分组
  tags: 'Tags',
  // 提交搜索框
  textOrHash: 'Text or hash',
  // 正则过滤开关
  regex: 'Regex',
  // 区分大小写开关
  caseSensitive: 'Match Case',
  // 分支过滤
  branchFilter: 'Branch',
  // 用户过滤
  userFilter: 'User',
  // 日期过滤
  dateFilter: 'Date',
  // 路径过滤
  pathsFilter: 'Paths',
  // 过滤选项：全部
  all: 'All',
  // 过滤选项：今天
  today: 'Today',
  // 过滤选项：最近 7 天
  lastWeek: 'Last 7 days',
  // 过滤选项：最近 30 天
  lastMonth: 'Last 30 days',
  // 显示所有分支的提交
  showAllBranches: 'Show All Branches',
  // 显示提交时间列
  showTimestamps: 'Show Timestamps',
  // 按日期排序
  sortByDate: 'Sort by Date',
  // 清空过滤条件
  clearFilters: 'Clear Filters',
  // 跳到上一条提交
  previousCommit: 'Previous Commit',
  // 跳到下一条提交
  nextCommit: 'Next Commit',
  // 提交列表为空
  noCommits: 'No commits found',
  // 提交加载中
  loadingCommits: 'Loading commits…',
  // 提交详情区标题
  commitDetails: 'Commit details',
  // 提交详情区没有选中提交
  selectCommit: 'Select a commit to view its details',
  // 提交详情：所在分支数量，{count} 由代码替换
  inBranches: 'In {count} branches:',
  // 提交详情日期连接词
  on: 'on',
  // 提交文件树为空
  noFiles: 'No files in this commit',
  // 提交列表的提交菜单：签出该提交
  checkoutRevision: 'Checkout Revision',
  // 提交菜单：从此提交新建分支
  newBranchHere: 'New Branch from Here…',
  // 提交菜单：cherry-pick
  cherryPick: 'Cherry-Pick',
  // 提交菜单：反向应用
  revertCommit: 'Revert Commit',
  // 提交菜单：重置当前分支到此
  resetHere: 'Reset Current Branch to Here…',
  // 提交菜单：复制完整 hash
  copyHash: 'Copy Commit Hash',
  // 提交菜单：复制标题
  copySubject: 'Copy Subject',
  // 分支菜单：签出
  checkout: 'Checkout',
  // 分支菜单：从该分支新建
  newBranchFrom: 'New Branch from Selected…',
  // 分支菜单：重命名
  renameBranch: 'Rename…',
  // 分支菜单：删除
  deleteBranch: 'Delete',
  // 分支菜单：获取
  fetch: 'Fetch',
  // 分支菜单：拉取
  pull: 'Pull',
  // 分支菜单：推送
  push: 'Push',
  // 分支菜单：合并到当前分支
  mergeIntoCurrent: 'Merge into Current Branch',
  // 分支菜单：把当前分支变基到选中分支
  rebaseCurrent: 'Rebase Current onto Selected',
  // 分支菜单：复制分支名
  copyBranchName: 'Copy Branch Name',
  // 重置对话框标题
  resetTitle: 'Reset Current Branch to Here',
  // 重置模式：保留改动在暂存区
  resetSoft: 'Soft',
  // 重置模式：保留改动在工作区
  resetMixed: 'Mixed',
  // 重置模式：丢弃所有改动
  resetHard: 'Hard',
  // 取消按钮
  cancel: 'Cancel',
  // 新建分支对话框标题
  newBranchTitle: 'New Branch',
  // 新建分支对话框的起点说明
  newBranchFromHint: 'Create branch at',
  // 重命名分支对话框标题
  renameBranchTitle: 'Rename Branch',
  // 对话框确认按钮
  ok: 'OK',
  // 分支名校验提示
  branchNameRequired: 'A branch name is required',
  // 差异工具栏中的暂存动作
  stage: 'Stage',
  // 取消暂存
  unstage: 'Unstage',
  // 撤销工作区改动
  rollback: 'Rollback',
  // 文件菜单：查看差异
  showDiff: 'Show Diff',
  // 文件菜单：复制路径
  copyPath: 'Copy Path',
  // 冲突文件菜单：打开冲突解决视图
  resolveConflicts: 'Resolve Conflicts',

  // 控制台清空
  consoleClear: 'Clear All',
  // 控制台复制全部
  consoleCopy: 'Copy All',
  // 控制台为空
  consoleEmpty: 'No Git output yet',
  // 控制台右键菜单：全选
  selectAll: 'Select All',

  // 搁置页签为空
  shelfEmpty: 'No shelved changes',
  // 页签工具栏：搁置当前改动
  shelveChanges: 'Shelve Changes',
  // 页签工具栏：恢复一条搁置并保留记录
  unshelve: 'Unshelve',
  // 页签工具栏：恢复并删除记录
  popStash: 'Pop Stash',
  // 页签工具栏：删除记录
  dropStash: 'Drop Stash',
  // 删除搁置记录的二次确认
  dropStashConfirm: 'Drop {selector}? The shelved changes will be lost.',
  // 先选中一条搁置
  selectStashFirst: 'Select a shelved change first',
  // 搁置当前改动时没有可搁置的内容
  nothingToShelve: 'There are no changes to shelve',
  // 复制搁置标识
  copySelector: 'Copy Stash Name',

  // 复制成功的通知
  copied: 'Copied to clipboard',
  // 复制失败的通知
  copyFailed: 'Could not copy to clipboard',
  // 面板空白处右键菜单：打开 IDE 设置
  menuSettings: 'Settings…',
}

export const locales: LocaleDictionaries = {
  en: ENGLISH,
  // 按产品要求 Git 面板固定英文，中文槽位共用同一份英文文案
  zh: ENGLISH,
}
