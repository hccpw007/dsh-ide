/**
 * 宿主侧运行配置进程服务。
 *
 * 用户在表单里写的是「一条完整命令」，例如 `pnpm dev` 或 `A=1 pnpm build && pnpm start`。
 * 这类写法必须交给 shell 解释，否则 `&&`、变量赋值、管道全部失效。因此固定用
 * `[shell, '-lc', command]`：命令串始终是数组里的**一个元素**，不经过任何字符串拼接，
 * 既支持用户日常写法，又不引入注入面（设计 11.1）。
 *
 * 输出进环形缓冲：进程可能连续打印几百 MB，客户端只增量拉取，宿主只保留最近一段。
 */
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'

import type { RunConfig } from './settings-service'

/** 每个进程保留的输出字节上限。 */
const MAX_BUFFER_BYTES = 512 * 1024

/** 停止进程的宽限期，超时后升级为 SIGKILL。 */
const KILL_GRACE_MS = 3000

/** 单个运行实例。 */
export interface RunProcess {
  /** 实例 id：同一配置可以并行多个实例，因此不能只按配置 id 区分。 */
  id: string
  /** 配置 id。 */
  configId: string
  /** 配置名称。 */
  name: string
  /** 完整命令串。 */
  command: string
  /** 工作目录。 */
  cwd: string
  /** 进程状态。 */
  state: 'running' | 'exited' | 'failed'
  /** 退出码；运行中为 null。 */
  exitCode: number | null
  /** 启动时间（毫秒）。 */
  startedAt: number
  /** 结束时间（毫秒）；运行中为 null。 */
  endedAt: number | null
  /** 启动失败的原因。 */
  error?: string
  /** 已输出的字节总数，客户端据此做增量拉取。 */
  bytes: number
}

/** 进程表：键是实例 id。 */
const processes = new Map<string, RunProcess>()

/** 一个实例的输出缓冲。 */
interface OutputBuffer {
  /** 保留的输出分块，按时间顺序；追加只 push，不做整段拼接。 */
  chunks: string[]
  /** 当前仍保留的分块字节数，用于裁剪时只做减法。 */
  retainedBytes: number
  /** 累计写出的字节总数（含已丢弃的部分），客户端据此做增量拉取。 */
  bytes: number
  /** 分块合并后的文本缓存；undefined 表示需要重建。 */
  text: string | undefined
}

/** 运行缓冲：键是实例 id。 */
const buffers = new Map<string, OutputBuffer>()

/** 子进程句柄：键是实例 id。 */
const children = new Map<string, ReturnType<typeof spawn>>()

/** 实例 id 的自增序号。 */
let sequence = 0

/**
 * 选择执行命令的 shell。
 *
 * 优先用户设置，其次是环境变量 `SHELL`，最后 `/bin/sh`；与设计 11.1 的顺序一致。
 * @param configured 用户设置的 shell 路径
 * @returns shell 可执行文件路径
 */
function shellPath(configured: string): string {
  if (configured !== '') return configured

  const fromEnv = process.env.SHELL
  if (fromEnv !== undefined && fromEnv !== '') return fromEnv

  return process.platform === 'win32' ? 'cmd.exe' : '/bin/sh'
}

/**
 * 向环形缓冲追加输出。
 *
 * 高频输出的进程每秒可能来上千块，因此这里只做 push 与计数：超限时从头整块丢弃，
 * 代价与丢弃的块数成正比。若每块都拼接并切片 512KB，光内存拷贝就能吃满一个核。
 * @param id 实例 id
 * @param chunk 新输出
 */
function appendOutput(id: string, chunk: string): void {
  const current = buffers.get(id) ?? { chunks: [], retainedBytes: 0, bytes: 0, text: '' }
  const chunkBytes = Buffer.byteLength(chunk)

  current.chunks.push(chunk)
  current.retainedBytes += chunkBytes
  current.bytes += chunkBytes
  current.text = undefined

  // 至少保留最新一块：单个 chunk 本身超上限时不丢它，否则客户端永远拿不到内容
  while (current.retainedBytes > MAX_BUFFER_BYTES && current.chunks.length > 1) {
    const dropped = current.chunks.shift() ?? ''

    current.retainedBytes -= Buffer.byteLength(dropped)
  }

  buffers.set(id, current)

  const record = processes.get(id)
  if (record !== undefined) record.bytes += chunkBytes
}

/**
 * 取缓冲的合并文本；分块变化后只重建一次，后续轮询直接复用。
 * @param buffer 输出缓冲
 * @returns 当前保留的全部文本
 */
