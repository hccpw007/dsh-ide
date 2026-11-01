/**
 * Git 写方法：暂存、丢弃、分支、合并、变基、重置与远程操作。
 *
 * 写操作全部经调用方的 `serialized` 串行执行，因此这里不自己处理并发。
 * 每个方法返回真实执行的命令行与两侧输出，控制台据此回显——界面看到的就是
 * 实际跑过的命令，不存在「看起来执行了但参数不同」的割裂。
 */
import { isAbsolute, sep } from 'node:path'

import { bodyString } from '../../common/http-body'
import {
  assertRef,
  displayCommand,
  execGit,
  GitError,
  NETWORK_TIMEOUT,
  type GitResult,
} from '../services/git-service'

import { readPaths } from './git-parse'

/** 写操作结果：命令行与 stdout/stderr。 */
export interface GitRunOutput {
  /** 实际执行的命令行（已做展示转义）。 */
  command: string
  /** 标准输出。 */
  stdout: string
  /** 标准错误；Git 的进度与远端提示都在这里。 */
  stderr: string
}

/**
 * 执行写命令并包装成可回显的结果。
 * @param repo 仓库根
 * @param argv 参数数组
 * @param timeoutMs 超时；网络操作需要更长时间
 * @returns 命令行与输出
 */
async function run(repo: string, argv: string[], timeoutMs?: number): Promise<GitRunOutput> {
  const result: GitResult = await execGit(repo, argv, timeoutMs === undefined ? {} : { timeoutMs })

  return { command: displayCommand(argv), stdout: result.stdout, stderr: result.stderr }
}

