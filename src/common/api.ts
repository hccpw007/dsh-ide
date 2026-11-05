/**
 * 插件宿主接口的客户端封装。
 *
 * 工作台的写操作（保存文件、git、启动进程）都走插件自己的 `/dsh-ide/api` 路由，
 * 统一信封 `{ ok, value }` / `{ ok, error }`。这里只做四件事：拼 URL、解信封、
 * 把 HTTP 层错误与业务错误收敛成同一个 `ApiResult`、给每次调用加超时。
 *
 * 超时是必需的：宿主侧任何一处挂起（历史版本里正则搜索能把事件循环钉住几十秒、
 * git 网络操作最长 180 秒）都会让 `fetch` 永远不返回，调用方的「请求中」标志
 * 随之永久为真，界面表现为某个面板彻底停摆且没有任何提示。
 */

/** 插件路由前缀。 */
const API_PREFIX = '/dsh-ide/api'

/**
 * 默认超时（毫秒）。
 *
 * 比宿主侧最长的常规请求（搜索 15 秒）留出余量；git 网络操作单独传更长的值。
 */
const DEFAULT_TIMEOUT_MS = 60_000

/** 统一失败信息。 */
export interface ApiError {
  /** 英文大写错误码；网络层失败用 `NETWORK`，超时用 `TIMEOUT`，取消用 `ABORTED`。 */
  code: string
  /** 诊断信息，可直接展示。 */
  message: string
  /** Git 失败时宿主带回的真实命令行，供控制台回显；其它接口没有此字段。 */
  command?: string
}

/** 统一调用结果。 */
export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: ApiError }

/** 超时守卫：把调用方信号与本地超时合成一个信号。 */
interface DeadlineGuard {
  /** 交给 fetch 的信号。 */
  signal: AbortSignal
  /** 是否因超时而中止。 */
  timedOut(): boolean
  /** 清理定时器与事件监听。 */
  cleanup(): void
}

/**
 * 合成「调用方取消 + 本地超时」信号。
 * @param signal 调用方信号，可省略
 * @param timeoutMs 超时毫秒数
 * @returns 守卫对象
 */
function withDeadline(signal: AbortSignal | undefined, timeoutMs: number): DeadlineGuard {
  const controller = new AbortController()
  let timedOut = false

  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  const abortFromCaller = (): void => controller.abort()

  if (signal?.aborted === true) controller.abort()
  else signal?.addEventListener('abort', abortFromCaller, { once: true })

  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    cleanup: () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abortFromCaller)
    },
  }
}

/**
 * 解析一次响应。
 * @param response fetch 响应
 * @returns 解包后的结果
 */
async function parseResponse<T>(response: Response): Promise<ApiResult<T>> {
  let payload: unknown

  try {
    payload = await response.json()
  } catch (error) { // 非 JSON 响应通常意味着宿主路由没挂上，要给出可诊断信息
    console.error('[dsh-ide] 解析路由响应失败:', response.status, error)

    return { ok: false, error: { code: 'NETWORK', message: `响应不是 JSON（HTTP ${response.status}）` } }
  }

  if (typeof payload !== 'object' || payload === null) {
    return { ok: false, error: { code: 'NETWORK', message: '响应格式不正确' } }
  }

  const envelope = payload as {
    ok?: unknown
    value?: unknown
    error?: { code?: unknown; message?: unknown; command?: unknown }
  }

  if (envelope.ok === true) return { ok: true, value: envelope.value as T }

  const error: ApiError = {
    code: typeof envelope.error?.code === 'string' ? envelope.error.code : 'UNKNOWN',
    message: typeof envelope.error?.message === 'string' ? envelope.error.message : '请求失败',
  }

  if (typeof envelope.error?.command === 'string') error.command = envelope.error.command

  return { ok: false, error }
}

/**
 * 把 fetch 抛出的异常翻译成统一错误。
 * @param path 请求路径
 * @param signal 调用方信号
 * @param guard 超时守卫
 * @param error 原始异常
 * @returns 统一失败结果
 */
function transportError(path: string, signal: AbortSignal | undefined, guard: DeadlineGuard, error: unknown): ApiResult<never> {
  if (signal?.aborted === true) return { ok: false, error: { code: 'ABORTED', message: '请求已取消' } }

  // 超时不是「网络错误」：客户端据此提示「宿主没有响应」，而不是「网络断了」
  if (guard.timedOut()) {
    console.error('[dsh-ide] 请求超时:', path)

    return { ok: false, error: { code: 'TIMEOUT', message: '宿主没有在预期时间内响应' } }
  }

  console.error('[dsh-ide] 请求失败:', path, error)

  return { ok: false, error: { code: 'NETWORK', message: String(error) } }
}

/**
 * 发起一次 GET 请求。
 * @param path 相对插件前缀的路径，如 `/fs/list`
 * @param query 查询参数
 * @param signal 取消信号
 * @param timeoutMs 超时毫秒数；省略时用默认值
 * @returns 解包后的结果
 */
export async function apiGet<T>(
  path: string,
  query: Record<string, string | number | boolean | undefined> = {},
  signal?: AbortSignal,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<ApiResult<T>> {
  const search = new URLSearchParams()

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) search.set(key, String(value))
  }

  const suffix = search.toString() === '' ? '' : `?${search.toString()}`
  const guard = withDeadline(signal, timeoutMs)

  try {
    const response = await fetch(`${API_PREFIX}${path}${suffix}`, { signal: guard.signal, credentials: 'same-origin' })

    return await parseResponse<T>(response)
  } catch (error) {
    return transportError(path, signal, guard, error)
  } finally {
    guard.cleanup()
  }
}

/**
 * 发起一次 POST 请求。
 * @param path 相对插件前缀的路径
 * @param body 请求体
 * @param signal 取消信号
 * @param timeoutMs 超时毫秒数；省略时用默认值
 * @returns 解包后的结果
 */
export async function apiPost<T>(
  path: string,
  body: Record<string, unknown> = {},
  signal?: AbortSignal,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<ApiResult<T>> {
  const guard = withDeadline(signal, timeoutMs)

  try {
    const response = await fetch(`${API_PREFIX}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: guard.signal,
      credentials: 'same-origin',
    })

    return await parseResponse<T>(response)
  } catch (error) {
    return transportError(path, signal, guard, error)
  } finally {
    guard.cleanup()
  }
}

/** 长耗时请求（git 网络操作）使用的超时：与宿主侧 180 秒上限对齐并留余量。 */
export const LONG_REQUEST_TIMEOUT_MS = 200_000
