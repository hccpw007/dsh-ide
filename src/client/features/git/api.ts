/**
 * Git 客户端调用封装。
 *
 * 所有 Git 能力都走宿主侧的 `/git/exec`，方法名 + 参数的结构化形式让宿主能做白名单，
 * 客户端也只需一层薄封装。这里只负责类型与调用，不持有任何状态。
 */
import { apiPost, type ApiResult } from '../../../common/api'

/** 工作区中的一个变更。 */
export interface GitChange {
  /** 相对仓库根的路径。 */
  path: string
  /** 索引区状态字母。 */
  indexStatus: string
  /** 工作区状态字母。 */
  worktreeStatus: string
}

/** 仓库状态。 */
export interface GitStatus {
  /** 当前分支名。 */
  branch: string
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
  /** 提交时间。 */
  date: string
  /** 父提交。 */
  parents: string[]
  /** 引用（HEAD、分支、标签）。 */
  refs: string[]
  /** 标题。 */
  subject: string
  /** 正文。 */
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
  /** 分支头提交。 */
  hash: string
  /** 头提交标题。 */
  subject: string
}

/** 分支、远程与标签。 */
export interface GitRefs {
  /** 本地分支。 */
  local: GitBranch[]
  /** 远程分支。 */
  remote: { name: string; hash: string; subject: string }[]
  /** 标签。 */
  tags: { name: string; hash: string }[]
}

/** 仓库的多步操作状态。 */
export interface GitOperationState {
  /** 正在合并。 */
  merging: boolean
  /** 正在变基。 */
  rebasing: boolean
  /** 正在 cherry-pick。 */
  cherryPicking: boolean
  /** 正在 revert。 */
  reverting: boolean
  /** 存在冲突文件。 */
  conflicts: boolean
}

/** 提交详情。 */
export interface GitCommitDetail {
  /** 提交信息。 */
  commit: GitCommit
  /** 逐文件统计。 */
  files: { added: string; removed: string; path: string }[]
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
 * 探测工作区是否为仓库。
 * @param cwd 工作区根
 * @returns 仓库根或 undefined
 */
export async function resolveRepo(cwd: string): Promise<string | undefined> {
  const result = await call<{ isRepo: boolean; cwd: string }>('repos', cwd, {})

  return result.ok && result.value.isRepo ? result.value.cwd : undefined
}

/** 读取仓库状态。 */
export function readStatus(cwd: string): Promise<ApiResult<GitStatus>> {
  return call<GitStatus>('status', cwd)
}

/** 读取分支与标签。 */
export function readRefs(cwd: string): Promise<ApiResult<GitRefs>> {
  return call<GitRefs>('branches', cwd)
}

/** 读取分页历史。 */
export function readLog(cwd: string, skip: number, limit: number, branch = ''): Promise<ApiResult<{ commits: GitCommit[] }>> {
  return call<{ commits: GitCommit[] }>('log', cwd, { skip, limit, branch })
}

/** 读取提交详情。 */
export function readCommit(cwd: string, hash: string): Promise<ApiResult<GitCommitDetail>> {
  return call<GitCommitDetail>('show', cwd, { hash })
}

/** 读取仓库多步操作状态。 */
export function readOperationState(cwd: string): Promise<ApiResult<GitOperationState>> {
  return call<GitOperationState>('state', cwd)
}

/** 读取 stash 列表。 */
export function readStashes(cwd: string): Promise<ApiResult<{ entries: { ref: string; subject: string }[] }>> {
  return call<{ entries: { ref: string; subject: string }[] }>('stashList', cwd)
}

/** 暂存文件。 */
export function stage(cwd: string, paths: string[]): Promise<ApiResult<null>> {
  return call<null>('stage', cwd, { paths })
}

/** 取消暂存。 */
export function unstage(cwd: string, paths: string[]): Promise<ApiResult<null>> {
  return call<null>('unstage', cwd, { paths })
}

/** 丢弃改动。 */
export function discard(cwd: string, paths: string[], untracked: boolean): Promise<ApiResult<null>> {
  return call<null>('discard', cwd, { paths, untracked: String(untracked) })
}

/** 提交。 */
export function commit(cwd: string, message: string, amend = false): Promise<ApiResult<{ output: string }>> {
  return call<{ output: string }>('commit', cwd, { message, amend: String(amend) })
}

/** 检出分支或提交。 */
export function checkout(cwd: string, ref: string): Promise<ApiResult<null>> {
  return call<null>('checkout', cwd, { ref })
}

/** 新建分支。 */
export function createBranch(cwd: string, name: string, start = ''): Promise<ApiResult<null>> {
  return call<null>('createBranch', cwd, { name, start })
}

/** 删除分支。 */
export function deleteBranch(cwd: string, name: string, force: boolean): Promise<ApiResult<null>> {
  return call<null>('deleteBranch', cwd, { name, force: String(force) })
}

/** 重命名分支。 */
export function renameBranch(cwd: string, from: string, to: string): Promise<ApiResult<null>> {
  return call<null>('renameBranch', cwd, { from, to })
}

/** 合并。 */
export function merge(cwd: string, ref: string): Promise<ApiResult<null>> {
  return call<null>('merge', cwd, { ref })
}

/** 变基。 */
export function rebase(cwd: string, ref: string): Promise<ApiResult<null>> {
  return call<null>('rebase', cwd, { ref })
}

/** cherry-pick。 */
export function cherryPick(cwd: string, hash: string): Promise<ApiResult<null>> {
  return call<null>('cherryPick', cwd, { hash })
}

/** 重置。 */
export function reset(cwd: string, ref: string, mode: 'soft' | 'mixed' | 'hard'): Promise<ApiResult<null>> {
  return call<null>('reset', cwd, { ref, mode })
}

/** 打标签。 */
export function createTag(cwd: string, name: string, ref = ''): Promise<ApiResult<null>> {
  return call<null>('createTag', cwd, { name, ref })
}

/** 删除标签。 */
export function deleteTag(cwd: string, name: string): Promise<ApiResult<null>> {
  return call<null>('deleteTag', cwd, { name })
}

/** 暂存改动。 */
export function stash(cwd: string, message: string): Promise<ApiResult<null>> {
  return call<null>('stash', cwd, { message })
}

/** 应用 / 弹出 / 删除 stash。 */
export function stashApply(cwd: string, ref: string, action: 'apply' | 'pop' | 'drop'): Promise<ApiResult<null>> {
  return call<null>('stashApply', cwd, { ref, action })
}

/** 拉取。 */
export function fetchAll(cwd: string): Promise<ApiResult<{ output: string }>> {
  return call<{ output: string }>('fetch', cwd)
}

/** 拉取并合并。 */
export function pull(cwd: string): Promise<ApiResult<{ output: string }>> {
  return call<{ output: string }>('pull', cwd)
}

/** 推送。 */
export function push(cwd: string, options: { force?: boolean; setUpstream?: boolean } = {}): Promise<ApiResult<{ output: string }>> {
  return call<{ output: string }>('push', cwd, {
    force: String(options.force === true),
    setUpstream: String(options.setUpstream === true),
  })
}

/** 解决冲突：保留我方 / 对方 / 双份。 */
export function resolveConflict(cwd: string, path: string, side: 'ours' | 'theirs'): Promise<ApiResult<null>> {
  return call<null>('resolveConflict', cwd, { path, side })
}
