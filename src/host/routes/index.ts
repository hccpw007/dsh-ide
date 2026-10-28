/**
 * 宿主侧路由注册与分发。
 *
 * 全部路由挂在 `/dsh-ide/api` 前缀下，只注册一条 prefix 路由，内部按键值分发。
 * 这样新增接口只需在 ROUTES 里追加一行，信任校验与信封格式不会在各处走样。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'

import { isTrustedRequest, sendError, sendJson } from '../../common/http-route'
import type { WebServerApi } from '../../types/host'

import { handleAsset } from './asset'
import {
  handleFsCopy,
  handleFsCreate,
  handleFsDelete,
  handleFsList,
  handleFsRead,
  handleFsRename,
  handleFsSearch,
  handleFsStat,
  handleFsTrashPurge,
  handleFsWrite,
} from './fs'
import { handleGitExec } from './git'
import { handlePing } from './ping'
import {
  handleRunConfigDelete,
  handleRunConfigSave,
  handleRunConfigs,
  handleRunDispose,
  handleRunList,
  handleRunOutput,
  handleRunStart,
  handleRunStop,
} from './run'
import { handleDiagnose, handleSettingsGet, handleSettingsSave } from './settings'

/** 所有插件路由的公共前缀。 */
const API_PREFIX = '/dsh-ide/api'

/** 路由处理器签名；允许异步，异常由分发器统一兜住。 */
type RouteHandler = (request: IncomingMessage, response: ServerResponse) => void | Promise<void>

/** 键为 `${method} ${path}`，path 已去掉公共前缀。 */
const ROUTES: Record<string, RouteHandler> = {
  'GET /ping': handlePing,

  'GET /fs/list': handleFsList,
  'GET /fs/stat': handleFsStat,
  'GET /fs/read': handleFsRead,
  'GET /fs/search': handleFsSearch,
  'POST /fs/write': handleFsWrite,
  'POST /fs/create': handleFsCreate,
  'POST /fs/rename': handleFsRename,
  'POST /fs/copy': handleFsCopy,
  'POST /fs/delete': handleFsDelete,
  'POST /fs/trash-purge': handleFsTrashPurge,

  'POST /git/exec': handleGitExec,

  'GET /run/list': handleRunList,
  'GET /run/output': handleRunOutput,
  'GET /run/configs': handleRunConfigs,
  'POST /run/start': handleRunStart,
  'POST /run/stop': handleRunStop,
  'POST /run/dispose': handleRunDispose,
  'POST /run/config-save': handleRunConfigSave,
  'POST /run/config-delete': handleRunConfigDelete,

  'GET /settings': handleSettingsGet,
  'POST /settings': handleSettingsSave,
  'POST /diagnose': handleDiagnose,
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
        sendJson(response, 403, { ok: false, error: { code: 'FORBIDDEN', message: 'Untrusted request origin' } })

        return
      }

      const relative = routePathOf(request)
      // 资产路径带变量名（`/asset/<chunk>`），无法进静态表，单独前置分发
      const handler = relative.startsWith('/asset/') ? handleAsset : ROUTES[`${request.method ?? 'GET'} ${relative}`]
      const key = `${request.method ?? 'GET'} ${relative}`

      if (handler === undefined) {
        sendError(response, 'NOT_FOUND', `Unknown endpoint ${key}`, 404)

        return
      }

      try {
        const result = handler(request, response)

        // 异步处理器抛错不会进入上面的 try，这里单独兜住并尽量回一个可读的错误
        if (result instanceof Promise) {
          result.catch((error: unknown) => {
            console.error('[dsh-ide] 路由处理失败:', key, error)
            if (!response.headersSent) sendError(response, 'INTERNAL', 'Internal error', 500)
          })
        }
      } catch (error) { // 同步抛错同样要回错误码，不能让连接悬挂
        console.error('[dsh-ide] 路由处理失败:', key, error)
        if (!response.headersSent) sendError(response, 'INTERNAL', 'Internal error', 500)
      }
    },
  })
}
