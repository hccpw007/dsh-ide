/**
 * Git 客户端调用封装。
 *
 * 所有能力走宿主 `/git/exec`：方法名加结构化参数，客户端不能拼任意命令。
 * 读方法只返回结果；写方法统一在这里把真实命令行与输出记进 Git 控制台，
 * 保证面板、工具栏、项目树、弹窗等任意入口执行过的命令都能在控制台看到。
 */
import { apiPost, type ApiResult } from '../../../common/api'

import { recordGitConsole } from './console-store'

/** 工作区中的一个变更。 */
export interface GitChange {
  /** 相对仓库根的路径。 */
  path: string
  /** 索引区状态字母。 */
  indexStatus: string
  /** 工作区状态字母。 */
  worktreeStatus: string
  /** 重命名/复制前的路径。 */
  originalPath?: string
}

/** 仓库状态。 */
export interface GitStatus {
  /** 当前分支名；游离 HEAD 时为空串或 `HEAD`。 */
  branch: string
  /** HEAD 短 hash；初始仓库为空串。 */
  headShort: string
  /** 已暂存。 */
  staged: GitChange[]
  /** 未暂存。 */
  unstaged: GitChange[]
  /** 未跟踪。 */
  untracked: GitChange[]
  /** 冲突。 */
  conflicted: GitChange[]
}

/** 提交条目。 */
export interface GitCommit {
  /** 完整 hash。 */
  hash: string
  /** 短 hash。 */
  shortHash: string
  /** 作者。 */
  author: string
  /** 作者邮箱。 */
  email: string
  /** ISO 8601 时间。 */
  date: string
  /** 父提交。 */
  parents: string[]
  /** 引用标签。 */
  refs: string[]
  /** 标题。 */
  subject: string
  /** 正文；仅详情里有值。 */
  body?: string
}

/** 本地分支。 */
export interface GitBranch {
  /** 分支名。 */
  name: string
  /** 是否为当前分支。 */
  isHead: boolean
  /** 上游分支。 */
  upstream: string
  /** 领先上游的提交数。 */
  ahead: number
  /** 落后上游的提交数。 */
  behind: number
  /** 头提交短 hash。 */
  hash: string
  /** 头提交标题。 */
  subject: string
}

/** 远程分支或标签。 */
export interface GitRef {
  /** 短名。 */
  name: string
  /** 指向的短 hash。 */
  hash: string
  /** 指向提交的标题。 */
  subject: string
}

/** 分支、远程与标签。 */
export interface GitRefs {
  /** 当前分支名。 */
  head: string
  /** 本地分支。 */
  local: GitBranch[]
  /** 远程分支。 */
  remote: GitRef[]
  /** 标签。 */
  tags: GitRef[]
}

/** 提交详情。 */
export interface GitCommitDetail {
  /** 提交信息。 */
  commit: GitCommit
  /** 逐文件统计；status 是相对父提交的状态字母，决定文件名颜色。 */
  files: { path: string; added: number; removed: number; status: string }[]
  /** 包含该提交的分支；当前分支存在时第一项是 HEAD。 */
  branches: string[]
}

/** 写操作结果。 */
export interface GitRunOutput {
  /** 实际执行的命令行。 */
  command: string
  /** 标准输出。 */
  stdout: string
  /** 标准错误。 */
  stderr: string
}

/** 一个变更文件：路径与状态字母。 */
export interface GitFileStatus {
  /** 相对仓库根的路径；重命名与复制取新路径。 */
  path: string
  /** 状态字母：A 新增、M 修改、D 删除、R 重命名、C 复制。 */
  status: string
}

/** 待推送内容。 */
export interface GitPushPreview {
  /** 当前分支名。 */
  branch: string
  /** 已跟踪的上游短名，形如 `origin/main`；分支还没有上游时为空串。 */
  upstream: string
  /** 推送目标所在的远端名，如 origin。 */
  remote: string
  /** 推送目标在远端的同名分支名；远端还没有该分支时就是将要新建的分支。 */
  target: string
  /** 远端还没有该分支，首次推送会新建它。 */
  isNewBranch: boolean
  /** 仓库里已配置的远端名；推送目标可从中切换。 */
  remotes: string[]
  /** 未推送的提交，最新在前。 */
  commits: GitCommit[]
  /** 待推送的变更文件。 */
  files: GitFileStatus[]
}