/** 写方法实现表。 */
export const WRITE_METHODS: Record<string, (repo: string, body: Record<string, unknown>) => Promise<unknown>> = {
  /** 暂存文件。 */
  async stage(repo, body) {
    return run(repo, ['add', '--', ...readPaths(body)])
  },

  /** 取消暂存。 */
  async unstage(repo, body) {
    return run(repo, ['reset', 'HEAD', '--', ...readPaths(body)])
  },

  /** 丢弃工作区改动；未跟踪文件走 clean。 */
  async discard(repo, body) {
    const paths = readPaths(body)
    const untracked = bodyString(body, 'untracked') === 'true'

    return untracked ? run(repo, ['clean', '-fd', '--', ...paths]) : run(repo, ['restore', '--', ...paths])
  },

  /**
   * 把指定路径恢复为某个提交的内容。
   *
   * 提交详情栏的 Revert Selected Changes 用它把选中文件退回父提交版本：只动列出的
   * 路径，索引与工作区一起更新，同一提交里的其它文件不受影响。
   */
  async restoreFrom(repo, body) {
    const ref = assertRef(bodyString(body, 'ref'), 'Commit')

    return run(repo, ['checkout', ref, '--', ...readPaths(body)])
  },

  /** 检出分支、标签或提交。 */
  async checkout(repo, body) {
    return run(repo, ['checkout', assertRef(bodyString(body, 'ref'), 'Ref')])
  },

  /** 新建并切出分支。 */
  async createBranch(repo, body) {
    const name = assertRef(bodyString(body, 'name'), 'Branch name')
    const start = bodyString(body, 'start')
    const argv = ['checkout', '-b', name]

    if (start !== '') argv.push(assertRef(start, 'Start point'))

    return run(repo, argv)
  },

  /** 删除本地分支。 */
  async deleteBranch(repo, body) {
    const name = assertRef(bodyString(body, 'name'), 'Branch name')
    const force = bodyString(body, 'force') === 'true'

    return run(repo, ['branch', force ? '-D' : '-d', name])
  },

  /** 删除远程分支：把删除请求推给远端。 */
  async deleteRemoteBranch(repo, body) {
    const remote = assertRef(bodyString(body, 'remote'), 'Remote name')
    const branch = assertRef(bodyString(body, 'branch'), 'Branch name')

    return run(repo, ['push', remote, '--delete', branch], NETWORK_TIMEOUT)
  },

  /** 重命名分支。 */
  async renameBranch(repo, body) {
    return run(repo, [
      'branch',
      '-m',
      assertRef(bodyString(body, 'from'), 'Old branch name'),
      assertRef(bodyString(body, 'to'), 'New branch name'),
    ])
  },

  /**
   * 新建附加工作树：把某个引用检出到另一个目录。
   *
   * 远程分支要落成本地分支（`-b`），否则工作树会停在游离 HEAD 上，用户在新目录里
   * 没法直接提交；本地分支与提交则原样检出。
   */
  async worktreeAdd(repo, body) {
    const target = readWorktreePath(body)
    const ref = assertRef(bodyString(body, 'ref'), 'Ref')
    const branch = bodyString(body, 'branch').trim()

    return run(
      repo,
      branch === ''
        ? ['worktree', 'add', target, ref]
        : ['worktree', 'add', '-b', assertRef(branch, 'Branch name'), target, ref],
    )
  },

  /**
   * 把某个本地分支快进到它的上游；Log 里非当前分支的 Update 用它。
   *
   * 不切出该分支也能更新：先抓远端，再用 `fetch .` 把上游写进同名的本地分支引用。
   * 非快进会被 git 拒绝，因此不会改写分支历史，和 IDEA 的 Update 一致。
   */
  async updateBranch(repo, body) {
    const branch = assertRef(bodyString(body, 'branch'), 'Branch name')
    const upstream = assertRef(bodyString(body, 'upstream'), 'Upstream branch')
    const fetched = await run(repo, ['fetch', '--all', '--prune'], NETWORK_TIMEOUT)
    const updated = await run(repo, ['fetch', '.', `${upstream}:${branch}`])

    // 两条命令都真实执行过，控制台按执行顺序一起回显
    return {
      command: `${fetched.command}\n${updated.command}`,
      stdout: joinOutput(fetched.stdout, updated.stdout),
      stderr: joinOutput(fetched.stderr, updated.stderr),
    }
  },

  /** 合并到当前分支。 */
  async merge(repo, body) {
    return run(repo, ['merge', '--no-edit', assertRef(bodyString(body, 'ref'), 'Ref')])
  },

  /** 把当前分支变基到指定 ref。 */
  async rebase(repo, body) {
    return run(repo, ['rebase', assertRef(bodyString(body, 'ref'), 'Ref')])
  },

  /** cherry-pick 单个提交。 */
  async cherryPick(repo, body) {
    return run(repo, ['cherry-pick', assertRef(bodyString(body, 'hash'), 'Commit')])
  },

  /** 反向应用一个提交。 */
  async revert(repo, body) {
    return run(repo, ['revert', '--no-edit', assertRef(bodyString(body, 'hash'), 'Commit')])
  },

  /** 重置当前分支；keep 模式重置文件但保留本地改动。 */
  async reset(repo, body) {
    const mode = bodyString(body, 'mode', 'mixed')
    if (mode !== 'soft' && mode !== 'mixed' && mode !== 'hard' && mode !== 'keep') {
      throw new GitError('GIT_FAILED', `Unsupported reset mode: ${mode}`)
    }

    return run(repo, ['reset', `--${mode}`, assertRef(bodyString(body, 'ref', 'HEAD'), 'Ref')])
  },

  /**
   * 在指定提交上新建标签。
   *
   * 标签名会被拼进命令行，因此同样走 assertRef 校验。
   */
  async tag(repo, body) {
    const name = assertRef(bodyString(body, 'name'), 'Tag name')

    return run(repo, ['tag', name, assertRef(bodyString(body, 'ref'), 'Commit')])
  },

  /**
   * 丢弃一个提交。
   *
   * 只能丢弃当前分支上的提交：HEAD 直接退回父提交、内容留在工作区；更旧的提交改用
   * rebase --onto 把它之后的提交重放到它的父提交上。后者只在本提交属于当前分支时
   * 成立，所以先用 merge-base 判定祖先关系，避免误改别的分支历史。
   */
  async dropCommit(repo, body) {
    const hash = assertRef(bodyString(body, 'hash'), 'Commit')
    const parents = await execGit(repo, ['rev-list', '--parents', '-n', '1', hash])
    const parent = parents.stdout.trim().split(/\s+/)[1]

    // 根提交没有父提交，丢弃它等于清空历史，直接拒绝
    if (parent === undefined) throw new GitError('GIT_FAILED', 'Cannot drop the root commit')

    const head = (await execGit(repo, ['rev-parse', 'HEAD'])).stdout.trim()

    if (hash === head) return run(repo, ['reset', '--mixed', parent])

    const ancestor = await execGit(repo, ['merge-base', '--is-ancestor', hash, 'HEAD'], { allowFailure: true })

    // 不在当前分支历史里的提交无法通过移动分支指针丢弃
    if (ancestor.code !== 0) throw new GitError('GIT_FAILED', 'Only commits of the current branch can be dropped')

    return run(repo, ['rebase', '--onto', parent, hash])
  },

  /** 改写提交信息；只改写 HEAD，改写更旧的提交要重写整段历史。 */
  async amendMessage(repo, body) {
    const message = bodyString(body, 'message').trim()

    if (message === '') throw new GitError('GIT_FAILED', 'Commit message is empty')

    return run(repo, ['commit', '--amend', '-m', message])
  },

  /**
   * 把指定提交及其之前的历史推到当前分支的远端。
   *
   * 不带 --force：远端已有更新的提交时由 git 拒绝，不会静默改写远端历史。
   */
  async pushUpToHere(repo, body) {
    const ref = assertRef(bodyString(body, 'ref'), 'Commit')
    const branch = (await execGit(repo, ['rev-parse', '--abbrev-ref', 'HEAD'], { allowFailure: true })).stdout.trim()

    if (branch === '' || branch === 'HEAD') throw new GitError('GIT_FAILED', 'A local branch must be checked out')

    const remote = (await trackingRemote(repo)) || 'origin'

    return run(repo, ['push', remote, `${ref}:refs/heads/${branch}`], NETWORK_TIMEOUT)
  },

  /** 生成单个提交的补丁文本；客户端把它写成 .patch 文件。 */
  async formatPatch(repo, body) {
    const ref = assertRef(bodyString(body, 'ref'), 'Commit')
    const result = await execGit(repo, ['format-patch', '-1', ref, '--stdout'], { timeoutMs: NETWORK_TIMEOUT })

    return { patch: result.stdout }
  },

  /** 提交勾选的文件。 */
  async commit(repo, body) {
    const message = bodyString(body, 'message').trim()

    if (message === '') throw new GitError('GIT_FAILED', 'Commit message is empty')

    const paths = readPaths(body)

    // 先把勾选路径纳入索引（未跟踪文件也在其中），再带上路径提交：
    // 带路径的 git commit 只提交这些文件，索引里其它已暂存内容不会被顺带提交
    const staged = await run(repo, ['add', '-A', '--', ...paths])
    const committed = await run(repo, ['commit', '-m', message, '--', ...paths])

    // 两条命令都是真实执行过的，控制台按执行顺序一起回显
    return {
      command: `${staged.command}\n${committed.command}`,
      stdout: joinOutput(staged.stdout, committed.stdout),
      stderr: joinOutput(staged.stderr, committed.stderr),
    }
  },

  /** 获取远端引用。 */
  async fetch(repo) {
    return run(repo, ['fetch', '--all', '--prune'], NETWORK_TIMEOUT)
  },

  /** 拉取并合并。 */
  async pull(repo) {
    return run(repo, ['pull', '--no-edit'], NETWORK_TIMEOUT)
  },

  /** 推送当前分支；可按 Push 对话框的选择指定远端、附带标签与强制推送。 */
  async push(repo, body) {
    const force = bodyString(body, 'force') === 'true'
    const tags = bodyString(body, 'tags')
    const setUpstream = bodyString(body, 'setUpstream') === 'true'
    const requested = bodyString(body, 'remote').trim()
    const remote = requested === '' ? 'origin' : assertRef(requested, 'Remote')
    const argv = ['push']

    if (force) argv.push('--force-with-lease')
    // tags=all 推全部标签；tags=current 只推当前分支可达的标签，与 IDEA 的两种范围一致
    if (tags === 'all') argv.push('--tags')
    else if (tags === 'current') argv.push('--follow-tags')
    // 目标远端与当前跟踪的不一致（含首次推送）时顺手建立跟踪，否则推完状态栏仍指向旧远端
    if (setUpstream || (await trackingRemote(repo)) !== remote) argv.push('-u')
    argv.push(remote, 'HEAD')

    return run(repo, argv, NETWORK_TIMEOUT)
  },

  /** 定义远端：按名字新增或改写地址，可选保存后立即拉取。 */
  async defineRemote(repo, body) {
    const name = assertRef(bodyString(body, 'name'), 'Remote name')
    const url = bodyString(body, 'url').trim()
    const fetch = bodyString(body, 'fetch') === 'true'

    if (url === '') throw new GitError('GIT_FAILED', 'A remote URL is required')

    const existing = await execGit(repo, ['remote'], { allowFailure: true })
    const names = existing.stdout.split('\n').map((line) => line.trim())
    // 同名远端已存在时改写地址，否则新建：用户改地址不必先手动删掉旧远端
    const defined = await run(
      repo,
      names.includes(name) ? ['remote', 'set-url', '--', name, url] : ['remote', 'add', '--', name, url],
    )

    if (!fetch) return defined

    const fetched = await run(repo, ['fetch', name], NETWORK_TIMEOUT)

    return {
      command: `${defined.command}\n${fetched.command}`,
      stdout: joinOutput(defined.stdout, fetched.stdout),
      stderr: joinOutput(defined.stderr, fetched.stderr),
    }
  },

  /** 搁置当前改动。 */
  async stash(repo, body) {
    const message = bodyString(body, 'message').trim()
    const untracked = bodyString(body, 'untracked') === 'true'
    const argv = ['stash', 'push']

    if (untracked) argv.push('--include-untracked')
    if (message !== '') argv.push('-m', message)

    return run(repo, argv)
  },

  /** 应用一条搁置，保留记录。 */
  async stashApply(repo, body) {
    return run(repo, ['stash', 'apply', readStashSelector(body)])
  },

  /** 弹出栈顶搁置并在成功后删除记录。 */
  async stashPop(repo, body) {
    return run(repo, ['stash', 'pop', readStashSelector(body)])
  },

  /** 删除一条搁置记录，不动工作区。 */
  async stashDrop(repo, body) {
    return run(repo, ['stash', 'drop', readStashSelector(body)])
  },
}

