/**
 * Git 输出的解析工具。
 *
 * `git` 的输出是文本协议：`log` 用 `\x1f` / `\x1e` 分隔字段与记录，`branch` 的
 * `upstream:track` 是半结构化文本。把解析集中在这里，方法表只关心调用与结果形状。
 */
import { assertRef, GitError } from '../services/git-service'

/** 状态条目。 */
export interface StatusItem {
  /** 相对仓库根的路径。 */
  path: string
  /** 索引区状态字母。 */
  indexStatus: string
  /** 工作区状态字母。 */
  worktreeStatus: string
}

/** 提交条目。 */
export interface CommitEntry {
  hash: string
  shortHash: string
  author: string
  email: string
  date: string
  parents: string[]
  refs: string[]
  subject: string
}

/**
 * 读取请求体里的路径数组。
 * @param body 请求体
 * @returns 校验后的路径列表
 */
export function readPaths(body: Record<string, unknown>): string[] {
  const raw = body.paths
  if (!Array.isArray(raw) || raw.length === 0) throw new GitError('GIT_FAILED', '缺少文件路径')

  return raw.map((item) => assertRef(String(item), '路径'))
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
 * 解析单条提交记录。
 * @param record `\x1f` 分隔的记录
 * @returns 提交信息
 */
export function parseCommit(record: string): CommitEntry & { body: string } {
  const fields = record.split('\x1f')

  return {
    hash: fields[0] ?? '',
    shortHash: fields[1] ?? '',
    author: fields[2] ?? '',
    email: fields[3] ?? '',
    date: fields[4] ?? '',
    parents: (fields[5] ?? '').split(' ').filter((item) => item !== ''),
    refs: (fields[6] ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item !== ''),
    subject: fields[7] ?? '',
    body: fields[8] ?? '',
  }
}

/**
 * 从 `upstream:track` 文本里读出 ahead/behind 数字。
 * @param track 形如 `ahead 2, behind 1` 的文本
 * @param label 要取的字段
 * @returns 数字；不存在时为 0
 */
export function readTrack(track: string | undefined, label: 'ahead' | 'behind'): number {
  if (track === undefined) return 0

  const match = new RegExp(`${label} (\\d+)`).exec(track)

  return match === null ? 0 : Number(match[1])
}