/** 一条搁置记录。 */
export interface GitStash {
  /** reflog 选择符，形如 `stash@{0}`。 */
  selector: string
  /** reflog 标题。 */
  subject: string
  /** 相对时间。 */
  date: string
  /** 搁置提交的完整 hash。 */
  hash: string
}

/** 冲突一侧在索引里的状态。 */
export type ConflictSideStatus = 'added' | 'modified' | 'deleted'

/** 一个冲突文件与两侧的状态。 */
export interface GitConflictFile {
  /** 相对仓库根的路径。 */
  path: string
  /** 我方（当前分支）在索引里的状态。 */
  oursStatus: ConflictSideStatus
  /** 对方（正在合进来的提交）在索引里的状态。 */
  theirsStatus: ConflictSideStatus
}

/** 冲突上下文：双方名称、进行中的操作与冲突文件。 */
export interface GitConflictInfo {
  /** 我方名称：当前分支名。 */
  ours: string
  /** 对方短名：正在合进来的提交短 hash；没有进行中的操作时为空串。 */
  theirs: string
  /** 对方完整 hash；没有进行中的操作时为空串。 */
  theirsHash: string
  /** 进行中的操作。 */
  operation: 'merge' | 'rebase' | 'cherry-pick' | 'none'
  /** 冲突文件。 */
  files: GitConflictFile[]
}

/** 冲突文件的三方内容与工作区现状。 */
export interface GitConflictVersions {
  /** 基线版本。 */
  base: string
  /** 我方版本。 */
  ours: string
  /** 对方版本。 */
  theirs: string
  /** 工作区文本，保留 Git 写入的冲突标记。 */
  worktree: string
  /** 任一侧含 NUL，按二进制处理。 */
  binary: boolean
  /** 工作区文件字节数。 */
  bytes: number
}

/**
 * 调用一个 Git 方法。
 * @param method 方法名
 * @param cwd 工作区根
 * @param params 方法参数
 * @returns 解包后的结果
 */
function call<T>(method: string, cwd: string, params: Record<string, unknown> = {}): Promise<ApiResult<T>> {
  return apiPost<T>('/git/exec', { ...params, method, cwd })
}

/**
 * 调用一个写方法，并把真实命令行与输出记进 Git 控制台。
 *
 * 记录收在这一层而不是各调用方：面板、主工具栏、项目树右键、分支弹窗都从这里走，
 * 无论用户从哪个入口执行，控制台看到的都是同一份真实命令。
 * @param method 方法名
 * @param cwd 工作区根
 * @param params 方法参数
 * @returns 解包后的结果；调用方仍按 `ok` 决定后续流程
 */
async function callWrite(
  method: string,
  cwd: string,
  params: Record<string, unknown> = {},
): Promise<ApiResult<GitRunOutput>> {
  const result = await call<GitRunOutput>(method, cwd, params)

  if (!result.ok) {
    // 参数在宿主校验阶段就被拒绝时没有真实命令行，退化成方法名以保证记录不丢
    recordGitConsole({
      cwd,
      command: result.error.command ?? `git ${method}`,
      stdout: '',
      stderr: result.error.message,
      ok: false,
    })

    return result
  }

  recordGitConsole({
    cwd,
    command: result.value.command,
    stdout: result.value.stdout,
    stderr: result.value.stderr,
    ok: true,
  })

  return result
}

/** 读取仓库状态。 */
export function readStatus(cwd: string): Promise<ApiResult<GitStatus>> {
  return call<GitStatus>('status', cwd)
}

/** 读取本地/远程分支与标签。 */
export function readRefs(cwd: string): Promise<ApiResult<GitRefs>> {
  return call<GitRefs>('branches', cwd)
}

