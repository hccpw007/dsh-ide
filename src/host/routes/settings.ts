/**
 * 设置路由。
 *
 * 设置是跨会话的全局文档；读写都落到 `$DSH_HOME/dsh-ide/settings.json`，
 * 串行写入与读缓存见设置服务。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'

import { readJsonBody } from '../../common/http-body'
import { sendError, sendOk } from '../../common/http-route'
import { readSettings, writeSettings } from '../services/settings-service'

/**
 * GET /settings
 * @param _request 入站请求
 * @param response 响应对象
 */
export async function handleSettingsGet(_request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    sendOk(response, await readSettings())
  } catch (error) {
    console.error('[dsh-ide] 读取设置失败:', error)
    sendError(response, 'SETTINGS_READ_FAILED', String(error), 500)
  }
}

/**
 * POST /settings
 *
 * 请求体：完整设置对象；缺省字段按默认值补齐。
 * @param request 入站请求
 * @param response 响应对象
 */
export async function handleSettingsSave(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const body = await readJsonBody(request)

    sendOk(response, await writeSettings(body))
  } catch (error) {
    console.error('[dsh-ide] 保存设置失败:', error)
    sendError(response, 'SETTINGS_WRITE_FAILED', String(error), 500)
  }
}
