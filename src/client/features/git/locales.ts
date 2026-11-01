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
  // 差异行数超过渲染上限时的提示
  diffTruncated: 'Diff is too large, showing the first 2000 rows only',
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
  // 分组方式之一：不分组，文件直接排在分组下
  flatList: 'Flat List',
  // 排序方式下拉的按钮提示
  sortChanges: 'Sort By',
  // 排序方式：按文件名
  sortByName: 'Sort by Name',
  // 排序方式：按完整路径
  sortByPath: 'Sort by Path',
  // 排序方式：按变更状态
  sortByStatus: 'Sort by Status',
  // 没有可提交的变更
  nothingToCommit: 'There are no changes to commit',
  // 顶部 Commit 按钮在没有变更时弹出的提示框标题
  nothingToCommitTitle: 'Nothing to Commit',
  // 同上提示框的正文：整个工作区（含未跟踪文件）没有任何改动
  noChangesDetected: 'No changes detected',
  // 在编辑器里打开差异（IDEA 的 Ctrl+D）
  diffInEditor: 'Show Diff in Editor',
  // 先选中一个文件再执行
  selectItemFirst: 'Select a file first',
  // 没有可折叠的内容
  nothingToCollapse: 'Nothing to collapse',
  // 该能力尚未开放
  notAvailable: 'Not available yet',
  // 提交文件树显示增删行数
  showFileStats: 'Show Change Statistics',
  // 变更分组：未暂存
  groupChanges: 'Changes',
  // 变更分组：未纳入版本控制的文件
  groupUntracked: 'Unversioned Files',
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

  // 历史页签标题前缀：拼成「History: <文件名>」
  tabHistory: 'History',
  // 关闭历史页签
  closeTab: 'Close Tab',
  // 历史页签右侧差异的初始提示：还没有选中提交
  selectHistoryCommit: 'Select a commit to view its diff',
  // 历史页签工具条：切到 Log 页签并选中当前提交
  showInLog: 'Show in Log',
  // 提交详情工具栏：按选中的提交文件打开 History 页签
  showHistory: 'Show History',
  // 历史页签工具条：清除分支过滤
  clearBranchFilter: 'Clear Branch Filter',
  // 历史页签工具条：提交过滤菜单
  filter: 'Filter Commits',
  // 差异工具条：折叠未变更片段
  collapseFragments: 'Collapse Unchanged Fragments',

  // Log 工具条：返回上一次查看的分支或提交
  goBack: 'Back',
  // Log 工具条：在选中的提交处新建分支
  newBranch: 'New Branch',
  // Log 工具条：聚焦提交搜索框
  searchCommits: 'Search Commits',
  // Log 工具条：把选中的分支或提交加入收藏
  addFavorite: 'Add to Favorites',
  // Log 工具条：按时间轴查看分支演进
  showTimeline: 'Show Git Timeline',
  // Log 工具条：打开 Git 设置
  settings: 'Settings',
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
  // 搜索框左侧的搜索历史角标
  searchHistory: 'Search History',
  // 暂停自动刷新；Log 工具栏右侧带圆形底色的按钮
  pauseRefresh: 'Pause Refresh',
  // 正则过滤开关
  regex: 'Regex',
  // 区分大小写开关
  caseSensitive: 'Match Case',
  // 分支过滤
  branchFilter: 'Branch',
  // 分支过滤菜单首项：打开输入框直接填写分支、标签或引用名
  selectEllipsis: 'Select...',
  // 分支过滤菜单的收藏分组标题
  favorites: 'Favorites',
  // 分支过滤菜单里的 HEAD 项：当前检出分支的提交范围
  head: 'HEAD',
  // 输入分支名对话框的标题
  selectBranchTitle: 'Select Branch',
  // 输入分支名对话框的说明：可填分支、标签或任意引用
  selectBranchHint: 'Branch, tag or revision',
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
  // 提交详情工具栏：把选中文件恢复到该提交之前的状态
  revertSelectedChanges: 'Revert Selected Changes',
  // Revert Selected Changes 确认框正文；{path} 与 {hash} 由代码替换
  revertSelectedMessage: 'Restore {path} to its state before commit {hash}? The working tree and index will be updated.',
  // 右下角提示：选中的提交文件已回滚
  revertSelectedDone: 'Selected changes reverted',
  // 根提交没有父提交，无法回滚到提交之前
  noParentCommit: 'This commit has no parent to revert to',
  // 提交列表为空
  noCommits: 'No commits found',
  // 提交加载中
  loadingCommits: 'Loading commits…',
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
  // 提交菜单：cherry-pick
  cherryPick: 'Cherry-Pick',
  // 提交菜单：反向应用
  revertCommit: 'Revert Commit',
  // 提交菜单：重置当前分支到此
  resetHere: 'Reset Current Branch to Here…',
  // 提交菜单：复制完整版本号
  copyRevisionNumber: 'Copy Revision Number',
  // 提交菜单：把该提交导出成补丁文件
  createPatch: 'Create Patch…',
  // 提交菜单：在仓库历史里定位该提交
  showRepositoryAtRevision: 'Show Repository at Revision',
  // 提交菜单：该提交与工作区比较
  commitCompareWithLocal: 'Compare with Local',
  // 提交菜单：撤销提交（能力未实现，菜单置灰）
  undoCommit: 'Undo Commit…',
  // 提交菜单：改写提交信息
  editCommitMessage: 'Edit Commit Message…',
  // 提交菜单：把该提交收成 fixup（能力未实现，菜单置灰）
  fixup: 'Fixup…',
  // 提交菜单：压缩进更早的提交（能力未实现，菜单置灰）
  squashInto: 'Squash Into…',
  // 提交菜单：删除该提交
  dropCommit: 'Drop Commit',
  // 提交菜单：从该提交开始交互式变基（能力未实现，菜单置灰）
  interactiveRebase: 'Interactively Rebase from Here…',
  // 提交菜单：把该提交及之前的提交推送到远端
  pushUpToHere: 'Push All up to Here…',
  // 提交菜单：从该提交新建分支
  newBranchEllipsis: 'New Branch…',
  // 提交菜单：在该提交上新建标签
  newTag: 'New Tag…',
  // 提交菜单：跳到子提交
  goToChildCommit: 'Go to Child Commit',
  // 提交菜单：跳到父提交
  goToParentCommit: 'Go to Parent Commit',
  // 补丁文件生成成功；{path} 是相对工作区的路径
  patchCreated: 'Patch saved to {path}',
  // 与工作区比较窗口的标题；{hash} 是被比较的提交
  commitCompareTitle: "Changes between '{hash}' and working tree",
  // 子提交或父提交不在已加载列表里时的提示
  commitNotLoaded: 'The target commit is not loaded in the list',
  // 新建标签对话框标题
  newTagTitle: 'New Tag',
  // 新建标签对话框：说明标签建在哪个提交上
  newTagAtHint: 'Create tag at',
  // 标签名为空时的提示
  tagNameRequired: 'A tag name is required',
  // 编辑提交信息对话框标题
  editMessageTitle: 'Edit Commit Message',
  // 提交信息为空时的提示
  messageRequired: 'A commit message is required',
  // 分支菜单：签出
  checkout: 'Checkout',
  // 分支菜单：从该分支新建；{branch} 是被右键的分支名
  newBranchFromTarget: "New Branch from '{branch}'...",
  // 分支菜单：检出该分支并把当前分支变基过去；{current} 是当前分支名
  checkoutAndRebase: "Checkout and Rebase onto '{current}'",
  // 分支菜单：检出该分支后执行更新
  checkoutAndUpdate: 'Checkout and Update',
  // 分支菜单：查看该引用与工作区的差异
  showDiffWorkingTree: 'Show Diff with Working Tree',
  // 分支菜单：与当前分支比较；{current} 是当前分支名
  compareWith: "Compare with '{current}'",
  // 跟踪分支子菜单：与本地分支比较；{branch} 是本地分支名
  compareWithLocal: "Compare with '{branch}'",
  // 分支菜单：把当前分支变基到该分支上；{current} 当前分支、{target} 被右键的分支
  rebaseOnto: "Rebase '{current}' onto '{target}'",
  // 分支菜单：把该分支合入当前分支；{current} 当前分支、{target} 被右键的分支
  mergeInto: "Merge '{target}' into '{current}'",
  // 分支菜单：在该分支上新建工作树；{branch} 是被右键的分支名
  newWorktreeFrom: "New Worktree from '{branch}'...",
  // 分支菜单：更新该分支
  update: 'Update',
  // 分支菜单：推送（带省略号，表示会先打开推送流程）
  pushEllipsis: 'Push...',
  // 推送按钮文案；Push Commits 弹窗的主按钮用它
  push: 'Push',
  // 分支菜单：该分支跟踪的上游分支；{branch} 是上游分支名
  trackedBranch: "Tracked Branch '{branch}'",
  // 分支菜单：重命名（带省略号，表示会先打开对话框）
  renameEllipsis: 'Rename...',
  // 远程分支菜单：以变基方式拉进当前分支；{current} 是当前分支名
  pullIntoRebase: "Pull into '{current}' Using Rebase",
  // 远程分支菜单：以合并方式拉进当前分支；{current} 是当前分支名
  pullIntoMerge: "Pull into '{current}' Using Merge",
  // 分支菜单：从收藏中移除
  removeFavorite: 'Remove from Favorites',
  // 分支比较窗口标题；{left} 比较基准、{right} 被比较的引用
  compareTitle: "Comparing '{left}' with '{right}'",
  // 与工作区比较的窗口标题；{branch} 被比较的引用
  changesWithWorkingTree: "Changes between '{branch}' and working tree",
  // 比较窗口：两个引用之间没有差异
  compareNoFiles: 'No differences',
  // 新建工作树对话框标题
  newWorktreeTitle: 'New Worktree',
  // 新建工作树对话框：说明要检出的分支
  newWorktreeHint: 'Check out',
  // 新建工作树对话框：目录为空
  worktreePathRequired: 'A worktree directory is required',
  // 右下角提示：工作树创建完成；{path} 是新工作树目录
  worktreeSuccess: 'Worktree created at {path}',
  // 分支菜单：删除
  deleteBranch: 'Delete',
  // 重置对话框标题
  resetTitle: 'Git Reset',
  // 重置对话框：目标提交摘要；{branch} 当前分支、{hash} 短 hash、{subject} 标题、{author} 作者
  resetTarget: '{branch} -> {hash} "{subject}" by {author}',
  // 重置对话框：说明会移动分支指针并按所选模式更新工作树与索引
  resetDescription:
    'This will reset the current branch head to the selected commit,\nand update the working tree and the index according to the selected mode:',
  // 重置模式：保留改动在暂存区
  resetSoft: 'Soft',
  // 重置模式：保留改动在工作区
  resetMixed: 'Mixed',
  // 重置模式：丢弃所有改动
  resetHard: 'Hard',
  // 重置模式：重置文件但保留本地改动
  resetKeep: 'Keep',
  // 重置模式说明：Soft 不改文件，改动留在暂存区
  resetSoftNote: "Files won't change, differences will be staged for commit.",
  // 重置模式说明：Mixed 不改文件，改动留在工作区未暂存
  resetMixedNote: "Files won't change, differences won't be staged.",
  // 重置模式说明：Hard 丢弃工作区改动，警告单独占一行
  resetHardNote:
    'Files will be reverted to the state of the selected commit.\nWarning: any local changes will be lost.',
  // 重置模式说明：Keep 更新文件但保留本地改动
  resetKeepNote:
    'Files will be reverted to the state of the selected commit,\nbut local changes will be kept intact.',
  // 重置对话框的主按钮
  resetButton: 'Reset',
  // 重置对话框左下角帮助按钮的提示
  resetHelp: 'Reset modes',
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
  // Rollback Changes 对话框标题
  rollbackDialogTitle: 'Rollback Changes',
  // Rollback Changes 对话框：新增文件回滚时是否删除本地副本
  deleteLocalCopies: 'Delete local copies of added files',
  // Rollback Changes 对话框：默认 changelist 名称
  changeListName: 'Changes',
  // 右下角提示：回滚完成
  rollbackSucceeded: 'Rollback completed',
  // 关闭对话框
  close: 'Close',
  // 文件菜单：查看差异
  showDiff: 'Show Diff',
  // 文件菜单：复制路径
  copyPath: 'Copy Path',
  // 冲突文件菜单：打开冲突解决视图
  resolveConflicts: 'Resolve Conflicts',

  // 控制台工具栏：是否自动换行
  consoleSoftWrap: 'Use Soft Wraps',
  // 控制台工具栏：跳到输出末尾
  consoleScrollEnd: 'Scroll to End',
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

  // 分支弹窗：搜索框占位
  branchPopupSearch: 'Search for branches and actions',
  // 分支弹窗：更新工程
  branchPopupUpdate: 'Update Project…',
  // 分支弹窗：提交
  branchPopupCommit: 'Commit…',
  // 分支弹窗：推送
  branchPopupPush: 'Push…',
  // 分支弹窗：新建分支
  branchPopupNewBranch: 'New Branch…',
  // 分支弹窗：检出标签或提交
  branchPopupCheckoutTag: 'Checkout Tag or Revision…',
  // 分支弹窗：最近使用的分支分组
  branchPopupRecent: 'Recent',
  // 分支弹窗：本地分支分组
  branchPopupLocal: 'Local',
  // 分支弹窗：远程分支分组
  branchPopupRemote: 'Remote',
  // 分支弹窗：从远程拉取引用
  branchPopupFetch: 'Fetch',
  // 分支弹窗：拉取进行中
  branchPopupFetching: 'Fetching…',
  // 分支弹窗：拉取失败的通知
  branchPopupFetchFailed: 'Could not fetch from the remote',
  // 分支弹窗：拉取成功的通知
  fetchSuccess: 'Fetched from the remote',
  // 右下角提示：拉取（合并）成功
  pullSuccess: 'Pull successful',
  // 右下角提示：推送成功
  pushSuccess: 'Push successful',
  // 分支弹窗：打开 Git 设置
  branchPopupSettings: 'Git Settings',
  // 分支弹窗：切换分支失败的通知
  branchPopupCheckoutFailed: 'Could not check out the branch',
  // 分支弹窗：读取分支列表失败的通知
  branchPopupLoadFailed: 'Could not read branches',

  // 顶部 Add 按钮不可用：项目树没有选中项
  addRequiresSelection: 'Select a file or folder in the project tree',
  // 顶部 Add 按钮不可用：选中项没有未纳入版本控制的文件
  addNothingToAdd: 'The selection has no unversioned files',
  // 右下角提示：Add 完成，{path} 是加入索引的文件或文件夹
  addedToGit: 'Added {path} to Git',

  // 分支名旁蓝色箭头的悬停提示：{count} 个远端提交待合入
  commitsToPull: '{count} commits to pull',
  // 分支名旁绿色箭头的悬停提示：{count} 个本地提交待推送
  commitsToPush: '{count} commits to push',

  // Update Project 对话框标题
  updateProjectTitle: 'Update Project',
  // Update Project 对话框：合并选项
  updateProjectMerge: 'Merge incoming changes into the current branch',
  // Update Project 对话框：变基选项
  updateProjectRebase: 'Rebase the current branch on top of incoming changes',
  // Update Project 对话框：不再显示该对话框的复选项
  updateProjectDontShowAgain: "Don't show again",
  // Update Project 对话框：把当前分支重置到远端分支
  updateProjectResetRemote: 'Reset to the Remote Branch',
  // Update Project 对话框：帮助按钮提示，打开 IDEA 官方文档
  updateProjectHelp: 'Open Update Project help',
  // 当前分支没有跟踪分支，无法更新
  updateProjectNoUpstream: 'The current branch has no tracked branch to update from',
  // 更新工程：抓取远端失败
  updateProjectFetchFailed: 'Could not fetch from the remote',
  // 更新工程：合并或变基失败（如冲突）
  updateProjectFailed: 'Could not apply incoming changes',
  // 右下角提示：更新工程完成
  updateProjectSuccess: 'Project updated',
  // 重置到远端分支的二次确认标题
  updateProjectResetTitle: 'Reset to the Remote Branch',
  // 重置到远端分支的二次确认正文：本地未推送的提交会丢失
  updateProjectResetConfirm:
    'The current branch will be reset to its tracked remote branch. All commits that are not pushed will be lost.',
  // 重置到远端分支失败
  updateProjectResetFailed: 'Could not reset to the remote branch',
  // 右下角提示：重置到远端分支完成
  updateProjectResetSuccess: 'Branch reset to the remote branch',

  // Push Commits 弹窗标题，{repo} 是仓库目录名
  pushDialogTitle: 'Push Commits to {repo}',
  // Push Commits 弹窗：远端还没有这个分支，首次推送会新建它
  pushDialogNewBranch: 'New',
  // Push Commits 弹窗：点击分支行上的远端名后菜单里的入口，用来配置远端地址
  pushDefineRemote: 'Define remote',
  // Push Commits 弹窗：没有待推送的提交
  pushDialogNoCommits: 'No commits to push',
  // Push Commits 弹窗：没有待推送的文件
  pushDialogNoFiles: 'No files to push',
  // Push Commits 弹窗：选中的提交里没有变更文件（例如空提交）
  pushDialogNoCommitFiles: 'No files in the selected commit',
  // Push Commits 弹窗：帮助按钮提示，打开 IDEA 官方文档
  pushDialogHelp: 'Open Push help',
  // Push Commits 弹窗：是否同时推送标签
  pushTags: 'Push tags:',
  // Push Commits 弹窗：标签范围的悬停提示
  pushTagsScope: 'Push tags scope',
  // Push Commits 弹窗：标签范围之一，推送全部标签
  pushTagsAll: 'All',
  // Push Commits 弹窗：标签范围之一，只推送当前分支上的标签
  pushTagsCurrentBranch: 'Current Branch',
  // Push Commits 弹窗：推送按钮下拉里的强制推送
  pushForce: 'Force Push',
  // Push Commits 弹窗：推送按钮下拉的悬停提示
  pushMore: 'More push options',
  // Push Commits 弹窗：在编辑器中打开选中文件
  pushOpenFile: 'Open the selected file in the editor',
  // Push Commits 弹窗：查看选中文件在当前范围内的差异
  pushShowDiff: 'Show the selected file diff',

  // Define Remote 对话框标题
  defineRemoteTitle: 'Define Remote',
  // Define Remote 对话框：远端名字段
  defineRemoteName: 'Name:',
  // Define Remote 对话框：远端地址字段
  defineRemoteUrl: 'URL:',
  // Define Remote 对话框：保存后是否立即拉取该远端
  defineRemoteFetch: 'Fetch remote',

  // Commit 弹窗标题
  commitDialogTitle: 'Commit Changes',
  // Commit 弹窗：提交信息分组标题
  commitMessage: 'Commit Message',
  // Commit 弹窗：差异区域标题
  diffSection: 'Diff',
  // Commit 弹窗：主按钮
  commitAction: 'Commit',
  // Commit 弹窗：主按钮下拉里的提交并推送
  commitAndPush: 'Commit and Push',
  // 提交信息为空
  commitMessageRequired: 'Commit message is empty',
  // 未勾选任何文件
  nothingSelected: 'Select at least one file to commit',
  // 右下角提示：提交成功
  commitSucceeded: 'Changes committed',
  // 右下角提示：推送成功
  pushSucceeded: 'Pushed to remote',
  // 推送被拒后自动合并上游失败
  pushMergeFailed: 'Could not merge the incoming changes',
  // 提交统计：已修改
  statModified: 'modified',
  // 提交统计：新增
  statAdded: 'added',
  // 提交统计：删除
  statDeleted: 'deleted',
  // 提交统计：未纳入版本控制
  statUnversioned: 'unversioned',
  // 帮助
  help: 'Help',
  // 切换到上一个 changelist
  previousChangeList: 'Previous Changelist',
  // 切换到下一个 changelist
  nextChangeList: 'Next Changelist',
}

export const locales: LocaleDictionaries = {
  en: ENGLISH,
  // 按产品要求 Git 面板固定英文，中文槽位共用同一份英文文案
  zh: ENGLISH,
}