function bufferTextOf(buffer: OutputBuffer): string {
  if (buffer.text === undefined) buffer.text = buffer.chunks.join('')

  return buffer.text
}

/**
 * 读取某个实例从指定字节位置开始的输出。
 *
 * 客户端保存「已消费字节数」，宿主按缓冲区现状回给增量；缓冲被裁剪时返回整段，
 * 由客户端按自身长度判断是否重绘。
 * @param id 实例 id
 * @param offset 客户端已消费的字节数
 * @returns 增量文本与最新字节数
 */
export function readOutput(id: string, offset: number): { text: string; bytes: number; overflowed: boolean } {
  const buffer = buffers.get(id)

  if (buffer === undefined) return { text: '', bytes: 0, overflowed: false }

  // 没有新输出是轮询的常态，此时不需要合并分块，直接空返回
  if (offset >= buffer.bytes) return { text: '', bytes: buffer.bytes, overflowed: false }

  const text = bufferTextOf(buffer)
  const available = buffer.bytes - Math.max(0, offset)
  const overflowed = available > Buffer.byteLength(text)

  // 缓冲按字符裁剪，精确的「从第 N 字节开始」只能近似：裁剪过就整段重发
  const charOffset = overflowed ? 0 : Math.max(0, text.length - (buffer.bytes - offset))

  return { text: text.slice(charOffset), bytes: buffer.bytes, overflowed }
}

/**
 * 列出全部实例。
 * @returns 实例元信息（不含输出）
 */
export function listProcesses(): RunProcess[] {
  return [...processes.values()].sort((left, right) => right.startedAt - left.startedAt)
}

/**
 * 启动一个运行配置。
 * @param config 配置
 * @param settingsShell 用户设置的 shell 路径
 * @returns 新建的实例
 */
export function startRun(config: RunConfig, settingsShell: string): RunProcess {
  sequence += 1

  const id = `run-${Date.now()}-${sequence}`
  const record: RunProcess = {
    id,
    configId: config.id,
    name: config.name,
    command: config.command,
    cwd: config.cwd === '' ? homedir() : config.cwd,
    state: 'running',
    exitCode: null,
    startedAt: Date.now(),
    endedAt: null,
    bytes: 0,
  }

  processes.set(id, record)
  buffers.set(id, { chunks: [], retainedBytes: 0, bytes: 0, text: '' })

  const child = spawn(shellPath(settingsShell), ['-lc', config.command], {
    cwd: record.cwd,
    env: { ...process.env, FORCE_COLOR: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  children.set(id, child)

  child.stdout?.setEncoding('utf8')
  child.stderr?.setEncoding('utf8')

  child.stdout?.on('data', (chunk: string) => appendOutput(id, chunk))
  child.stderr?.on('data', (chunk: string) => appendOutput(id, chunk))

  child.on('error', (error) => {
    // 启动失败（命令不存在、无权限）要落到可读文案，而不是让界面一直转圈
    appendOutput(id, `\n[dsh-ide] Failed to start: ${error.message}\n`)
    record.state = 'failed'
    record.error = error.message
    record.endedAt = Date.now()
    children.delete(id)
  })

  child.on('close', (code, signal) => {
    record.state = record.state === 'failed' ? 'failed' : 'exited'
    record.exitCode = code
    record.endedAt = Date.now()
    children.delete(id)

    const suffix = signal === null ? `exit code ${String(code)}` : `terminated by signal ${signal}`
    appendOutput(id, `\n[dsh-ide] Process exited (${suffix})\n`)
  })

  return record
}

/**
 * 停止一个实例：先 SIGTERM，宽限期后 SIGKILL。
 * @param id 实例 id
 * @returns 是否找到并终止了该实例
 */
export function stopRun(id: string): boolean {
  const child = children.get(id)
  if (child === undefined) return false

  child.kill('SIGTERM')

  const timer = setTimeout(() => {
    if (children.has(id)) child.kill('SIGKILL')
  }, KILL_GRACE_MS)

  timer.unref?.()

  return true
}

/**
 * 移除一个已结束的实例与其缓冲。
 * @param id 实例 id
 * @returns 是否移除
 */
export function disposeRun(id: string): boolean {
  const child = children.get(id)
  if (child !== undefined) child.kill('SIGKILL')

  children.delete(id)
  buffers.delete(id)

  return processes.delete(id)
}

/**
 * 结束全部实例；插件卸载时调用，避免留下孤儿进程。
 */
export function stopAllRuns(): void {
  for (const [id, child] of children) {
    child.kill('SIGKILL')
    console.log('[dsh-ide] 插件卸载，已终止运行实例:', id)
  }

  children.clear()
}
