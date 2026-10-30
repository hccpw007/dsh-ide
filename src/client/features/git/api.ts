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
  /** 逐文件统计。 */
  files: { path: string; added: number; removed: number }[]
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

/** 读取提交历史。 */
export function readLog(
  cwd: string,
  options: { branch?: string; skip?: number; limit?: number; path?: string; all?: boolean } = {},
): Promise<ApiResult<{ commits: GitCommit[] }>> {
  return call<{ commits: GitCommit[] }>('log', cwd, {
    branch: options.branch ?? '',
    skip: options.skip ?? 0,
    limit: options.limit ?? 200,
    path: options.path ?? '',
    all: String(options.all === true),
  })
}

/** 读取提交详情与逐文件统计。 */
export function readCommit(cwd: string, hash: string): Promise<ApiResult<GitCommitDetail>> {
  return call<GitCommitDetail>('commitDetail', cwd, { hash })
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

/** 重命名分支。 */
export function renameBranch(cwd: string, from: string, to: string): Promise<ApiResult<GitRunOutput>> {
  return callWrite('renameBranch', cwd, { from, to })
}

/** 合并到当前分支。 */
export function merge(cwd: string, ref: string): Promise<ApiResult<GitRunOutput>> {
  return callWrite('merge', cwd, { ref })
}

/** 变基当前分支。 */
export function rebase(cwd: string, ref: string): Promise<ApiResult<GitRunOutput>> {
  return callWrite('rebase', cwd, { ref })
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
  mode: 'soft' | 'mixed' | 'hard',
): Promise<ApiResult<GitRunOutput>> {
  return callWrite('reset', cwd, { ref, mode })
}

/** 获取远端引用。 */
export function fetchAll(cwd: string): Promise<ApiResult<GitRunOutput>> {
  return callWrite('fetch', cwd)
}

/** 拉取并合并。 */
export function pull(cwd: string): Promise<ApiResult<GitRunOutput>> {
  return callWrite('pull', cwd)
}

/** 推送当前分支。 */
export function push(cwd: string, options: { force?: boolean } = {}): Promise<ApiResult<GitRunOutput>> {
  return callWrite('push', cwd, { force: String(options.force === true) })
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
