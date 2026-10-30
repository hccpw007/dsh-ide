/**
 * 设置与诊断路由。
 *
 * 设置是跨会话的全局文档；诊断是把用户配置的一条命令跑在工作区里，并把输出按
 * 统一格式（`file:line:col - severity: message`）解析成问题列表。
 */
import { execFile } from 'node:child_process'
import type { IncomingMessage, ServerResponse } from 'node:http'

import { bodyString, readJsonBody } from '../../common/http-body'
import { sendError, sendOk } from '../../common/http-route'
import { readSettings, writeSettings } from '../services/settings-service'

/** 诊断命令超时。 */
const DIAGNOSE_TIMEOUT_MS = 180_000

/**
 * 是否已有诊断在跑。
 *
 * 诊断命令通常是一条全量检查（`tsc --noEmit` 之类），本身就能吃满一个核。连点按钮
 * 不该并行起多份：那会按点击次数成倍占用 CPU，看起来像插件把机器打满。
 */
let diagnosing = false

/** 统一格式的一条问题。 */
interface Diagnostic {
  /** 相对工作区根的路径。 */
  path: string
  /** 行号，从 1 开始。 */
  line: number
  /** 列号，从 1 开始。 */
  column: number
  /** 严重级别。 */
  severity: 'error' | 'warning' | 'info'
  /** 问题描述。 */
  message: string
}

/**
 * 解析统一格式的诊断输出。
 *
 * 支持两种最常见写法：
 * - `path/to/file.ts(12,5): error TS2345: message`
 * - `path/to/file.ts:12:5 - error: message`
 * @param text 命令输出
 * @returns 问题列表
 */
function parseDiagnostics(text: string): Diagnostic[] {
  const results: Diagnostic[] = []
  const tscPattern = /^(.*?)\((\d+),(\d+)\):\s*(error|warning|info)\s+[^:]*:\s*(.*)$/u
  const genericPattern = /^(.*?):(\d+):(\d+)\s*-\s*(error|warning|info)\s*:\s*(.*)$/u

  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line === '') continue

    const tsc = tscPattern.exec(line)
    if (tsc !== null) {
      results.push({
        path: tsc[1],
        line: Number(tsc[2]),
        column: Number(tsc[3]),
        severity: tsc[4] as Diagnostic['severity'],
        message: tsc[5],
      })

      continue
    }

    const generic = genericPattern.exec(line)
    if (generic !== null) {
      results.push({
        path: generic[1],
        line: Number(generic[2]),
        column: Number(generic[3]),
        severity: generic[4] as Diagnostic['severity'],
        message: generic[5],
      })
    }
  }

  return results
}

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

/**
 * POST /diagnose
 *
 * 请求体：cwd。命令取设置里的 `diagnoseCommand`，经登录 shell 执行。
 * @param request 入站请求
 * @param response 响应对象
 */
export async function handleDiagnose(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const body = await readJsonBody(request)
    const cwd = bodyString(body, 'cwd')
    const settings = await readSettings()

    if (settings.diagnoseCommand.trim() === '') {
      sendError(response, 'DIAGNOSE_NOT_CONFIGURED', 'No diagnostic command is configured')

      return
    }

    if (cwd === '') {
      sendError(response, 'CWD_REQUIRED', 'A working directory is required')

      return
    }

    if (diagnosing) {
      sendError(response, 'DIAGNOSE_BUSY', 'A diagnostic run is already in progress', 409)

      return
    }

    diagnosing = true

    const shell = settings.terminalShell !== '' ? settings.terminalShell : process.env.SHELL ?? '/bin/sh'

    // 诊断命令由用户配置，仍按 argv 数组交给 shell，不经字符串拼接
    const output = await new Promise<{ text: string; code: number }>((resolve, reject) => {
      execFile(
        shell,
        ['-lc', settings.diagnoseCommand],
        { cwd, timeout: DIAGNOSE_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, FORCE_COLOR: '0' } },
        (error, stdout, stderr) => {
          // 诊断工具发现问题时退出码非零是常态，只有真正的执行失败才算错误
          const failure = error as (NodeJS.ErrnoException & { killed?: boolean }) | null

          if (failure !== null && (failure.code === 'ENOENT' || failure.killed === true)) {
            reject(new Error(failure.message))

            return
          }

          resolve({ text: `${stdout}${stderr}`, code: typeof failure?.code === 'number' ? failure.code : 0 })
        },
      )
    })

    sendOk(response, { diagnostics: parseDiagnostics(output.text), code: output.code, raw: output.text.slice(0, 20000) })
  } catch (error) {
    console.error('[dsh-ide] 运行诊断失败:', error)
    sendError(response, 'DIAGNOSE_FAILED', String(error), 500)
  } finally {
    // 超时、命令不存在、正常结束都要放锁，否则一次失败会把诊断永久挡住
    diagnosing = false
  }
}
