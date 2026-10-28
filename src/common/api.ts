/**
 * 插件宿主接口的客户端封装。
 *
 * 工作台的写操作（保存文件、git、启动进程）都走插件自己的 `/dsh-ide/api` 路由，
 * 统一信封 `{ ok, value }` / `{ ok, error }`。这里只做三件事：拼 URL、解信封、
 * 把 HTTP 层错误与业务错误收敛成同一个 `ApiResult`，让调用方只处理一种失败形态。
 */

/** 插件路由前缀。 */
const API_PREFIX = '/dsh-ide/api'

/** 统一失败信息。 */
export interface ApiError {
  /** 英文大写错误码；网络层失败用 `NETWORK`。 */
  code: string
  /** 诊断信息，可直接展示。 */
  message: string
}

/** 统一调用结果。 */
export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: ApiError }

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

  const envelope = payload as { ok?: unknown; value?: unknown; error?: { code?: unknown; message?: unknown } }

  if (envelope.ok === true) return { ok: true, value: envelope.value as T }

  return {
    ok: false,
    error: {
      code: typeof envelope.error?.code === 'string' ? envelope.error.code : 'UNKNOWN',
      message: typeof envelope.error?.message === 'string' ? envelope.error.message : '请求失败',
    },
  }
}

/**
 * 发起一次 GET 请求。
 * @param path 相对插件前缀的路径，如 `/fs/list`
 * @param query 查询参数
 * @param signal 取消信号
 * @returns 解包后的结果
 */
export async function apiGet<T>(
  path: string,
  query: Record<string, string | number | boolean | undefined> = {},
  signal?: AbortSignal,
): Promise<ApiResult<T>> {
  const search = new URLSearchParams()

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) search.set(key, String(value))
  }

  const suffix = search.toString() === '' ? '' : `?${search.toString()}`

  try {
    const response = await fetch(`${API_PREFIX}${path}${suffix}`, { signal, credentials: 'same-origin' })

    return parseResponse<T>(response)
  } catch (error) { // 取消是正常路径，交给调用方按 signal.aborted 判定
    if (signal?.aborted === true) return { ok: false, error: { code: 'ABORTED', message: '请求已取消' } }

    console.error('[dsh-ide] GET 请求失败:', path, error)

    return { ok: false, error: { code: 'NETWORK', message: String(error) } }
  }
}

/**
 * 发起一次 POST 请求。
 * @param path 相对插件前缀的路径
 * @param body 请求体
 * @param signal 取消信号
 * @returns 解包后的结果
 */
export async function apiPost<T>(
  path: string,
  body: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<ApiResult<T>> {
  try {
    const response = await fetch(`${API_PREFIX}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
      credentials: 'same-origin',
    })

    return parseResponse<T>(response)
  } catch (error) { // 同上：取消不算异常
    if (signal?.aborted === true) return { ok: false, error: { code: 'ABORTED', message: '请求已取消' } }

    console.error('[dsh-ide] POST 请求失败:', path, error)

    return { ok: false, error: { code: 'NETWORK', message: String(error) } }
  }
}