/** 当前仓库的提交身份。 */
export interface GitUser {
  /** git config user.name；未配置时为空串。 */
  name: string
}

/** 读取当前仓库的提交身份；User 过滤菜单的 me 项用它。 */
export function readGitUser(cwd: string): Promise<ApiResult<GitUser>> {
  return call<GitUser>('user', cwd)
}

/** 仓库全部提交的作者。 */
export interface GitAuthors {
  /** 作者名，按提交数从多到少排列。 */
  authors: string[]
}

/** 读取仓库全部提交的作者；User 过滤菜单的候选列表用它，避免漏掉近期没提交的人。 */
export function readAuthors(cwd: string): Promise<ApiResult<GitAuthors>> {
  return call<GitAuthors>('authors', cwd)
}

/** 读取待推送的提交与文件；指定远端时按该远端计算区间。 */
export function readPushPreview(cwd: string, remote = ''): Promise<ApiResult<GitPushPreview>> {
  return call<GitPushPreview>('pushPreview', cwd, { remote })
}

/** 读取单个提交相对父提交的变更文件；推送窗按提交行切换右侧文件树时使用。 */
export function readCommitFiles(cwd: string, hash: string): Promise<ApiResult<{ files: GitFileStatus[] }>> {
  return call<{ files: GitFileStatus[] }>('commitFiles', cwd, { hash })
}

/** 读取提交历史。 */
export function readLog(
  cwd: string,
  options: { branch?: string; skip?: number; limit?: number; path?: string; all?: boolean; author?: string } = {},
): Promise<ApiResult<{ commits: GitCommit[] }>> {
  return call<{ commits: GitCommit[] }>('log', cwd, {
    branch: options.branch ?? '',
    skip: options.skip ?? 0,
    limit: options.limit ?? 200,
    path: options.path ?? '',
    all: String(options.all === true),
    // 作者过滤交给 git：列表分页加载，只筛已加载的几页会漏掉更早的提交
    author: options.author ?? '',
  })
}

/** 读取提交详情与逐文件统计。 */
export function readCommit(cwd: string, hash: string): Promise<ApiResult<GitCommitDetail>> {
  return call<GitCommitDetail>('commitDetail', cwd, { hash })
}

/** 两个比较结果里的一个文件。 */
export interface GitCompareFile {
  /** 相对仓库根的路径。 */
  path: string
  /** 变更状态字母；重命名/复制取末段路径的字母。 */
  status: string
}

/** 两个引用之间的差异文件；用于分支右键的 Compare with。 */
export function compareRefs(cwd: string, left: string, right: string): Promise<ApiResult<{ files: GitCompareFile[] }>> {
  return call<{ files: GitCompareFile[] }>('compareRefs', cwd, { left, right })
}

/** 某个引用与工作区之间的差异文件；用于分支右键的 Show Diff with Working Tree。 */
export function compareWorktree(cwd: string, ref: string): Promise<ApiResult<{ files: GitCompareFile[] }>> {
  return call<{ files: GitCompareFile[] }>('compareWorktree', cwd, { ref })
}

/** 暂存文件。 */
export function stage(cwd: string, paths: string[]): Promise<ApiResult<GitRunOutput>> {
  return callWrite('stage', cwd, { paths })
}

/** 取消暂存。 */
export function unstage(cwd: string, paths: string[]): Promise<ApiResult<GitRunOutput>> {
  return callWrite('unstage', cwd, { paths })
}

/** 丢弃改动。 */
export function discard(cwd: string, paths: string[], untracked: boolean): Promise<ApiResult<GitRunOutput>> {
  return callWrite('discard', cwd, { paths, untracked: String(untracked) })
}

/** 把指定路径恢复为某个提交（Revert Selected Changes 用父提交）的内容。 */
export function restoreFrom(cwd: string, ref: string, paths: string[]): Promise<ApiResult<GitRunOutput>> {
  return callWrite('restoreFrom', cwd, { ref, paths })
}

