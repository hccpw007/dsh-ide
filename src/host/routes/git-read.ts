/**
 * Git 只读方法：状态、文件差异、历史与分支。
 *
 * 只读命令全部允许非零退出码：`git diff` 有差异时退出码是 1，`rev-parse` 在非
 * 仓库目录会失败——这些都不是故障，由调用方按结果判断。
 */
import { bodyNumber, bodyString } from '../../common/http-body'
import { assertRef, blobExists, execGit, readBlobText, readWorktreeText, NETWORK_TIMEOUT } from '../services/git-service'

import {
  mergeFileStatus,
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

  /**
   * 某个引用与工作区之间的差异文件列表。
   *
   * 只比较已跟踪路径：未跟踪文件不属于任何引用，git diff 本身也不会列出它们，
   * 与 IDEA 的 Show Diff with Working Tree 一致。
   */
  async compareWorktree(repo, body) {
    const ref = assertRef(bodyString(body, 'ref'), 'Ref')
    const result = await execGit(repo, ['diff', '--name-status', ref], { allowFailure: true })

    return { files: parseNameStatus(result.stdout) }
  },

  /** 两个引用之间的差异文件列表；用于分支右键的 Compare with。 */
  async compareRefs(repo, body) {
    const left = assertRef(bodyString(body, 'left'), 'Left ref')
    const right = assertRef(bodyString(body, 'right'), 'Right ref')
    const result = await execGit(repo, ['diff', '--name-status', left, right], { allowFailure: true })

    return { files: parseNameStatus(result.stdout) }
  },

  /**
   * 单个文件在某个引用与工作区之间的两侧文本。
   *
   * 与 diffWorktree 的区别只在于基准可以换成任意引用，分支比较弹窗需要它。
   */
  async diffRef(repo, body) {
    const ref = assertRef(bodyString(body, 'ref'), 'Ref')
    const path = assertRef(bodyString(body, 'path'), 'Path')
    const isNew = !(await blobExists(repo, ref, path))
    const left = isNew ? '' : await readBlobText(repo, ref, path)
    // 删除的分支文件在工作区里已经不存在，右侧自然为空
    const right = (await readWorktreeText(repo, path, MAX_DIFF_BYTES)).text
    const bytes = Math.max(new TextEncoder().encode(left).byteLength, new TextEncoder().encode(right).byteLength)

    // 含 NUL 的文本几乎必然是二进制；直接交给客户端显示「不可比较」
    if (left.includes('\u0000') || right.includes('\u0000')) return { binary: true, bytes, left: '', right: '', isNew }

    return { binary: false, bytes, left, right, isNew }
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
    const [bodyResult, filesResult, statusesResult, branchesResult, headResult] = await Promise.all([
      execGit(repo, ['show', '--no-patch', '--format=%B', hash], { allowFailure: true }),
      // numstat 只给增删行数，状态要另跑一次 name-status，两者按路径合并
      execGit(repo, ['show', '--numstat', '--format=', hash], { allowFailure: true }),
      execGit(repo, ['show', '--name-status', '--format=', hash], { allowFailure: true }),
      execGit(repo, ['branch', '--all', '--contains', hash, '--format=%(refname:short)'], { allowFailure: true }),
      execGit(repo, ['rev-parse', '--abbrev-ref', 'HEAD'], { allowFailure: true }),
    ])
    const current = headResult.code === 0 ? headResult.stdout.trim() : ''
    const branches = parseContainsBranches(branchesResult.stdout)
    // HEAD 是「当前分支」的别名，只在当前分支确实包含该提交时显示
    const named = branches.includes(current) && current !== '' ? ['HEAD', ...branches] : branches

    return {
      commit: { ...parseCommit(meta.stdout.trim()), body: bodyResult.stdout.trim() },
      files: mergeFileStatus(parseNumstat(filesResult.stdout), parseNameStatus(statusesResult.stdout)),
      branches: named,
    }
  },

  /**
   * 待推送内容：当前分支、推送目标、未推送提交与待推送文件。
   *
   * 推送目标依次回退：用户在弹窗里选定的远端 → 已跟踪上游 → 远端同名分支 → 远端
   * 还没有该分支。最后一种是首次推送，此时以整个分支历史为区间——否则界面上明明是
   * 第一次推送，却会因为「没有可比对的基准」显示成没有任何待推送内容。
   */
  async pushPreview(repo, body) {
    const [branchResult, upstreamResult, remoteListResult] = await Promise.all([
      execGit(repo, ['rev-parse', '--abbrev-ref', 'HEAD'], { allowFailure: true }),
      execGit(repo, ['rev-parse', '--abbrev-ref', '@{u}'], { allowFailure: true }),
      execGit(repo, ['remote'], { allowFailure: true }),
    ])
    const branch = branchResult.code === 0 ? branchResult.stdout.trim() : ''
    const upstream = upstreamResult.code === 0 ? upstreamResult.stdout.trim() : ''
    const remotes = remoteListResult.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '')
    const preferred = bodyString(body, 'remote')

    if (branch === '') {
      return {
        branch,
        upstream,
        remote: '',
        target: '',
        isNewBranch: false,
        remotes,
        commits: [],
        files: [],
      }
    }

    // 选定的远端必须真实存在，否则回落到跟踪上游推导出的目标
    const target = await resolvePushTarget(
      repo,
      branch,
      upstream,
      remotes,
      remotes.includes(preferred) ? preferred : '',
    )
    const [logResult, filesResult] = await Promise.all([
      execGit(
        repo,
        [
          'log',
          target.exists ? `${target.ref}..HEAD` : 'HEAD',
          // 领先上游几千个提交时，一次拉全量会把解析与 JSON 序列化成本放大到秒级
          '--max-count=200',
          '--topo-order',
          '--date=iso-strict',
          '--abbrev=8',
          '--pretty=format:%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%P%x1f%D%x1f%s%x1e',
        ],
        { allowFailure: true },
      ),
      target.exists
        ? execGit(repo, ['diff', '--name-status', target.ref, 'HEAD'], { allowFailure: true })
        // 首次推送没有基准，直接列 HEAD 树，避免依赖特定哈希算法生成的空树对象
        : execGit(repo, ['ls-tree', '-r', '--name-only', 'HEAD'], { allowFailure: true }),
    ])

    return {
      branch,
      upstream,
      remote: target.remote,
      target: target.branch,
      isNewBranch: !target.exists,
      remotes,
      commits: parseLog(logResult.stdout),
      files: target.exists ? parseNameStatus(filesResult.stdout) : parseTreePaths(filesResult.stdout),
    }
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

/** 推送目标：远端名、远端分支名与用来取提交区间的引用。 */
interface PushTarget {
  /** 远端名，如 origin。 */
  remote: string
  /** 该远端上的分支名，如 main。 */
  branch: string
  /** 远端跟踪引用；远端还没有该分支时为空串。 */
  ref: string
  /** 远端是否已存在该分支。 */
  exists: boolean
}

/**
 * 判断一个引用是否指向真实提交。
 * @param repo 仓库根
 * @param ref 完整引用名
 * @returns 存在为 true
 */
async function refExists(repo: string, ref: string): Promise<boolean> {
  const result = await execGit(repo, ['rev-parse', '--verify', '--quiet', ref], { allowFailure: true })

  return result.code === 0
}

/**
 * 推导当前分支的推送目标。
 *
 * 用户在弹窗里选定了远端时以它为准；否则用已跟踪上游；没有上游时按
 * branch.<name>.remote / branch.<name>.merge 推出「首次推送将要创建的远端分支」，
 * 两者都没配置就落到第一个远端（通常是 origin）+ 当前分支名。
 * 推导只用于展示与取区间，不写入任何配置。
 * @param repo 仓库根
 * @param branch 当前分支
 * @param upstream 已跟踪上游的短名；没有时为空串
 * @param remotes 已配置的远端名
 * @param preferred 用户在弹窗里选定的远端；未选定时为空串
 * @returns 推送目标
 */
async function resolvePushTarget(
  repo: string,
  branch: string,
  upstream: string,
  remotes: string[],
  preferred: string,
): Promise<PushTarget> {
  const slash = upstream.indexOf('/')
  const [remoteResult, mergeResult] = await Promise.all([
    execGit(repo, ['config', '--get', `branch.${branch}.remote`], { allowFailure: true }),
    execGit(repo, ['config', '--get', `branch.${branch}.merge`], { allowFailure: true }),
  ])
  const configuredRemote = remoteResult.code === 0 ? remoteResult.stdout.trim() : ''
  const configuredMerge = mergeResult.code === 0 ? mergeResult.stdout.trim() : ''
  /** 目标分支名：上游短名 → branch.<name>.merge 的分支名 → 当前分支名。 */
  const name = slash > 0
    ? upstream.slice(slash + 1)
    : configuredMerge.startsWith('refs/heads/')
      ? configuredMerge.slice('refs/heads/'.length)
      : branch

  // 选定了别的远端：同一个分支名推送到该远端，区间改用它自己的远程跟踪引用
  if (preferred !== '') {
    const ref = `refs/remotes/${preferred}/${name}`

    return { remote: preferred, branch: name, ref, exists: await refExists(repo, ref) }
  }

  // 短名带 `/` 才是远程分支；跟踪本地分支时没有对应的远端可指
  if (slash > 0) {
    return {
      remote: upstream.slice(0, slash),
      branch: name,
      ref: `refs/remotes/${upstream}`,
      exists: true,
    }
  }

  // `.` 表示跟踪本地分支，不能当成远端名
  const remote = configuredRemote !== '' && configuredRemote !== '.' ? configuredRemote : (remotes[0] ?? 'origin')
  const ref = `refs/remotes/${remote}/${name}`

  return { remote, branch: name, ref, exists: await refExists(repo, ref) }
}

/**
 * 把 `git ls-tree --name-only` 的逐行路径转成待推送文件。
 *
 * 首次推送没有可比对的基准，这些文件相对远端而言全是新增。
 * @param text 命令输出
 * @returns 文件与状态
 */
function parseTreePaths(text: string): { path: string; status: string }[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((path) => ({ path, status: 'A' }))
}
