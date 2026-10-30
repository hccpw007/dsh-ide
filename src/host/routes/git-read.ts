/**
 * Git 只读方法：状态、文件差异、历史与分支。
 *
 * 只读命令全部允许非零退出码：`git diff` 有差异时退出码是 1，`rev-parse` 在非
 * 仓库目录会失败——这些都不是故障，由调用方按结果判断。
 */
import { bodyNumber, bodyString } from '../../common/http-body'
import { assertRef, blobExists, execGit, readBlobText, readWorktreeText, NETWORK_TIMEOUT } from '../services/git-service'

import {
  parseCommit,
  parseContainsBranches,
  parseLocalBranches,
  parseLog,
  parseNameStatus,
  parseNumstat,
  parseRefList,
  parseStashes,
  parseStatus,
} from './git-parse'

/** 差异文本的读取上限；超过它只展示大小，不在面板里塞几百 MB 的文本。 */
const MAX_DIFF_BYTES = 2 * 1024 * 1024

/** 只读方法实现表。 */
export const READ_METHODS: Record<string, (repo: string, body: Record<string, unknown>) => Promise<unknown>> = {
  /** 工作区状态与当前分支。 */
  async status(repo) {
    const [statusResult, branchResult, headResult, ignoredResult] = await Promise.all([
      execGit(repo, ['status', '--porcelain=v1', '-z', '--untracked-files=all']),
      execGit(repo, ['rev-parse', '--abbrev-ref', 'HEAD'], { allowFailure: true }),
      execGit(repo, ['rev-parse', '--short=8', 'HEAD'], { allowFailure: true }),
      // --directory 让被忽略的目录只出现一行（如 node_modules/），不会把里面上万个文件铺开
      execGit(repo, ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z'], {
        allowFailure: true,
      }),
    ])
    const branch = branchResult.code === 0 ? branchResult.stdout.trim() : ''

    return {
      branch,
      headShort: headResult.code === 0 ? headResult.stdout.trim() : '',
      ...parseStatus(statusResult.stdout),
      // 目录条目以 / 结尾，客户端据此做前缀匹配
      ignored: ignoredResult.stdout.split('\0').filter((path) => path !== ''),
    }
  },

  /**
   * 工作区文件差异：HEAD（或索引区）与工作区两侧的完整文本。
   *
   * 新增文件在 HEAD 里没有旧版本，右侧一律取工作区内容：索引区可能还是空的 blob
   * （先 add 空文件再写内容），拿它当右侧会让整个文件看起来「没有改动」。
   */
  async diffWorktree(repo, body) {
    const path = assertRef(bodyString(body, 'path'), 'Path')
    const staged = bodyString(body, 'staged') === 'true'
    const isNew = !(await blobExists(repo, 'HEAD', path))
    const left = isNew ? '' : await readBlobText(repo, 'HEAD', path)
    const right = isNew
      ? (await readWorktreeText(repo, path, MAX_DIFF_BYTES)).text
      : staged
        ? await readBlobText(repo, '', path)
        : (await readWorktreeText(repo, path, MAX_DIFF_BYTES)).text
    const bytes = Math.max(new TextEncoder().encode(left).byteLength, new TextEncoder().encode(right).byteLength)

    // 含 NUL 的文本几乎必然是二进制；直接交给客户端显示「不可比较」
    if (left.includes('\u0000') || right.includes('\u0000')) return { binary: true, bytes, left: '', right: '', isNew }

    return { binary: false, bytes, left, right, isNew }
  },

  /** 某个 ref 里某个文件的完整文本；编辑器差异标签使用。 */
  async showFileText(repo, body) {
    const hash = bodyString(body, 'hash')
    const path = bodyString(body, 'path')

    // 空路径表示整个提交，不存在「文件正文」；返回空串让差异渲染器走单侧空
    if (path === '') return { text: '' }

    return { text: await readBlobText(repo, hash === '' ? 'HEAD' : hash, path) }
  },

  /** 索引区里某个文件的完整文本（用于暂存差异的右侧）。 */
  async indexFileText(repo, body) {
    const path = assertRef(bodyString(body, 'path'), 'Path')

    return { text: await readBlobText(repo, '', path) }
  },

  /** 提交历史。 */
  async log(repo, body) {
    const limit = Math.min(Math.max(bodyNumber(body, 'limit') ?? 200, 1), 500)
    const skip = Math.max(bodyNumber(body, 'skip') ?? 0, 0)
    const branch = bodyString(body, 'branch')
    const path = bodyString(body, 'path')
    const all = bodyString(body, 'all') === 'true'
    const args = [
      'log',
      `--max-count=${String(limit)}`,
      `--skip=${String(skip)}`,
      // 拓扑序把同一分支的提交排在一起。默认的日期序会让各分支的提交互相交错，
      // 分支图因此被拆成一堆互不相干的长线，与 IDEA 的观感差很远
      '--topo-order',
      '--date=iso-strict',
      '--abbrev=8',
      '--pretty=format:%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%P%x1f%D%x1f%s%x1e',
    ]

    if (all) args.push('--all')
    else if (branch !== '') args.push(assertRef(branch, 'Branch'))
    if (path !== '') args.push('--', assertRef(path, 'Path'))
    else args.push('--')

    const result = await execGit(repo, args, { allowFailure: true, timeoutMs: NETWORK_TIMEOUT })

    return { commits: parseLog(result.stdout) }
  },

  /** 单个提交的详情、逐文件统计与包含它的分支。 */
  async commitDetail(repo, body) {
    const hash = assertRef(bodyString(body, 'hash'), 'Commit')
    const meta = await execGit(repo, [
      'show',
      '--no-patch',
      '--date=iso-strict',
      '--abbrev=8',
      '--pretty=format:%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%P%x1f%D%x1f%s',
      hash,
    ])
    const [bodyResult, filesResult, branchesResult, headResult] = await Promise.all([
      execGit(repo, ['show', '--no-patch', '--format=%B', hash], { allowFailure: true }),
      execGit(repo, ['show', '--numstat', '--format=', hash], { allowFailure: true }),
      execGit(repo, ['branch', '--all', '--contains', hash, '--format=%(refname:short)'], { allowFailure: true }),
      execGit(repo, ['rev-parse', '--abbrev-ref', 'HEAD'], { allowFailure: true }),
    ])
    const current = headResult.code === 0 ? headResult.stdout.trim() : ''
    const branches = parseContainsBranches(branchesResult.stdout)
    // HEAD 是「当前分支」的别名，只在当前分支确实包含该提交时显示
    const named = branches.includes(current) && current !== '' ? ['HEAD', ...branches] : branches

    return {
      commit: { ...parseCommit(meta.stdout.trim()), body: bodyResult.stdout.trim() },
      files: parseNumstat(filesResult.stdout),
      branches: named,
    }
  },

  /**
   * 待推送内容：当前分支、上游短名、未推送提交与待推送文件。
   *
   * 上游分支缺失时没有可比对的区间，返回空列表交给客户端显示空状态，
   * 不把「分支还没跟踪远端」当成错误。
   */
  async pushPreview(repo) {
    const [branchResult, upstreamResult] = await Promise.all([
      execGit(repo, ['rev-parse', '--abbrev-ref', 'HEAD'], { allowFailure: true }),
      execGit(repo, ['rev-parse', '--abbrev-ref', '@{u}'], { allowFailure: true }),
    ])
    const branch = branchResult.code === 0 ? branchResult.stdout.trim() : ''
    const upstream = upstreamResult.code === 0 ? upstreamResult.stdout.trim() : ''

    if (upstream === '') return { branch, upstream, commits: [], files: [] }

    const [logResult, filesResult] = await Promise.all([
      execGit(
        repo,
        [
          'log',
          '@{u}..HEAD',
          // 领先上游几千个提交时，一次拉全量会把解析与 JSON 序列化成本放大到秒级
          '--max-count=200',
          '--topo-order',
          '--date=iso-strict',
          '--abbrev=8',
          '--pretty=format:%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%P%x1f%D%x1f%s%x1e',
        ],
        { allowFailure: true },
      ),
      execGit(repo, ['diff', '--name-status', '@{u}', 'HEAD'], { allowFailure: true }),
    ])

    return { branch, upstream, commits: parseLog(logResult.stdout), files: parseNameStatus(filesResult.stdout) }
  },

  /** 本地分支、远程分支与标签。 */
  async branches(repo) {
    const [local, remote, tags, head] = await Promise.all([
      execGit(repo, [
        'for-each-ref',
        '--format=%(refname:short)%1f%(HEAD)%1f%(upstream:short)%1f%(upstream:track,nobracket)%1f%(objectname:short=8)%1f%(subject)',
        'refs/heads',
      ]),
      execGit(repo, [
        'for-each-ref',
        '--format=%(refname:short)%1f%(objectname:short=8)%1f%(subject)',
        'refs/remotes',
      ]),
      execGit(repo, ['for-each-ref', '--format=%(refname:short)%1f%(objectname:short=8)%1f%(subject)', 'refs/tags']),
      execGit(repo, ['rev-parse', '--abbrev-ref', 'HEAD'], { allowFailure: true }),
    ])

    return {
      head: head.code === 0 ? head.stdout.trim() : '',
      local: parseLocalBranches(local.stdout),
      remote: parseRefList(remote.stdout, true),
      tags: parseRefList(tags.stdout),
    }
  },

  /** 搁置列表；没有搁置时返回空数组。 */
  async stashes(repo) {
    const result = await execGit(
      repo,
      ['stash', 'list', '--format=%gd%1f%gs%1f%cr%1f%H'],
      // 没有 stash 或不是仓库都不是故障，交给调用方按空列表处理
      { allowFailure: true },
    )

    return { stashes: parseStashes(result.stdout) }
  },
}
