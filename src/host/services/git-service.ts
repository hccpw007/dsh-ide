/**
 * 宿主侧 git 服务。
 *
 * 所有 git 调用都走 `spawn('git', argv)` 数组形式，不经 shell，因此文件名里的空格、
 * 引号、中文都不会被二次解释。写操作按仓库串行排队：同一个仓库的 `merge`、`rebase`
 * 与 `commit` 并发执行会互相破坏索引，排队是正确性要求而非性能优化。
 *
 * 输出有上限与超时：`log -p` 之类的命令在巨型仓库里可以是几百 MB，不能让宿主进程
 * 被一次点击拖垮。
 */
import { spawn } from 'node:child_process'

/** 单次 git 调用输出上限。 */
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024

/** 常规命令超时。 */
const DEFAULT_TIMEOUT_MS = 30_000

/** git 执行失败。 */
export class GitError extends Error {
  /**
   * @param code 稳定错误码
   * @param message 诊断信息
   * @param stderr git 的原始错误输出
   */
  constructor(
    readonly code: 'GIT_NOT_INSTALLED' | 'GIT_FAILED' | 'GIT_TIMEOUT' | 'GIT_OUTPUT_TOO_LARGE' | 'GIT_NOT_REPOSITORY',
    message: string,
    readonly stderr = '',
  ) {
    super(message)
    this.name = 'GitError'
  }
}

/** 一次 git 调用的结果。 */
export interface GitResult {
  /** 进程标准输出。 */
  stdout: string
  /** 进程标准错误。 */
  stderr: string
  /** 退出码。 */
  code: number
}

/** 各仓库的排队尾部：键是仓库根，值是最后一条命令的完成 Promise。 */
const queues = new Map<string, Promise<unknown>>()

/**
 * 在指定仓库上串行执行一个任务。
 *
 * 串行化的粒度是仓库而不是全局：不同仓库的操作互不阻塞。
 * @param repo 仓库根
 * @param task 待执行任务
 * @returns 任务结果
 */
export function serialized<T>(repo: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(repo) ?? Promise.resolve()
  const next = previous.then(task, task)

  // 队列只关心「上一件事结束」，成功失败都要继续，因此登记一份吞掉错误的副本
  queues.set(
    repo,
    next.catch(() => undefined),
  )

  return next
}

/**
 * 执行一条 git 命令。
 * @param repo 工作目录
 * @param argv 参数数组，不含 `git` 本身
 * @param options 超时与是否允许非零退出码
 * @returns 标准输出、标准错误与退出码
 */
export function execGit(
  repo: string,
  argv: string[],
  options: { timeoutMs?: number; allowFailure?: boolean } = {},
): Promise<GitResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  return new Promise<GitResult>((resolve, reject) => {
    let child

    try {
      child = spawn('git', argv, { cwd: repo, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } })
    } catch (error) { // git 不存在时 spawn 直接抛错
      reject(new GitError('GIT_NOT_INSTALLED', `无法启动 git: ${String(error)}`))

      return
    }

    const out: Buffer[] = []
    const err: Buffer[] = []
    let bytes = 0
    let settled = false

    const timer = setTimeout(() => {
      if (settled) return

      settled = true
      child.kill('SIGKILL')
      reject(new GitError('GIT_TIMEOUT', `git 命令超时: git ${argv.join(' ')}`))
    }, timeoutMs)

    // 长间隔定时器不应单独把进程钉在事件循环里
    timer.unref?.()

    child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.byteLength

      if (bytes > MAX_OUTPUT_BYTES) {
        if (!settled) {
          settled = true
          clearTimeout(timer)
          child.kill('SIGKILL')
          reject(new GitError('GIT_OUTPUT_TOO_LARGE', 'git 输出超过上限'))
        }

        return
      }

      out.push(chunk)
    })

    child.stderr.on('data', (chunk: Buffer) => err.push(chunk))

    child.on('error', (error) => {
      if (settled) return

      settled = true
      clearTimeout(timer)
      reject(new GitError('GIT_NOT_INSTALLED', `git 启动失败: ${String(error)}`))
    })

    child.on('close', (code) => {
      if (settled) return

      settled = true
      clearTimeout(timer)

      const stdout = Buffer.concat(out).toString('utf8')
      const stderr = Buffer.concat(err).toString('utf8')

      if (code !== 0 && options.allowFailure !== true) {
        reject(new GitError('GIT_FAILED', stderr.trim() || `git ${argv[0]} 失败`, stderr))

        return
      }

      resolve({ stdout, stderr, code: code ?? 0 })
    })
  })
}

/**
 * 找到工作区所属仓库的根。
 * @param cwd 工作区根
 * @returns 仓库根；不是仓库时返回 undefined
 */
export async function resolveRepository(cwd: string): Promise<string | undefined> {
  try {
    const result = await execGit(cwd, ['rev-parse', '--show-toplevel'], { allowFailure: true })

    return result.code === 0 ? result.stdout.trim() : undefined
  } catch (error) { // git 缺失时按「不是仓库」处理，由调用方统一提示
    console.error('[dsh-ide] 探测仓库失败:', cwd, error)

    return undefined
  }
}

/**
 * 确认一个 ref 参数安全。
 *
 * argv 数组已杜绝注入，但 `--upload-pack=...` 这类「以连字符开头」的参数仍会被 git
 * 当成选项解释，因此所有 ref 都必须在前面加 `--` 分隔，这里再兜一层。
 * @param value 用户传入的 ref 或路径
 * @param label 字段名，用于错误提示
 * @returns 原值
 */
export function assertRef(value: string, label: string): string {
  if (value === '' || value.startsWith('-') || /[\0\n\r]/.test(value)) {
    throw new GitError('GIT_FAILED', `${label} 不合法`)
  }

  return value
}

/**
 * 判断仓库当前是否处于未结束的多步操作中。
 * @param repo 仓库根
 * @returns 各状态的检测结果
 */
export async function detectOperationState(
  repo: string,
): Promise<{ merging: boolean; rebasing: boolean; cherryPicking: boolean; reverting: boolean; conflicts: boolean }> {
  const gitDir = (await execGit(repo, ['rev-parse', '--absolute-git-dir'])).stdout.trim()

  const exists = async (relative: string): Promise<boolean> => {
    const info = await import('node:fs/promises').then((module) => module.stat(`${gitDir}/${relative}`).catch(() => undefined))

    return info !== undefined
  }

  const [merging, rebasing, cherryPicking, reverting, conflicts] = await Promise.all([
    exists('MERGE_HEAD'),
    exists('rebase-merge').then(async (value) => value || exists('rebase-apply')),
    exists('CHERRY_PICK_HEAD'),
    exists('REVERT_HEAD'),
    execGit(repo, ['diff', '--name-only', '--diff-filter=U'], { allowFailure: true }).then(
      (result) => result.stdout.trim() !== '',
    ),
  ])

  return { merging, rebasing, cherryPicking, reverting, conflicts }
}