/** 提交勾选的文件。 */
export function commitFiles(cwd: string, message: string, paths: string[]): Promise<ApiResult<GitRunOutput>> {
  return callWrite('commit', cwd, { message, paths })
}

/** 检出分支、标签或提交。 */
export function checkout(cwd: string, ref: string): Promise<ApiResult<GitRunOutput>> {
  return callWrite('checkout', cwd, { ref })
}

/** 新建并切出分支。 */
export function createBranch(cwd: string, name: string, start = ''): Promise<ApiResult<GitRunOutput>> {
  return callWrite('createBranch', cwd, { name, start })
}

/** 删除分支。 */
export function deleteBranch(cwd: string, name: string, force = false): Promise<ApiResult<GitRunOutput>> {
  return callWrite('deleteBranch', cwd, { name, force: String(force) })
}

/** 删除远程分支。 */
export function deleteRemoteBranch(cwd: string, remote: string, branch: string): Promise<ApiResult<GitRunOutput>> {
  return callWrite('deleteRemoteBranch', cwd, { remote, branch })
}

/** 重命名分支。 */
export function renameBranch(cwd: string, from: string, to: string): Promise<ApiResult<GitRunOutput>> {
  return callWrite('renameBranch', cwd, { from, to })
}

/** 把某个本地分支快进到它的上游；不切出该分支也能更新。 */
export function updateBranch(cwd: string, branch: string, upstream: string): Promise<ApiResult<GitRunOutput>> {
  return callWrite('updateBranch', cwd, { branch, upstream })
}

/**
 * 新建附加工作树。
 * @param branch 远程分支要落成的本地分支名；本地分支与提交传空串
 */
export function addWorktree(
  cwd: string,
  options: { path: string; ref: string; branch?: string },
): Promise<ApiResult<GitRunOutput>> {
  return callWrite('worktreeAdd', cwd, { path: options.path, ref: options.ref, branch: options.branch ?? '' })
}

/** 合并到当前分支。 */
export function merge(cwd: string, ref: string): Promise<ApiResult<GitRunOutput>> {
  return callWrite('merge', cwd, { ref })
}

/** 变基当前分支。 */
export function rebase(cwd: string, ref: string): Promise<ApiResult<GitRunOutput>> {
  return callWrite('rebase', cwd, { ref })
}

/** 读取冲突上下文：双方名称、进行中的操作与冲突文件。 */
export function readConflictInfo(cwd: string): Promise<ApiResult<GitConflictInfo>> {
  return call<GitConflictInfo>('conflictInfo', cwd)
}

/** 读取冲突文件的三方内容与工作区文本。 */
export function readConflictVersions(cwd: string, path: string): Promise<ApiResult<GitConflictVersions>> {
  return call<GitConflictVersions>('conflictVersions', cwd, { path })
}

/** 按侧接受整个冲突文件。 */
export function acceptConflictSide(
  cwd: string,
  path: string,
  side: 'ours' | 'theirs',
): Promise<ApiResult<GitRunOutput>> {
  return callWrite('acceptConflict', cwd, { path, side })
}

/** 写回合并结果并标记该文件已解决。 */
export function resolveConflictFile(cwd: string, path: string, text: string): Promise<ApiResult<GitRunOutput>> {
  return callWrite('resolveConflict', cwd, { path, text })
}

/** 完成被冲突中断的合并 / 变基 / cherry-pick。 */
export function continueOperation(cwd: string): Promise<ApiResult<GitRunOutput>> {
  return callWrite('continueOperation', cwd)
}

/** 中止被冲突中断的合并 / 变基 / cherry-pick，恢复到操作开始前。 */
export function abortOperation(cwd: string): Promise<ApiResult<GitRunOutput>> {
  return callWrite('abortOperation', cwd)
}

/** cherry-pick。 */
export function cherryPick(cwd: string, hash: string): Promise<ApiResult<GitRunOutput>> {
  return callWrite('cherryPick', cwd, { hash })
}

