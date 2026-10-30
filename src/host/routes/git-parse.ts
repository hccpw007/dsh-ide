/**
 * Git 文本输出的解析工具。
 *
 * Git 的输出是文本协议：`status --porcelain=v1 -z` 用 NUL 分隔记录，`log` 用
 * `\x1f` / `\x1e` 分隔字段与记录。把解析集中在这里，方法表只关心调用与结果形状。
 */
import { GitError, assertRef } from '../services/git-service'

/** 工作区中的一个变更。 */
export interface StatusItem {
  /** 相对仓库根的路径。 */
  path: string
  /** 索引区状态字母。 */
  indexStatus: string
  /** 工作区状态字母。 */
  worktreeStatus: string
  /** 重命名/复制前的路径；没有时为 undefined。 */
  originalPath?: string
}

/** 分组后的仓库状态。 */
export interface ParsedStatus {
  /** 已暂存。 */
  staged: StatusItem[]
  /** 未暂存。 */
  unstaged: StatusItem[]
  /** 未跟踪。 */
  untracked: StatusItem[]
  /** 冲突。 */
  conflicted: StatusItem[]
}

/** 提交条目。 */
export interface CommitEntry {
  /** 完整 hash。 */
  hash: string
  /** 短 hash。 */
  shortHash: string
  /** 作者名。 */
  author: string
  /** 作者邮箱。 */
  email: string
  /** ISO 8601 时间。 */
  date: string
  /** 父提交。 */
  parents: string[]
  /** 引用标签（分支、远程分支、标签）。 */
  refs: string[]
  /** 标题。 */
  subject: string
}

/** 本地分支。 */
export interface LocalBranchEntry {
  /** 分支名。 */
  name: string
  /** 是否为当前检出分支。 */
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
export interface RefEntry {
  /** 引用短名。 */
  name: string
  /** 指向的短 hash。 */
  hash: string
  /** 指向提交的标题。 */
  subject: string
}

/**
 * 读取请求体里的路径数组。
 * @param body 请求体
 * @returns 校验后的路径列表
 */
export function readPaths(body: Record<string, unknown>): string[] {
  const raw = body.paths
  if (!Array.isArray(raw) || raw.length === 0) throw new GitError('GIT_FAILED', 'No file paths were provided')

  return raw.map((item) => assertRef(String(item), 'Path'))
}

/**
 * 判断一次冲突记录。
 *
 * 冲突的判定看索引区与工作区的组合，而不是单个字母：`DD`（双方都删）、`AU`、
 * `UD` 等都算冲突。
 * @param indexStatus 索引区状态
 * @param worktreeStatus 工作区状态
 * @returns 是否冲突
 */
function isConflict(indexStatus: string, worktreeStatus: string): boolean {
  return (
    indexStatus === 'U' ||
    worktreeStatus === 'U' ||
    (indexStatus === 'A' && worktreeStatus === 'A') ||
    (indexStatus === 'D' && worktreeStatus === 'D')
  )
}

/**
 * 解析 `git status --porcelain=v1 -z` 的输出。
 * @param text 标准输出
 * @returns 四组变更
 */
export function parseStatus(text: string): ParsedStatus {
  const parts = text.split('\0')
  const result: ParsedStatus = { staged: [], unstaged: [], untracked: [], conflicted: [] }

  for (let index = 0; index < parts.length; index += 1) {
    const record = parts[index]
    if (record === undefined || record.length < 4) continue

    const indexStatus = record[0] ?? ' '
    const worktreeStatus = record[1] ?? ' '
    const path = record.slice(3)
    const item: StatusItem = { path, indexStatus, worktreeStatus }

    // 重命名/复制记录把源路径放在紧随其后的那条记录里
    if (indexStatus === 'R' || indexStatus === 'C') {
      const original = parts[index + 1]
      if (original !== undefined) item.originalPath = original
      index += 1
    }

    if (isConflict(indexStatus, worktreeStatus)) {
      result.conflicted.push(item)

      continue
    }

    if (indexStatus === '?') {
      result.untracked.push(item)

      continue
    }

    if (indexStatus !== ' ') result.staged.push(item)
    if (worktreeStatus !== ' ') result.unstaged.push(item)
  }

  return result
}

/**
 * 解析单条 `log` 记录。
 * @param record `\x1f` 分隔的记录
 * @returns 提交信息
 */
export function parseCommit(record: string): CommitEntry {
  const fields = record.split('\x1f')

  return {
    hash: fields[0] ?? '',
    shortHash: fields[1] ?? '',
    author: fields[2] ?? '',
    email: fields[3] ?? '',
    date: fields[4] ?? '',
    parents: (fields[5] ?? '').split(' ').filter((item) => item !== ''),
    refs: normalizeRefs(fields[6] ?? ''),
    subject: fields[7] ?? '',
  }
}

/**
 * 把 `%D` 的引用描述转换成可展示的短名。
 *
 * `HEAD -> main` 只需要 `main`：HEAD 由分支树单独表达，重复显示会挤占提交标题。
 * @param raw `%D` 字段
 * @returns 引用短名列表
 */
function normalizeRefs(raw: string): string[] {
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '' && !item.startsWith('HEAD ->') && item !== 'HEAD')
    .map((item) => (item.startsWith('tag: ') ? item.slice(5) : item))
    .filter((item) => !item.endsWith('/HEAD'))
}

