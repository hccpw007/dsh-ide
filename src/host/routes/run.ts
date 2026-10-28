/**
 * 运行配置路由。
 *
 * 启动一律交给 `run-service`：命令串作为单个 argv 交给登录 shell。停止是两级信号
 * （SIGTERM → 宽限期 → SIGKILL），保证 `vite`、`nodemon` 这类会转发信号的进程
 * 有机会自己收拾子进程，而不是被硬杀留下孤儿。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'

import { bodyString, queryNumber, queryOf, readJsonBody } from '../../common/http-body'
import { sendError, sendOk } from '../../common/http-route'
import {
  disposeRun,
  listProcesses,
  readOutput,
  startRun,
  stopRun,
} from '../services/run-service'
import { readRunConfigs, readSettings, writeRunConfigs, type RunConfig } from '../services/settings-service'

/**
 * GET /run/list
 * @param _request 入站请求
 * @param response 响应对象
 */
export function handleRunList(_request: IncomingMessage, response: ServerResponse): void {
  sendOk(response, { processes: listProcesses() })
}

/**
 * POST /run/start
 *
 * 请求体：configId。同一配置允许并行多实例（设计 F10 行为 ⑥），因此不在这里去重；
 * 「已在运行」的提示由客户端的按钮状态负责。
 * @param request 入站请求
 * @param response 响应对象
 */
export async function handleRunStart(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const body = await readJsonBody(request)
    const configId = bodyString(body, 'configId')
    const configs = await readRunConfigs()
    const config = configs.find((item) => item.id === configId)

    if (config === undefined) {
      sendError(response, 'CONFIG_NOT_FOUND', `Run configuration not found: ${configId}`, 404)

      return
    }

    const settings = await readSettings()

    sendOk(response, startRun(config, settings.terminalShell))
  } catch (error) { // 启动失败必须回可读信息，界面据此提示而不是空转
    console.error('[dsh-ide] 启动运行配置失败:', error)
    sendError(response, 'RUN_START_FAILED', String(error), 500)
  }
}

/**
 * POST /run/stop
 *
 * 请求体：id（实例 id）。
 * @param request 入站请求
 * @param response 响应对象
 */
export async function handleRunStop(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const body = await readJsonBody(request)

    sendOk(response, { stopped: stopRun(bodyString(body, 'id')) })
  } catch (error) {
    console.error('[dsh-ide] 停止运行实例失败:', error)
    sendError(response, 'RUN_STOP_FAILED', String(error), 500)
  }
}

/**
 * POST /run/dispose
 *
 * 移除已结束实例的记录与其输出缓冲。
 * @param request 入站请求
 * @param response 响应对象
 */
export async function handleRunDispose(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const body = await readJsonBody(request)

    sendOk(response, { disposed: disposeRun(bodyString(body, 'id')) })
  } catch (error) {
    console.error('[dsh-ide] 移除运行实例失败:', error)
    sendError(response, 'RUN_DISPOSE_FAILED', String(error), 500)
  }
}

/**
 * GET /run/output
 *
 * 查询参数：id、offset（已消费字节数）。
 * @param request 入站请求
 * @param response 响应对象
 */
export function handleRunOutput(request: IncomingMessage, response: ServerResponse): void {
  const id = queryOf(request, 'id')

  sendOk(response, readOutput(id, queryNumber(request, 'offset') ?? 0))
}

/**
 * GET /run/configs
 * @param _request 入站请求
 * @param response 响应对象
 */
export async function handleRunConfigs(_request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    sendOk(response, { configs: await readRunConfigs() })
  } catch (error) {
    console.error('[dsh-ide] 读取运行配置失败:', error)
    sendError(response, 'RUN_CONFIG_READ_FAILED', String(error), 500)
  }
}

/**
 * POST /run/config-save
 *
 * 请求体：config（完整配置对象）。id 为空表示新建，由宿主生成。
 * @param request 入站请求
 * @param response 响应对象
 */
export async function handleRunConfigSave(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const body = await readJsonBody(request)
    const input = typeof body.config === 'object' && body.config !== null ? (body.config as Record<string, unknown>) : {}
    const configs = await readRunConfigs()
    const id = bodyString(input, 'id')
    const config: RunConfig = {
      id: id === '' ? `cfg-${Date.now().toString(36)}` : id,
      name: bodyString(input, 'name').trim() || 'Unnamed Configuration',
      command: bodyString(input, 'command'),
      cwd: bodyString(input, 'cwd'),
      lastExitCode: typeof input.lastExitCode === 'number' ? input.lastExitCode : null,
    }
    const next = configs.filter((item) => item.id !== config.id)

    next.push(config)
    await writeRunConfigs(next)

    sendOk(response, { config })
  } catch (error) {
    console.error('[dsh-ide] 保存运行配置失败:', error)
    sendError(response, 'RUN_CONFIG_SAVE_FAILED', String(error), 500)
  }
}

/**
 * POST /run/config-delete
 *
 * 请求体：id。
 * @param request 入站请求
 * @param response 响应对象
 */
export async function handleRunConfigDelete(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const body = await readJsonBody(request)
    const id = bodyString(body, 'id')
    const configs = await readRunConfigs()

    await writeRunConfigs(configs.filter((item) => item.id !== id))

    sendOk(response, null)
  } catch (error) {
    console.error('[dsh-ide] 删除运行配置失败:', error)
    sendError(response, 'RUN_CONFIG_DELETE_FAILED', String(error), 500)
  }
}
