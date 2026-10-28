/**
 * 宿主终端 Remote 的访问入口。
 *
 * 终端进程由宿主管理（`remote.terminal`），插件只负责呈现与转发输入。Remote 只在
 * 插件 apply 时可用，因此这里用一个最小订阅接口把「服务何时可用」告诉 React，
 * feature 只依赖本模块，不需要接触宿主的 client 上下文。
 */

/** 宿主终端元信息。 */
export interface TerminalInfo {
  /** 终端 id。 */
  id: string
  /** 显示标题。 */
  title: string
  /** 初始工作目录。 */
  cwd: string
  /** 列数。 */
  cols: number
  /** 行数。 */
  rows: number
  /** 进程状态。 */
  state: 'running' | 'exited' | 'failed'
  /** 退出码。 */
  exitCode: number | null
  /** shell 描述。 */
  shell: { path: string; name: string; args: string[] }
  /** 启动失败原因。 */
  error?: string
}

/** 宿主终端环境与上限。 */
export interface TerminalEnvironment {
  /** 当前工作目录。 */
  cwd: string
  /** 单次输入字节上限。 */
  maxInputBytes: number
  /** 未确认输入缓冲上限。 */
  maxBufferedBytes: number
  /** 最大列数。 */
  maxCols: number
  /** 最大行数。 */
  maxRows: number
  /** 回滚行数。 */
  scrollback: number
}

/** 一个终端输出帧。 */
export type TerminalFrame =
  | { type: 'snapshot'; sequence: number; screen: string; info: TerminalInfo; writable: boolean }
  | { type: 'output'; sequence: number; data: string }
  | { type: 'state'; info: TerminalInfo; writable: boolean }
  | { type: 'ack'; sequence: number }

/** 上行命令。 */
export type TerminalInput =
  | { type: 'write'; sequence: number; data: string }
  | { type: 'resize'; sequence: number; cols: number; rows: number }

/** 附加流：异步可迭代的输出 + 同步发送的上行通道。 */
export interface TerminalAttachment extends AsyncIterable<TerminalFrame> {
  /** 发送一条上行命令。 */
  send(command: TerminalInput): void
}

/** 统一结果信封。 */
export interface RemoteResult<T> {
  /** 是否成功。 */
  ok: boolean
  /** 成功时的值。 */
  value?: T
  /** 失败信息。 */
  error?: { code?: string; message: string }
}

/** 本插件用到的 terminal Remote 能力。 */
export interface TerminalRemote {
  /** 读取会话工作目录与终端上限。 */
  environment(sessionId: string, signal?: AbortSignal): Promise<RemoteResult<TerminalEnvironment>>
  /** 列出可用的 shell。 */
  shells(sessionId: string, signal?: AbortSignal): Promise<RemoteResult<{ path: string; name: string; args: string[] }[]>>
  /** 创建（或复用同 id 的）终端。 */
  create(
    sessionId: string,
    request: { id: string; cols: number; rows: number; shellPath?: string },
    signal?: AbortSignal,
  ): Promise<RemoteResult<TerminalInfo>>
  /** 附加到终端输出流。 */
  attach(sessionId: string, id: string, signal: AbortSignal): TerminalAttachment
  /** 关闭终端并结束进程。 */
  close(sessionId: string, id: string): Promise<RemoteResult<void>>
  /** 重命名终端。 */
  rename(sessionId: string, id: string, title: string): Promise<RemoteResult<void>>
}

/** 当前可用的 Remote；未绑定时为 undefined。 */
let terminalRemote: TerminalRemote | undefined

/** 订阅集合。 */
const listeners = new Set<() => void>()

/**
 * 从宿主 remote 服务里收窄出 terminal 能力。
 * @param value 宿主 remote 服务对象
 * @returns 形状符合预期时返回该 Remote
 */
export function asTerminalRemote(value: unknown): TerminalRemote | undefined {
  if (typeof value !== 'object' || value === null) return undefined

  const candidate = (value as { terminal?: unknown }).terminal
  if (typeof candidate !== 'object' || candidate === null) return undefined

  const attach = (candidate as { attach?: unknown }).attach

  return typeof attach === 'function' ? (candidate as TerminalRemote) : undefined
}

/**
 * 绑定或解绑 Remote，并通知已挂载的视图。
 * @param next 新的 Remote；undefined 表示服务已卸载
 */
export function setTerminalRemote(next: TerminalRemote | undefined): void {
  terminalRemote = next

  for (const listener of listeners) listener()
}

/**
 * 读取当前 Remote。
 * @returns 已绑定的 Remote
 */
export function getTerminalRemote(): TerminalRemote | undefined {
  return terminalRemote
}

/**
 * 订阅 Remote 绑定变化。
 * @param listener 变化回调
 * @returns 取消订阅函数
 */
export function subscribeTerminalRemote(listener: () => void): () => void {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}