/**
 * 解析 `git log` 的 `\x1f` / `\x1e` 分隔输出。
 * @param text 标准输出
 * @returns 提交列表
 */
export function parseLog(text: string): CommitEntry[] {
  return text
    .split('\x1e')
    .map((record) => record.trim())
    .filter((record) => record !== '')
    .map((record) => parseCommit(record))
}

/**
 * 解析 `--numstat` 的逐文件统计。
 * @param text 标准输出
 * @returns 文件列表；二进制文件的增删列是 `-`，按 0 处理
 */
export function parseNumstat(text: string): { path: string; added: number; removed: number }[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => {
      const [added, removed, ...rest] = line.split('\t')

      return {
        path: rest.join('\t'),
        added: added === '-' ? 0 : Number(added) || 0,
        removed: removed === '-' ? 0 : Number(removed) || 0,
      }
    })
}

/**
 * 解析 `git diff --name-status` 输出。
 * @param text 每行「状态 \t 路径」的输出
 * @returns 文件的路径与状态字母
 */
export function parseNameStatus(text: string): { path: string; status: string }[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => {
      const [status, ...rest] = line.split('\t')
      // 重命名与复制形如 `R100\t旧路径\t新路径`：只有末段是被推送的新路径
      const path = rest.length === 0 ? '' : (rest[rest.length - 1] ?? '')

      return { path, status: (status ?? '').slice(0, 1) }
    })
    .filter((entry) => entry.path !== '')
}

/**
 * ahead / behind 的提取模式。
 *
 * 每个分支都要读这两个字段，原来每次调用都重新构造正则；字面量模式提到模块级，
 * 分支多时省掉成百次重复编译。
 */
const TRACK_PATTERNS: Record<'ahead' | 'behind', RegExp> = {
  ahead: /ahead (\d+)/u,
  behind: /behind (\d+)/u,
}

/**
 * 从 `upstream:track` 文本里读出 ahead/behind 数字。
 * @param track 形如 `ahead 2, behind 1` 的文本
 * @param label 要取的字段
 * @returns 数字；不存在时为 0
 */
export function readTrack(track: string | undefined, label: 'ahead' | 'behind'): number {
  if (track === undefined) return 0

  const match = TRACK_PATTERNS[label].exec(track)

  return match === null ? 0 : Number(match[1])
}

/**
 * 解析本地分支列表。
 * @param text `for-each-ref` 输出
 * @returns 本地分支
 */
export function parseLocalBranches(text: string): LocalBranchEntry[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => {
      const [name, head, upstream, track, hash, ...subject] = line.split('\x1f')

      return {
        name: name ?? '',
        isHead: head === '*',
        upstream: upstream ?? '',
        ahead: readTrack(track, 'ahead'),
        behind: readTrack(track, 'behind'),
        hash: hash ?? '',
        subject: subject.join(' '),
      }
    })
}

/**
 * 解析远程分支或标签列表。
 * @param text `for-each-ref` 输出
 * @param skipSymbolic 是否跳过 `origin/HEAD` 这类符号引用
 * @returns 引用列表
 */
export function parseRefList(text: string, skipSymbolic = false): RefEntry[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => {
      const [name, hash, ...subject] = line.split('\x1f')

      return { name: name ?? '', hash: hash ?? '', subject: subject.join(' ') }
    })
    .filter((entry) => !skipSymbolic || !entry.name.endsWith('/HEAD'))
}

/** 一条搁置记录。 */
export interface StashEntry {
  /** reflog 选择符，如 `stash@{0}`，同时是后续操作的定位串。 */
  selector: string
  /** reflog 标题，形如 `WIP on main: 3f139bb0 subject`。 */
  subject: string
  /** 相对时间，如 `2 hours ago`。 */
  date: string
  /** 搁置提交的完整 hash。 */
  hash: string
}

/**
 * 解析 `git stash list` 的输出。
 * @param text 每行一条记录的输出，字段以 `\x1f` 分隔
 * @returns 搁置记录列表，顺序与 `git stash list` 一致
 */
export function parseStashes(text: string): StashEntry[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => {
      const [selector, subject, date, hash] = line.split('\x1f')

      return { selector: selector ?? '', subject: subject ?? '', date: date ?? '', hash: hash ?? '' }
    })
    .filter((entry) => entry.selector !== '')
}

/**
 * 解析 `git branch --contains` 的分支短名。
 * @param text 每行一个分支名的输出
 * @returns 分支名列表
 */
export function parseContainsBranches(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim().replace(/^\* /, ''))
    .filter((line) => line !== '' && line !== '(HEAD detached at HEAD)')
}
