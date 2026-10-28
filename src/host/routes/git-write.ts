/**
 * Git 写方法：暂存、提交、分支、合并、变基、标签、stash 与远程操作。
 *
 * 写操作全部经调用方的 `serialized` 串行执行，因此这里不必自己处理并发。
 * 破坏性操作（force 删除、hard reset、force push）的确认由客户端负责，
 * 宿主只执行，避免「界面确认了但宿主没按确认执行」的割裂。
 */
import { bodyString } from '../../common/http-body'
import { assertRef, execGit, GitError } from '../services/git-service'

import { readPaths } from './git-parse'

/** 写方法的实现表。 */
export const WRITE_METHODS: Record<string, (repo: string, body: Record<string, unknown>) => Promise<unknown>> = {
  /** 暂存文件。 */
  async stage(repo, body) {
    const paths = readPaths(body)

    await execGit(repo, ['add', '--', ...paths])

    return null
  },

  /** 取消暂存；未跟踪文件走 rm --cached。 */
  async unstage(repo, body) {
    const paths = readPaths(body)

    await execGit(repo, ['reset', 'HEAD', '--', ...paths], { allowFailure: true })

    return null
  },

  /** 丢弃工作区改动（不可逆，客户端必须先确认）。 */
  async discard(repo, body) {
    const paths = readPaths(body)
    const untracked = bodyString(body, 'untracked') === 'true'

    if (untracked) {
      await execGit(repo, ['clean', '-fd', '--', ...paths])
    } else {
      await execGit(repo, ['restore', '--', ...paths])
    }

    return null
  },

  /** 提交暂存区。 */
  async commit(repo, body) {
    const message = bodyString(body, 'message')
    const amend = bodyString(body, 'amend') === 'true'

    if (message.trim() === '') throw new GitError('GIT_FAILED', '提交信息不能为空')

    const args = ['commit', '-m', message]
    if (amend) args.push('--amend')

    const result = await execGit(repo, args)

    return { output: result.stdout }
  },

  /** 检出分支或提交。 */
  async checkout(repo, body) {
    const target = assertRef(bodyString(body, 'ref'), '目标 ref')

    await execGit(repo, ['checkout', target])

    return null
  },

  /** 新建并切出分支。 */
  async createBranch(repo, body) {
    const name = assertRef(bodyString(body, 'name'), '分支名')
    const start = bodyString(body, 'start')
    const args = ['checkout', '-b', name]

    if (start !== '') args.push(assertRef(start, '起点'))

    await execGit(repo, args)

    return null
  },

  /** 删除分支。 */
  async deleteBranch(repo, body) {
    const name = assertRef(bodyString(body, 'name'), '分支名')
    const force = bodyString(body, 'force') === 'true'

    await execGit(repo, ['branch', force ? '-D' : '-d', name])

    return null
  },

  /** 重命名分支。 */
  async renameBranch(repo, body) {
    await execGit(repo, ['branch', '-m', assertRef(bodyString(body, 'from'), '旧分支名'), assertRef(bodyString(body, 'to'), '新分支名')])

    return null
  },

  /** 合并分支到当前分支。 */
  async merge(repo, body) {
    await execGit(repo, ['merge', '--no-edit', assertRef(bodyString(body, 'ref'), '目标 ref')])

    return null
  },

  /** 变基到指定 ref。 */
  async rebase(repo, body) {
    await execGit(repo, ['rebase', assertRef(bodyString(body, 'ref'), '目标 ref')])

    return null
  },

  /** cherry-pick 单个提交。 */
  async cherryPick(repo, body) {
    await execGit(repo, ['cherry-pick', assertRef(bodyString(body, 'hash'), '提交')])

    return null
  },

  /** 重置到指定 ref。 */
  async reset(repo, body) {
    const mode = bodyString(body, 'mode', 'mixed')
    if (mode !== 'soft' && mode !== 'mixed' && mode !== 'hard') {
      throw new GitError('GIT_FAILED', `不支持的 reset 模式: ${mode}`)
    }

    await execGit(repo, ['reset', `--${mode}`, assertRef(bodyString(body, 'ref', 'HEAD'), '目标 ref')])

    return null
  },

  /** 打标签。 */
  async createTag(repo, body) {
    const name = assertRef(bodyString(body, 'name'), '标签名')
    const ref = bodyString(body, 'ref')

    await execGit(repo, ref === '' ? ['tag', name] : ['tag', name, assertRef(ref, '目标 ref')])

    return null
  },

  /** 删除标签。 */
  async deleteTag(repo, body) {
    await execGit(repo, ['tag', '-d', assertRef(bodyString(body, 'name'), '标签名')])

    return null
  },

  /** 暂存当前改动。 */
  async stash(repo, body) {
    const message = bodyString(body, 'message')
    const args = ['stash', 'push']

    if (message !== '') args.push('-m', message)

    await execGit(repo, args)

    return null
  },

  /** 暂存列表。 */
  async stashList(repo) {
    const result = await execGit(repo, ['stash', 'list', '--format=%gd%1f%s'])

    return {
      entries: result.stdout
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map((line) => {
          const [ref, ...subject] = line.split('\x1f')

          return { ref, subject: subject.join(' ') }
        }),
    }
  },

  /** 应用 / 弹出 / 删除 stash。 */
  async stashApply(repo, body) {
    const action = bodyString(body, 'action', 'apply')
    const ref = assertRef(bodyString(body, 'ref'), 'stash 引用')
    const verb = action === 'pop' ? 'pop' : action === 'drop' ? 'drop' : 'apply'

    await execGit(repo, ['stash', verb, ref])

    return null
  },

  /** 拉取。 */
  async fetch(repo) {
    const result = await execGit(repo, ['fetch', '--all', '--prune'], { timeoutMs: 180_000 })

    return { output: result.stderr }
  },

  /** 拉取并合并。 */
  async pull(repo) {
    const result = await execGit(repo, ['pull', '--no-edit'], { timeoutMs: 180_000 })

    return { output: result.stdout + result.stderr }
  },

  /** 推送。 */
  async push(repo, body) {
    const force = bodyString(body, 'force') === 'true'
    const setUpstream = bodyString(body, 'setUpstream') === 'true'
    const args = ['push']

    if (force) args.push('--force-with-lease')
    if (setUpstream) args.push('-u')
    args.push('origin', 'HEAD')

    const result = await execGit(repo, args, { timeoutMs: 180_000 })

    return { output: result.stderr }
  },

  /** 合并冲突时的三选一保留（我方 / 对方 / 双方）。 */
  async resolveConflict(repo, body) {
    const target = assertRef(bodyString(body, 'path'), '路径')
    const side = bodyString(body, 'side', 'ours')
    const flag = side === 'theirs' ? '--theirs' : '--ours'

    await execGit(repo, ['checkout', flag, '--', target])
    await execGit(repo, ['add', '--', target])

    return null
  },
}
