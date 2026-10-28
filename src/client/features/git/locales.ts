/**
 * Git 面板的中英文案。
 *
 * key 不带 feature 前缀，外壳注册时统一加 `git.`。
 */
import type { LocaleDictionaries } from '../../../common/locale'

export const locales: LocaleDictionaries = {
  zh: {
    // 工具条按钮与工具窗口标题
    title: '版本控制',
    // 未绑定工作区
    noSession: '当前会话还没有工作目录',
    // 工作区不是 git 仓库
    notRepository: '当前目录不是 Git 仓库',
    // 没有变更
    clean: '没有变更',
    // 刷新按钮
    refresh: '刷新',
    // 分支列表按钮
    branches: '分支',
    // 拉取并合并
    pull: '拉取',
    // 只拉取
    fetch: '获取',
    // 推送
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
    unstage: '取消',
    // 分组批量暂存
    stageAll: '全部暂存',
    // 分组批量取消暂存
    unstageAll: '全部取消',
    // 丢弃改动
    discard: '丢弃',
    // 冲突文件的解决入口
    resolve: '解决',
    // 提交信息输入框占位
    commitPlaceholder: '提交信息',
    // 提交按钮
    commit: '提交',
    // 提交信息为空时的提示
    messageRequired: '请填写提交信息',
    // 通用操作失败
    actionFailed: '操作失败',
    // 合并到当前分支
    mergeInto: '合并',
    // 删除分支
    delete: '删除',
    // 新建分支输入框占位
    newBranchPlaceholder: '新分支名',
    // 新建并切出分支
    createBranch: '新建',
    // 应用并删除 stash
    stashPop: '应用',
    // 切出成功
    checkedOut: '已切换到',
    // 合并进行中
    mergingHint: '合并未结束：变基与 cherry-pick 暂不可用。',
    // 变基进行中
    rebasingHint: '变基未结束：合并与 cherry-pick 暂不可用。',
    // cherry-pick 进行中
    cherryPickingHint: 'cherry-pick 未结束：合并与变基暂不可用。',
  },
  en: {
    title: 'Version Control',
    noSession: 'This session has no working directory yet',
    notRepository: 'This directory is not a Git repository',
    clean: 'No changes',
    refresh: 'Refresh',
    branches: 'Branches',
    pull: 'Pull',
    fetch: 'Fetch',
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
    discard: 'Discard',
    resolve: 'Resolve',
    commitPlaceholder: 'Commit message',
    commit: 'Commit',
    messageRequired: 'A commit message is required',
    actionFailed: 'Action failed',
    mergeInto: 'Merge',
    delete: 'Delete',
    newBranchPlaceholder: 'New branch name',
    createBranch: 'Create',
    stashPop: 'Pop',
    checkedOut: 'Checked out',
    mergingHint: 'Merge in progress: rebase and cherry-pick are unavailable.',
    rebasingHint: 'Rebase in progress: merge and cherry-pick are unavailable.',
    cherryPickingHint: 'Cherry-pick in progress: merge and rebase are unavailable.',
  },
}
