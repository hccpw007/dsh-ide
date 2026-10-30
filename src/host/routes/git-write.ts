/**
 * Git 写方法：暂存、丢弃、分支、合并、变基、重置与远程操作。
 *
 * 写操作全部经调用方的 `serialized` 串行执行，因此这里不自己处理并发。
 * 每个方法返回真实执行的命令行与两侧输出，控制台据此回显——界面看到的就是
 * 实际跑过的命令，不存在「看起来执行了但参数不同」的割裂。
 */
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

  /** 删除分支。 */
  async deleteBranch(repo, body) {
    const name = assertRef(bodyString(body, 'name'), 'Branch name')
    const force = bodyString(body, 'force') === 'true'

    return run(repo, ['branch', force ? '-D' : '-d', name])
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

  /** 重置当前分支。 */
  async reset(repo, body) {
    const mode = bodyString(body, 'mode', 'mixed')
    if (mode !== 'soft' && mode !== 'mixed' && mode !== 'hard') {
      throw new GitError('GIT_FAILED', `Unsupported reset mode: ${mode}`)
    }

    return run(repo, ['reset', `--${mode}`, assertRef(bodyString(body, 'ref', 'HEAD'), 'Ref')])
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

  /** 推送当前分支。 */
  async push(repo, body) {
    const force = bodyString(body, 'force') === 'true'
    const setUpstream = bodyString(body, 'setUpstream') === 'true'
    const argv = ['push']

    if (force) argv.push('--force-with-lease')
    if (setUpstream) argv.push('-u')
    argv.push('origin', 'HEAD')

    return run(repo, argv, NETWORK_TIMEOUT)
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
