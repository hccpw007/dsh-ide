/**
 * 健康检查路由。
 *
 * P0 只此一条，用来确认宿主侧接线（路由注册、信任校验、信封格式）是否正常。
 * 后续阶段的路由按同一信封与同一校验继续追加。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'

import { isTrustedRequest, sendJson } from '../../common/http-route'

/**
 * 处理 `GET /dsh-ide/api/ping`。
 * @param request 入站请求
 * @param response 响应对象
 */
export function handlePing(request: IncomingMessage, response: ServerResponse): void {
  if (!isTrustedRequest(request)) {
    sendJson(response, 403, { ok: false, error: { code: 'FORBIDDEN', message: '请求来源不可信' } })

    return
  }

  sendJson(response, 200, { ok: true, value: 'pong' })
}
