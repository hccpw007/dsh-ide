/**
 * 插件注册的本地 HTTP 路由公用工具。
 *
 * 工作台的路由能读写文件、执行 git、启动进程，只靠「本机回环地址」不够——
 * 同机上任何页面都能发过来。这里统一做信任校验与收发格式，避免各 feature
 * 各写一套判定而出现漏检。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'

/** 回环地址集合，用于确认请求来自本机。 */
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

/** 统一的失败信封。 */
export interface ApiFailure {
  ok: false
  error: {
    /** 英文大写错误码，客户端据此选择文案。 */
    code: string
    /** 诊断信息，可能是宿主原始报错，仅作兜底展示。 */
    message: string
  }
}

/**
 * 判断请求是否来自本机回环地址。
 *
 * 不对外导出：调用方要判断的是「请求是否可信」，那是 `isTrustedRequest` 的职责；
 * 把半截判定暴露出去只会诱使业务路由漏掉同源检查。
 * @param request 入站请求
 * @returns 只有回环地址返回 true
 */
function isLocalRequest(request: IncomingMessage): boolean {
  const address = request.socket.remoteAddress ?? ''

  return LOOPBACK_ADDRESSES.has(address)
}

/**
 * 判断 Origin 与 Host 是否同源。
 *
 * 同源导航可能不带 Origin 头，此时视为同源；带了就必须与 Host 一致，
 * 否则说明请求由别的站点发起。
 * @param request 入站请求
 * @returns 同源或没有 Origin 头时返回 true
 */
function isSameOrigin(request: IncomingMessage): boolean {
  const origin = request.headers.origin
  if (origin === undefined) return true

  const host = request.headers.host
  if (host === undefined) return false

  try {
    return new URL(origin).host === host
  } catch (error) { // Origin 不合法说明请求异常，直接判为不可信
    console.error('[dsh-ide] 解析 Origin 失败:', error)

    return false
  }
}

/**
 * 判断请求是否可信。
 *
 * 浏览器会带 `Sec-Fetch-Site`，跨站值直接拒绝；未带的（非浏览器客户端）依赖
 * 回环地址与同源判定。
 * @param request 入站请求
 * @returns 可信时返回 true
 */
export function isTrustedRequest(request: IncomingMessage): boolean {
  if (!isLocalRequest(request)) return false
  if (request.headers['sec-fetch-site'] === 'cross-site') return false

  return isSameOrigin(request)
}

/**
 * 写 JSON 响应。
 * @param response 响应对象
 * @param status HTTP 状态码
 * @param body 响应体
 */
export function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(text),
  })
  response.end(text)
}

/**
 * 写成功信封。
 * @param response 响应对象
 * @param value 业务返回值
 */
export function sendOk(response: ServerResponse, value: unknown): void {
  sendJson(response, 200, { ok: true, value })
}

/**
 * 写失败信封。
 * @param response 响应对象
 * @param code 英文大写错误码
 * @param message 诊断信息
 * @param status HTTP 状态码，缺省 400
 * @param details 附加诊断字段，随 error 对象一起下发（如 Git 失败时的真实命令行）
 */
export function sendError(
  response: ServerResponse,
  code: string,
  message: string,
  status = 400,
  details?: Record<string, unknown>,
): void {
  sendJson(response, status, { ok: false, error: { code, message, ...details } })
}
