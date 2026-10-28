/**
 * 请求体的读取与工具集。
 *
 * 插件路由的请求体一律是 JSON；宿主没有提供现成的 body parser，这里统一读取并
 * 施加体积上限，避免一个畸形请求把 Host 内存占满。
 */

/** 单个请求体上限；编辑器保存的是整文件，留足余量但仍是硬上限。 */
const MAX_BODY_BYTES = 32 * 1024 * 1024

/** 请求体不合法时抛出，携带稳定错误码。 */
export class BodyError extends Error {
  /**
   * @param code 稳定错误码
   * @param message 诊断信息
   */
  constructor(
    readonly code: 'BODY_TOO_LARGE' | 'BODY_INVALID',
    message: string,
  ) {
    super(message)
    this.name = 'BodyError'
  }
}

/**
 * 读取并解析 JSON 请求体。
 * @param request 入站请求
 * @returns 解析后的对象；空体返回空对象
 */
export async function readJsonBody(request: AsyncIterable<Buffer | string>): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let bytes = 0

  for await (const chunk of request) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
    bytes += buffer.byteLength

    if (bytes > MAX_BODY_BYTES) throw new BodyError('BODY_TOO_LARGE', '请求体超过上限')

    chunks.push(buffer)
  }

  if (bytes === 0) return {}

  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new BodyError('BODY_INVALID', '请求体必须是 JSON 对象')
    }

    return parsed as Record<string, unknown>
  } catch (error) { // 解析失败与类型不符都要回稳定错误码，不能漏成 500
    if (error instanceof BodyError) throw error

    throw new BodyError('BODY_INVALID', `请求体不是合法 JSON: ${String(error)}`)
  }
}

/**
 * 从请求体里取字符串字段。
 * @param body 已解析的请求体
 * @param key 字段名
 * @param fallback 缺省值
 * @returns 字段值；缺省且无默认值时为空串
 */
export function bodyString(body: Record<string, unknown>, key: string, fallback = ''): string {
  const value = body[key]

  return typeof value === 'string' ? value : fallback
}

/**
 * 从请求体里取数字字段。
 * @param body 已解析的请求体
 * @param key 字段名
 * @returns 合法有限数字；否则 undefined
 */
export function bodyNumber(body: Record<string, unknown>, key: string): number | undefined {
  const value = body[key]

  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * 从请求体里取布尔字段。
 * @param body 已解析的请求体
 * @param key 字段名
 * @returns 严格成立的布尔值；否则 false
 */
export function bodyBoolean(body: Record<string, unknown>, key: string): boolean {
  return body[key] === true
}

/**
 * 从 URL 查询串里取字段。
 * @param request 入站请求
 * @param key 参数名
 * @returns 参数值；缺省为空串
 */
export function queryOf(request: { url?: string }, key: string): string {
  const raw = request.url ?? '/'
  const index = raw.indexOf('?')

  if (index < 0) return ''

  try {
    return new URLSearchParams(raw.slice(index + 1)).get(key) ?? ''
  } catch (error) { // 查询串畸形时按缺省处理，交由调用方报参数错误
    console.error('[dsh-ide] 解析查询串失败:', error)

    return ''
  }
}

/**
 * 从 URL 查询串里取数字字段。
 * @param request 入站请求
 * @param key 参数名
 * @returns 合法有限数字；否则 undefined
 */
export function queryNumber(request: { url?: string }, key: string): number | undefined {
  const text = queryOf(request, key)
  if (text === '') return undefined

  const value = Number(text)

  return Number.isFinite(value) ? value : undefined
}