/** 反向应用提交。 */
export function revertCommit(cwd: string, hash: string): Promise<ApiResult<GitRunOutput>> {
  return callWrite('revert', cwd, { hash })
}

/** 重置当前分支。 */
export function resetBranch(
  cwd: string,
  ref: string,
  mode: 'soft' | 'mixed' | 'hard' | 'keep',
): Promise<ApiResult<GitRunOutput>> {
  return callWrite('reset', cwd, { ref, mode })
}

/** 在指定提交上新建标签。 */
export function tagCommit(cwd: string, name: string, ref: string): Promise<ApiResult<GitRunOutput>> {
  return callWrite('tag', cwd, { name, ref })
}

/** 丢弃提交；HEAD 退回到父提交并保留内容，更旧的提交通过 rebase 移除。 */
export function dropCommit(cwd: string, hash: string): Promise<ApiResult<GitRunOutput>> {
  return callWrite('dropCommit', cwd, { hash })
}

/** 改写 HEAD 提交的信息。 */
export function amendCommitMessage(cwd: string, message: string): Promise<ApiResult<GitRunOutput>> {
  return callWrite('amendMessage', cwd, { message })
}

/** 把指定提交及其之前的历史推到当前分支的远端。 */
export function pushUpToHere(cwd: string, ref: string): Promise<ApiResult<GitRunOutput>> {
  return callWrite('pushUpToHere', cwd, { ref })
}

/** 生成提交补丁文本；写文件由调用方负责。 */
export function createPatch(cwd: string, hash: string): Promise<ApiResult<{ patch: string }>> {
  return call<{ patch: string }>('formatPatch', cwd, { ref: hash })
}

/** 获取远端引用。 */
export function fetchAll(cwd: string): Promise<ApiResult<GitRunOutput>> {
  return callWrite('fetch', cwd)
}

/** 拉取并合并。 */
export function pull(cwd: string): Promise<ApiResult<GitRunOutput>> {
  return callWrite('pull', cwd)
}

/** 推送当前分支；可指定远端、强制推送与标签范围。 */
export function push(
  cwd: string,
  options: { force?: boolean; tags?: 'all' | 'current'; remote?: string } = {},
): Promise<ApiResult<GitRunOutput>> {
  return callWrite('push', cwd, {
    force: String(options.force === true),
    ...(options.tags === undefined ? {} : { tags: options.tags }),
    ...(options.remote === undefined ? {} : { remote: options.remote }),
  })
}

/** 定义远端：按名字新增或改写地址，可选保存后立即拉取。 */
export function defineRemote(
  cwd: string,
  options: { name: string; url: string; fetch: boolean },
): Promise<ApiResult<GitRunOutput>> {
  return callWrite('defineRemote', cwd, {
    name: options.name,
    url: options.url,
    fetch: String(options.fetch),
  })
}

/** 读取搁置列表。 */
export function readStashes(cwd: string): Promise<ApiResult<{ stashes: GitStash[] }>> {
  return call<{ stashes: GitStash[] }>('stashes', cwd)
}

/** 搁置当前改动。 */
export function stashChanges(
  cwd: string,
  options: { message?: string; untracked?: boolean } = {},
): Promise<ApiResult<GitRunOutput>> {
  return callWrite('stash', cwd, {
    message: options.message ?? '',
    untracked: String(options.untracked === true),
  })
}

/** 应用一条搁置，保留记录。 */
export function applyStash(cwd: string, selector: string): Promise<ApiResult<GitRunOutput>> {
  return callWrite('stashApply', cwd, { selector })
}

/** 弹出搁置，成功后删除记录。 */
export function popStash(cwd: string, selector: string): Promise<ApiResult<GitRunOutput>> {
  return callWrite('stashPop', cwd, { selector })
}

/** 删除一条搁置记录。 */
export function dropStash(cwd: string, selector: string): Promise<ApiResult<GitRunOutput>> {
  return callWrite('stashDrop', cwd, { selector })
}
