/**
 * Git 面板的中英文案。
 *
 * key 不带 feature 前缀，外壳注册时统一加 `git.`。
 */
import type { LocaleDictionaries } from '../../../common/locale'

export const locales: LocaleDictionaries = {
  zh: {
    // 底部面板名称与工具条按钮提示
    title: 'Git',
    // 页签：本地变更
    tabLocalChanges: '本地变更',
    // 页签：提交日志
    tabLog: '日志',
    // 页签：Git 命令输出
    tabConsole: '控制台',
    // 未绑定工作区
    noSession: '当前会话还没有工作目录',
    // 工作区不是 git 仓库
    notRepository: '当前目录不是 Git 仓库',
    // 没有变更
    clean: '没有变更',
    // 未选择文件时的右侧提示
    selectFile: '选择左侧文件查看差异',
    // 刷新按钮
    refresh: '刷新',
    // 只拉取远端引用
    fetch: '获取',
    // 拉取并合并
    pull: '拉取',
    // 推送当前分支
    push: '推送',
    // 暂存全部改动为 stash
    stash: '贮藏',
    // 冲突分组
    groupConflicted: '冲突',
    // 已暂存分组
    groupStaged: '已暂存',
    // 未暂存分组
    groupUnstaged: '更改',
    // 未跟踪分组
    groupUntracked: '未跟踪',
    // 暂存单个文件
    stage: '暂存',
    // 取消暂存单个文件
    unstage: '取消暂存',
    // 分组批量暂存
    stageAll: '全部暂存',
    // 分组批量取消暂存
    unstageAll: '全部取消',
    // 丢弃工作区改动
    discard: '还原',
    // 冲突文件的解决入口
    resolve: '解决冲突',
    // 在编辑器中打开当前文件
    openInEditor: '在编辑器中打开',
    // 提交信息输入框占位
    commitPlaceholder: '提交信息',
    // 提交按钮
    commit: '提交',
    // 提交信息为空时的提示
    messageRequired: '请填写提交信息',
    // 合并进行中
    mergingHint: '合并未结束：变基与 cherry-pick 暂不可用。',
    // 变基进行中
    rebasingHint: '变基未结束：合并与 cherry-pick 暂不可用。',
    // cherry-pick 进行中
    cherryPickingHint: 'cherry-pick 未结束：合并与变基暂不可用。',
    // 差异段数，与 IDEA 的 N difference 对应
    difference: '处差异',
    // 切到并排模式的按钮
    showSideBySide: '并排',
    // 切到行内模式的按钮
    showInline: '行内',
    // 忽略空白差异
    ignoreWhitespace: '忽略空白',
    // 忽略大小写差异
    ignoreCase: '忽略大小写',
    // 读取中
    loading: '加载中…',
    // 读取失败兜底
    loadFailed: '读取失败',
    // 超过大小上限的说明，后接实际大小
    tooLarge: '内容过大，无法显示差异：',
    // 两段内容完全一致
    identical: '两段内容没有差异',
    // 折叠段的展开按钮，后接行数
    expandLines: '展开',
    // 全部恢复折叠
    collapseAll: '收起相同行',
    // 分支树搜索框占位
    branchSearchPlaceholder: '分支或标签',
    // 当前分支入口
    headCurrent: 'HEAD（当前分支）',
    // 过滤栏里的当前分支短名
    headShort: 'HEAD',
    // 过滤栏里分支标签的前缀
    branchLabel: '分支：',
    // 取消分支过滤的提示
    clearBranchFilter: '回到当前分支',
    // 本地分支分组
    groupLocal: '本地',
    // 远程分支分组
    groupRemote: '远程',
    // 标签分组
    groupTags: '标签',
    // 新建分支按钮
    newBranch: '新建分支',
    // 提交列表的文本或哈希搜索框
    textSearchPlaceholder: '文本或哈希',
    // 没有可显示的提交
    empty: '没有可显示的提交',
    // 提交详情区标题
    commitDetails: '提交详情',
    // 未选中提交时的详情占位
    selectCommit: '选择一条提交查看变更',
    // 从文件差异返回提交列表
    backToLog: '返回日志',
    // 新建分支对话框
    promptCreateBranch: '新分支名',
    // 重命名分支对话框
    promptRenameBranch: '重命名为',
    // 取消
    cancel: '取消',
    // 确认
    confirm: '确定',
    // 分支右键菜单：签出
    'menu.checkout': '签出',
    // 分支右键菜单：新建分支
    'menu.newBranch': '从这里新建分支',
    // 分支右键菜单：重命名
    'menu.rename': '重命名',
    // 分支右键菜单：合并到当前
    'menu.merge': '合并到当前分支',
    // 分支右键菜单：变基当前到此
    'menu.rebase': '把当前分支变基到此',
    // 分支右键菜单：获取
    'menu.fetch': '获取',
    // 分支右键菜单：拉取
    'menu.pull': '拉取',
    // 分支右键菜单：推送
    'menu.push': '推送',
    // 分支右键菜单：删除
    'menu.delete': '删除分支',
    // 控制台标题
    consoleTitle: 'Git 命令输出',
    // 清空控制台
    consoleClear: '清空',
    // 控制台为空
    consoleEmpty: '暂无 Git 命令输出',
  },
  en: {
    title: 'Git',
    tabLocalChanges: 'Local Changes',
    tabLog: 'Log',
    tabConsole: 'Console',
    noSession: 'This session has no working directory yet',
    notRepository: 'This directory is not a Git repository',
    clean: 'No changes',
    selectFile: 'Select a file on the left to see its diff',
    refresh: 'Refresh',
    fetch: 'Fetch',
    pull: 'Pull',
    push: 'Push',
    stash: 'Stash',
    groupConflicted: 'Conflicts',
    groupStaged: 'Staged',
    groupUnstaged: 'Changes',
    groupUntracked: 'Untracked',
    stage: 'Stage',
    unstage: 'Unstage',
    stageAll: 'Stage all',
    unstageAll: 'Unstage all',
    discard: 'Rollback',
    resolve: 'Resolve',
    openInEditor: 'Open in editor',
    commitPlaceholder: 'Commit message',
    commit: 'Commit',
    messageRequired: 'A commit message is required',
    mergingHint: 'Merge in progress: rebase and cherry-pick are unavailable.',
    rebasingHint: 'Rebase in progress: merge and cherry-pick are unavailable.',
    cherryPickingHint: 'Cherry-pick in progress: merge and rebase are unavailable.',
    difference: 'difference(s)',
    showSideBySide: 'Side by side',
    showInline: 'Inline',
    ignoreWhitespace: 'Ignore whitespace',
    ignoreCase: 'Ignore case',
    loading: 'Loading…',
    loadFailed: 'Failed to load',
    tooLarge: 'Too large to diff: ',
    identical: 'No differences',
    expandLines: 'Expand',
    collapseAll: 'Collapse unchanged',
    branchSearchPlaceholder: 'Branch or tag',
    headCurrent: 'HEAD (Current Branch)',
    headShort: 'HEAD',
    branchLabel: 'Branch: ',
    clearBranchFilter: 'Back to current branch',
    groupLocal: 'Local',
    groupRemote: 'Remote',
    groupTags: 'Tags',
    newBranch: 'New Branch',
    textSearchPlaceholder: 'Text or hash',
    empty: 'No commits to show',
    commitDetails: 'Commit details',
    selectCommit: 'Select a commit to view changes',
    backToLog: 'Back to log',
    promptCreateBranch: 'New branch name',
    promptRenameBranch: 'Rename to',
    cancel: 'Cancel',
    confirm: 'OK',
    'menu.checkout': 'Checkout',
    'menu.newBranch': 'New branch from here',
    'menu.rename': 'Rename',
    'menu.merge': 'Merge into current',
    'menu.rebase': 'Rebase current onto this',
    'menu.fetch': 'Fetch',
    'menu.pull': 'Pull',
    'menu.push': 'Push',
    'menu.delete': 'Delete branch',
    consoleTitle: 'Git command output',
    consoleClear: 'Clear',
    consoleEmpty: 'No Git command output yet',
  },
}
