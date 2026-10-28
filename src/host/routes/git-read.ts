/**
 * Git 只读方法：仓库探测、状态、差异、历史、分支与操作状态。
 *
 * 只读方法不改仓库，因此实现里允许 `allowFailure`：`git diff` 有差异时退出码是 1，
 * `git rev-parse` 在非仓库目录会失败——这些都不是故障，由调用方按结果判断。
 */
import { bodyString } from '../../common/http-body'
import { assertRef, detectOperationState, execGit, resolveRepository } from '../services/git-service'

import { parseCommit, parseLog, readTrack, type StatusItem } from './git-parse'

/** 只读方法的实现表。 */
export const READ_METHODS: Record<string, (repo: string, body: Record<string, unknown>) => Promise<unknown>> = {
/** 解析工作区所属仓库；不是仓库时返回 isRepo: false。 */
  async repos(repo, body) {
    const cwd = bodyString(body, 'cwd', repo)
    const root = await resolveRepository(cwd)

    return root === undefined ? { isRepo: false, cwd } : { isRepo: true, cwd: root }
  },

  /** 工作区状态：`--porcelain=v1 -z` 解析成四组。 */
  async status(repo) {
    const result = await execGit(repo, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])
    const parts = result.stdout.split('\0')
    const staged: StatusItem[] = []
    const unstaged: StatusItem[] = []
    const untracked: StatusItem[] = []
    const conflicted: StatusItem[] = []

    for (let index = 0; index < parts.length; index += 1) {
      const record = parts[index]
      if (record === undefined || record.length < 4) continue

      const indexStatus = record[0]
      const worktreeStatus = record[1]
      const filePath = record.slice(3)

      // 重命名/复制记录把源路径放在紧随其后的那条记录里
      if (indexStatus === 'R' || indexStatus === 'C') index += 1

      if (indexStatus === 'U' || worktreeStatus === 'U' || (indexStatus === 'A' && worktreeStatus === 'A') || (indexStatus === 'D' && worktreeStatus === 'D')) {
        conflicted.push({ path: filePath, indexStatus, worktreeStatus })
      } else {
        if (indexStatus !== ' ' && indexStatus !== '?') staged.push({ path: filePath, indexStatus, worktreeStatus })
        if (worktreeStatus !== ' ' && worktreeStatus !== '?') unstaged.push({ path: filePath, indexStatus, worktreeStatus })
      }

      if (indexStatus === '?') untracked.push({ path: filePath, indexStatus, worktreeStatus })
    }

    const branch = await execGit(repo, ['rev-parse', '--abbrev-ref', 'HEAD'], { allowFailure: true })

    return {
      branch: branch.code === 0 ? branch.stdout.trim() : '',
      staged,
      unstaged,
      untracked,
      conflicted,
    }
  },

  /** 工作区文件与 HEAD 的差异补丁。 */
  async diff(repo, body) {
    const target = assertRef(bodyString(body, 'path'), '路径')
    const staged = bodyString(body, 'staged') === 'true'
    const args = ['diff', '--no-color', '-U', String(Math.max(0, Number(body.context ?? 3) || 3))]

    if (staged) args.push('--cached')
    args.push('--', target)

    return { patch: (await execGit(repo, args, { allowFailure: true })).stdout }
  },

  /** 两个 ref 之间的差异补丁（可限定文件）。 */
  async diffRefs(repo, body) {
    const from = assertRef(bodyString(body, 'from'), '起始 ref')
    const to = assertRef(bodyString(body, 'to'), '目标 ref')
    const target = bodyString(body, 'path')
    const args = ['diff', '--no-color', '-U', String(Math.max(0, Number(body.context ?? 3) || 3)), from, to]

    if (target !== '') args.push('--', assertRef(target, '路径'))

    return { patch: (await execGit(repo, args, { allowFailure: true })).stdout }
  },

  /** 两个工作区文件的直接对比。 */
  async diffFiles(repo, body) {
    const left = assertRef(bodyString(body, 'left'), '左侧路径')
    const right = assertRef(bodyString(body, 'right'), '右侧路径')
    const result = await execGit(repo, ['diff', '--no-color', '--no-index', '-U', '3', '--', left, right], { allowFailure: true })

    // --no-index 在有差异时返回 1，属于正常结果
    return { patch: result.stdout }
  },

  /** 提交历史分页。 */
  async log(repo, body) {
    const limit = Math.min(Math.max(Number(body.limit ?? 120) || 120, 1), 500)
    const skip = Math.max(Number(body.skip ?? 0) || 0, 0)
    const branch = bodyString(body, 'branch')
    const args = [
      'log',
      `--max-count=${String(limit)}`,
      `--skip=${String(skip)}`,
      '--date=iso-strict',
      '--pretty=format:%H%x1f%h%x1f%an%x1f%ae%x1f%ad%x1f%P%x1f%D%x1f%s%x1e',
    ]

    if (branch !== '') args.push(assertRef(branch, '分支'))

    const result = await execGit(repo, [...args, '--'], { allowFailure: true })

    return { commits: parseLog(result.stdout) }
  },

  /** 单个提交的详情与逐文件统计。 */
  async show(repo, body) {
    const hash = assertRef(bodyString(body, 'hash'), '提交')
    const meta = await execGit(repo, [
      'show',
      '--no-patch',
      '--date=iso-strict',
      '--pretty=format:%H%x1f%h%x1f%an%x1f%ae%x1f%ad%x1f%P%x1f%D%x1f%s%x1f%b',
      hash,
    ])
    const files = await execGit(repo, ['show', '--numstat', '--format=', hash])

    return {
      commit: parseCommit(meta.stdout),
      files: files.stdout
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '')
        .map((line) => {
          const [added, removed, ...rest] = line.split('\t')

          return { added, removed, path: rest.join('\t') }
        }),
    }
  },

  /** 某个提交对某个文件的补丁。 */
  async showFile(repo, body) {
    const hash = assertRef(bodyString(body, 'hash'), '提交')
    const target = assertRef(bodyString(body, 'path'), '路径')
    const result = await execGit(repo, ['show', '--no-color', '-U', '3', `${hash}`, '--', target], { allowFailure: true })

    return { patch: result.stdout }
  },

  /** 某个 ref 里某个文件的完整文本；文件不存在时返回空串。 */
  async showFileText(repo, body) {
    const hash = assertRef(bodyString(body, 'hash'), '提交')
    const target = bodyString(body, 'path')

    // 空路径表示整个提交，不存在「文件正文」；返回空串让差异渲染器走单侧空
    if (target === '') return { text: '' }

    const result = await execGit(repo, ['show', `${hash}:${assertRef(target, '路径')}`], { allowFailure: true })

    return { text: result.code === 0 ? result.stdout : '' }
  },

  /** 索引区里某个文件的完整文本（用于暂存差异的右侧）。 */
  async indexFileText(repo, body) {
    const target = assertRef(bodyString(body, 'path'), '路径')
    const result = await execGit(repo, ['show', `:${target}`], { allowFailure: true })

    return { text: result.code === 0 ? result.stdout : '' }
  },

  /** 分支列表（含 ahead/behind）。 */
  async branches(repo) {
    const local = await execGit(repo, [
      'for-each-ref',
      '--format=%(refname:short)%1f%(HEAD)%1f%(upstream:short)%1f%(upstream:track,nobracket)%1f%(objectname:short)%1f%(subject)',
      'refs/heads',
    ])
    const remote = await execGit(repo, [
      'for-each-ref',
      '--format=%(refname:short)%1f%(objectname:short)%1f%(subject)',
      'refs/remotes',
    ])
    const tags = await execGit(repo, ['for-each-ref', '--format=%(refname:short)%1f%(objectname:short)', 'refs/tags'])

    return {
      local: local.stdout
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map((line) => {
          const [name, head, upstream, track, hash, ...subject] = line.split('\x1f')

          return {
            name,
            isHead: head === '*',
            upstream,
            ahead: readTrack(track, 'ahead'),
            behind: readTrack(track, 'behind'),
            hash,
            subject: subject.join(' '),
          }
        }),
      remote: remote.stdout
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map((line) => {
          const [name, hash, ...subject] = line.split('\x1f')

          return { name, hash, subject: subject.join(' ') }
        }),
      tags: tags.stdout
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map((line) => {
          const [name, hash] = line.split('\x1f')

          return { name, hash }
        }),
    }
  },

  /** 仓库当前的多步操作状态，供客户端置灰相关动作。 */
  async state(repo) {
    return detectOperationState(repo)
  },
}
