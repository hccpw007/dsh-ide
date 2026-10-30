/**
 * 宿主侧 Git 能力底座。
 *
 * Git 一律以 `spawn('git', argv)` 执行，不经过 shell：文件名里的空格、引号与中文
 * 都不会被二次解释，参数注入从根上被排除。
 *
 * 写操作按仓库串行排队。同一个仓库里并发执行 merge / rebase / commit 会互相破坏
 * 索引，排队是正确性要求，不是性能优化。
 */
import { spawn } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import { resolve, sep } from 'node:path'

/** 单次调用的输出上限；`log -p` 之类在巨型仓库里可以是几百 MB。 */
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024

/** 本地操作超时。 */
const DEFAULT_TIMEOUT_MS = 30_000

/** 网络操作（fetch / pull / push）超时。 */
const NETWORK_TIMEOUT_MS = 180_000

/** Git 调用的稳定错误码；展示文案由客户端按语言包翻译。 */
export type GitErrorCode =
  | 'GIT_NOT_INSTALLED'
  | 'GIT_FAILED'
  | 'GIT_TIMEOUT'
  | 'GIT_OUTPUT_TOO_LARGE'
  | 'GIT_PATH_OUTSIDE_REPOSITORY'

/** Git 执行失败，携带可诊断的原始输出。 */
export class GitError extends Error {
  /**
   * @param code 稳定错误码
   * @param message 诊断信息
   * @param stderr Git 的原始错误输出
   */
  constructor(
    readonly code: GitErrorCode,
    message: string,
    readonly stderr = '',
  ) {
    super(message)
    this.name = 'GitError'
  }
}

/** 一次 Git 调用的结果。 */
export interface GitResult {
  /** 标准输出。 */
  stdout: string
  /** 标准错误；Git 把进度与警告写在 stderr。 */
  stderr: string
  /** 退出码。 */
  code: number
}

/** 各仓库的排队尾部：键是仓库根，值是最后一条命令的完成 Promise。 */
const queues = new Map<string, Promise<unknown>>()

/**
 * 在指定仓库上串行执行一个任务。
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
 * 以 `argv` 数组执行一条 Git 命令。
 * @param repo 工作目录
 * @param argv 参数数组，不含 `git`
 * @param options 超时与是否允许非零退出码
 * @returns 输出、退出码与原始参数
 */
export function execGit(
  repo: string,
  argv: string[],
  options: { timeoutMs?: number; allowFailure?: boolean } = {},
): Promise<GitResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  return new Promise<GitResult>((resolvePromise, reject) => {
    let child: ReturnType<typeof spawn>

    try {
      // GIT_OPTIONAL_LOCKS=0 避免只读命令去抢索引锁，与 IDE 并行打开时更安全
      child = spawn('git', argv, { cwd: repo, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } })
    } catch (error) { // git 不存在时 spawn 直接抛错
      reject(new GitError('GIT_NOT_INSTALLED', `Unable to start git: ${String(error)}`))

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
      reject(new GitError('GIT_TIMEOUT', `git ${argv.join(' ')} timed out`))
    }, timeoutMs)

    // 长间隔定时器不应单独把进程钉在事件循环里
    timer.unref?.()

    child.stdout?.on('data', (chunk: Buffer) => {
      bytes += chunk.byteLength

      if (bytes > MAX_OUTPUT_BYTES) {
        if (!settled) {
          settled = true
          clearTimeout(timer)
          child.kill('SIGKILL')
          reject(new GitError('GIT_OUTPUT_TOO_LARGE', 'git output exceeded the size limit'))
        }

        return
      }

      out.push(chunk)
    })

    child.stderr?.on('data', (chunk: Buffer) => err.push(chunk))

    child.on('error', (error) => {
      if (settled) return

      settled = true
      clearTimeout(timer)
      reject(new GitError('GIT_NOT_INSTALLED', `git failed to start: ${String(error)}`))
    })

    child.on('close', (code) => {
      if (settled) return

      settled = true
      clearTimeout(timer)

      const stdout = Buffer.concat(out).toString('utf8')
      const stderr = Buffer.concat(err).toString('utf8')

      if (code !== 0 && options.allowFailure !== true) {
        reject(new GitError('GIT_FAILED', stderr.trim() || `git ${argv[0] ?? ''} failed`, stderr))

        return
      }

      resolvePromise({ stdout, stderr, code: code ?? 0 })
    })
  })
}