/**
 * 按执行顺序拼接两段输出。
 * @param first 前一条命令的输出
 * @param second 后一条命令的输出
 * @returns 合并后的文本；一侧为空时原样返回另一侧
 */
function joinOutput(first: string, second: string): string {
  if (first.trim() === '') return second
  if (second.trim() === '') return first

  return `${first.trimEnd()}\n${second}`
}

/**
 * 当前分支跟踪的远端名。
 * @param repo 仓库根
 * @returns 远端名；没有上游或跟踪本地分支时为空串
 */
async function trackingRemote(repo: string): Promise<string> {
  const result = await execGit(repo, ['rev-parse', '--abbrev-ref', '@{u}'], { allowFailure: true })

  if (result.code !== 0) return ''

  const upstream = result.stdout.trim()
  const slash = upstream.indexOf('/')

  return slash > 0 ? upstream.slice(0, slash) : ''
}

/**
 * 读取并校验工作树目录。
 *
 * 工作树通常建在工作区之外（IDEA 默认也放兄弟目录），因此不能沿用「必须位于工作区内」
 * 的路径校验；但仍要求是绝对路径且不含 `..`，避免把目录建到意料之外的位置。
 * @param body 请求体
 * @returns 绝对路径
 */
function readWorktreePath(body: Record<string, unknown>): string {
  const target = bodyString(body, 'path').trim()

  if (!isAbsolute(target) || target.split(sep).includes('..')) {
    throw new GitError('GIT_FAILED', 'A worktree path must be an absolute path without ".." segments')
  }

  return target
}

/**
 * 读取并校验 stash 选择符。
 *
 * 只接受 `stash@{n}` 这一种形态：选择符会被拼进命令行，放宽格式等于给客户端
 * 留了传任意参数的口子。
 * @param body 请求体
 * @returns 合法的选择符
 */
function readStashSelector(body: Record<string, unknown>): string {
  const selector = bodyString(body, 'selector')

  if (!/^stash@\{\d+\}$/.test(selector)) {
    throw new GitError('GIT_FAILED', `Invalid stash selector: ${selector}`)
  }

  return selector
}
