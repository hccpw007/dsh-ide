/**
 * 宿主侧路由注册与分发。
 *
 * 全部路由挂在 `/dsh-ide/api` 前缀下，只注册一条 prefix 路由，内部按键值分发。
 * 这样新增接口只需在 ROUTES 里追加一行，信任校验与信封格式不会在各处走样。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'

import { isTrustedRequest, sendJson } from '../../common/http-route'
import type { WebServerApi } from '../../types/host'

import { handlePing } from './ping'

/** 所有插件路由的公共前缀。 */
const API_PREFIX = '/dsh-ide/api'

/** 路由处理器签名；允许异步，异常由分发器统一兜住。 */
type RouteHandler = (request: IncomingMessage, response: ServerResponse) => void | Promise<void>

/** 键为 `${method} ${path}`，path 已去掉公共前缀。 */
const ROUTES: Record<string, RouteHandler> = {
  'GET /ping': handlePing,
}

/**
 * 从请求 URL 里取出前缀之后、问号之前的路径。
 * @param request 入站请求
 * @returns 相对前缀的路径，如 `/ping`
 */
function routePathOf(request: IncomingMessage): string {
  const raw = request.url ?? '/'
  const path = raw.split('?')[0] ?? '/'

  return path.slice(API_PREFIX.length) || '/'
}

/**
 * 注册全部插件路由。
 * @param webServer 宿主的 web 服务器服务
 * @returns 注销函数
 */
export function registerRoutes(webServer: WebServerApi): () => void {
  return webServer.register({
    kind: 'prefix',
    path: API_PREFIX,
    handler: (request, response) => {
      // 信任校验前置：未通过时连路由表都不查，避免暴露可用接口清单
      if (!isTrustedRequest(request)) {
        sendJson(response, 403, { ok: false, error: { code: 'FORBIDDEN', message: '请求来源不可信' } })

        return
      }

      const key = `${request.method ?? 'GET'} ${routePathOf(request)}`
      const handler = ROUTES[key]

      if (handler === undefined) {
        sendJson(response, 404, { ok: false, error: { code: 'NOT_FOUND', message: `未知接口 ${key}` } })

        return
      }

      try {
        const result = handler(request, response)

        // 异步处理器抛错不会进入上面的 try，这里单独兜住并尽量回一个可读的错误
        if (result instanceof Promise) {
          result.catch((error: unknown) => {
            console.error('[dsh-ide] 路由处理失败:', key, error)
            if (!response.headersSent) {
              sendJson(response, 500, { ok: false, error: { code: 'INTERNAL', message: '内部错误' } })
            }
          })
        }
      } catch (error) { // 同步抛错同样要回错误码，不能让连接悬挂
        console.error('[dsh-ide] 路由处理失败:', key, error)
        if (!response.headersSent) {
          sendJson(response, 500, { ok: false, error: { code: 'INTERNAL', message: '内部错误' } })
        }
      }
    },
  })
}