/**
 * 把参数数组拼成可展示的命令行。
 *
 * 只用于控制台回显，不参与执行；含空格或特殊字符的参数加双引号，保证复制出来
 * 的文本与真实执行一致。
 * @param argv 参数数组
 * @returns 以 `git` 开头的命令行
 */
export function displayCommand(argv: string[]): string {
  const quoted = argv.map((item) =>
    /^[A-Za-z0-9_./:=@+^~-]+$/.test(item) ? item : `"${item.replace(/"/g, '\\"')}"`,
  )

  return `git ${quoted.join(' ')}`
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
    console.error('[dsh-ide] Failed to resolve repository:', cwd, error)

    return undefined
  }
}

/**
 * 校验一个 ref 或路径参数。
 *
 * argv 数组已杜绝命令注入，但 `--upload-pack=...` 这类以连字符开头的值仍会被 git
 * 当成选项解释，因此一律拒绝。
 * @param value 用户传入的 ref 或路径
 * @param label 字段名，用于错误提示
 * @returns 原值
 */
export function assertRef(value: string, label: string): string {
  if (value === '' || value.startsWith('-') || /[\0\n\r]/.test(value)) {
    throw new GitError('GIT_FAILED', `${label} is not a valid value`)
  }

  return value
}

/**
 * 把仓库内相对路径解析成绝对路径，并校验没有越出仓库。
 * @param repo 仓库根
 * @param relative 相对路径
 * @returns 绝对路径
 */
export function resolveInside(repo: string, relative: string): string {
  const target = resolve(repo, assertRef(relative, 'Path'))

  if (target !== repo && !target.startsWith(repo + sep)) {
    throw new GitError('GIT_PATH_OUTSIDE_REPOSITORY', 'Path is outside the repository')
  }

  return target
}

/**
 * 读取工作区文件文本。
 *
 * 只读小文件：超过上限的文本交给差异视图展示「过大」，避免宿主被一个 500MB 的
 * 日志文件拖住。
 * @param repo 仓库根
 * @param relative 相对路径
 * @param maxBytes 可读取上限
 * @returns 文本与字节数；文件不存在时文本为空串
 */
export async function readWorktreeText(
  repo: string,
  relative: string,
  maxBytes: number,
): Promise<{ text: string; bytes: number }> {
  const target = resolveInside(repo, relative)

  try {
    const info = await stat(target)

    // 目录不是可比较的文件内容，交给上层按空文件处理
    if (!info.isFile()) return { text: '', bytes: 0 }
    if (info.size > maxBytes) return { text: '', bytes: info.size }

    const buffer = await readFile(target)

    return { text: buffer.toString('utf8'), bytes: buffer.byteLength }
  } catch (error) { // 文件被删除是差异的常见一侧，不当作故障
    const code = (error as NodeJS.ErrnoException).code

    if (code !== 'ENOENT') console.error('[dsh-ide] Failed to read worktree file:', target, error)

    return { text: '', bytes: 0 }
  }
}

/**
 * 读取某个 ref 下的文件文本。
 * @param repo 仓库根
 * @param ref 提交或引用；空串表示索引区
 * @param relative 相对路径
 * @returns 文本；该 ref 下没有此文件时为空串
 */
export async function readBlobText(repo: string, ref: string, relative: string): Promise<string> {
  const object = ref === '' ? `:${assertRef(relative, 'Path')}` : `${assertRef(ref, 'Ref')}:${assertRef(relative, 'Path')}`
  const result = await execGit(repo, ['show', object], { allowFailure: true })

  return result.code === 0 ? result.stdout : ''
}

/**
 * 判断某个 ref 下是否存在该路径。
 *
 * 差异视图据此区分「新增文件」与「已有文件」：新增文件在该 ref 里没有旧版本，
 * 右侧要取工作区内容，而不是索引区里可能还是空 blob 的那份。
 * @param repo 仓库根
 * @param ref 提交或引用
 * @param relative 相对路径
 * @returns 是否存在
 */
export async function blobExists(repo: string, ref: string, relative: string): Promise<boolean> {
  const object = `${assertRef(ref, 'Ref')}:${assertRef(relative, 'Path')}`
  const result = await execGit(repo, ['cat-file', '-e', object], { allowFailure: true })

  return result.code === 0
}

/** 网络操作使用的超时，供写方法显式传入。 */
export const NETWORK_TIMEOUT = NETWORK_TIMEOUT_MS
