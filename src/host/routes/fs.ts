/**
 * 文件相关路由。
 *
 * 覆盖设计 6.2 的 fs 段：list / stat / read / write / create / rename / delete / copy / search。
 * 每条都先经 `resolveWithin` 校验工作区边界，再落到 `fs-service`。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'

import { BodyError, bodyString, queryOf, readJsonBody } from '../../common/http-body'
import { sendError, sendOk } from '../../common/http-route'
import { SafeRegexError } from '../../common/safe-regex'
import {
  copyEntry,
  createEntry,
  deleteEntry,
  FileTooLargeError,
  listDirectory,
  readTextFile,
  renameEntry,
  statFile,
  StaleFileError,
  writeTextFile,
} from '../services/fs-service'
import { searchWorkspace } from '../services/search-service'
import { revealInFileManager } from '../services/reveal-service'
import { WorkspaceError } from '../services/workspace'

/**
 * GET /fs/list
 *
 * 查询参数：root（工作区根）、path（相对或绝对）。
 * @param request 入站请求
 * @param response 响应对象
 */
export async function handleFsList(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const root = queryOf(request, 'root')
  const target = queryOf(request, 'path')

  try {
    sendOk(response, await listDirectory(root, target))
  } catch (error) { // 路径越界与读取失败要给稳定错误码，客户端据此提示
    respondFsError(response, error)
  }
}

/**
 * GET /fs/stat
 * @param request 入站请求
 * @param response 响应对象
 */
export async function handleFsStat(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const root = queryOf(request, 'root')
  const target = queryOf(request, 'path')

  try {
    const info = await statFile(root, target)

    if (info === undefined) {
      sendError(response, 'NOT_FOUND', `Target does not exist: ${target}`, 404)

      return
    }

    sendOk(response, info)
  } catch (error) {
    respondFsError(response, error)
  }
}

/**
 * GET /fs/read
 * @param request 入站请求
 * @param response 响应对象
 */
export async function handleFsRead(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const root = queryOf(request, 'root')
  const target = queryOf(request, 'path')

  try {
    sendOk(response, await readTextFile(root, target))
  } catch (error) {
    respondFsError(response, error)
  }
}

/**
 * POST /fs/write
 *
 * 请求体：root、path、text、expectedVersion。
 * @param request 入站请求
 * @param response 响应对象
 */
export async function handleFsWrite(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const body = await readJsonBody(request)
    const result = await writeTextFile(
      bodyString(body, 'root'),
      bodyString(body, 'path'),
      bodyString(body, 'text'),
      bodyString(body, 'expectedVersion'),
    )

    sendOk(response, result)
  } catch (error) {
    respondFsError(response, error)
  }
}

/**
 * POST /fs/create
 *
 * 请求体：root、path、kind（file|directory）、text。
 * @param request 入站请求
 * @param response 响应对象
 */
export async function handleFsCreate(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const body = await readJsonBody(request)

    sendOk(
      response,
      await createEntry(
        bodyString(body, 'root'),
        bodyString(body, 'path'),
        bodyString(body, 'kind') === 'directory' ? 'directory' : 'file',
        bodyString(body, 'text'),
      ),
    )
  } catch (error) {
    respondFsError(response, error)
  }
}

/**
 * POST /fs/rename
 *
 * 请求体：root、from、to。
 * @param request 入站请求
 * @param response 响应对象
 */
export async function handleFsRename(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const body = await readJsonBody(request)

    await renameEntry(bodyString(body, 'root'), bodyString(body, 'from'), bodyString(body, 'to'))
    sendOk(response, null)
  } catch (error) {
    respondFsError(response, error)
  }
}

/**
 * POST /fs/copy
 * @param request 入站请求
 * @param response 响应对象
 */
export async function handleFsCopy(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const body = await readJsonBody(request)

    await copyEntry(bodyString(body, 'root'), bodyString(body, 'from'), bodyString(body, 'to'))
    sendOk(response, null)
  } catch (error) {
    respondFsError(response, error)
  }
}

/**
 * POST /fs/delete
 *
 * 请求体：root、path。物理删除条目，不可恢复，确认由客户端负责。
 * @param request 入站请求
 * @param response 响应对象
 */
export async function handleFsDelete(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const body = await readJsonBody(request)

    sendOk(response, await deleteEntry(bodyString(body, 'root'), bodyString(body, 'path')))
  } catch (error) {
    respondFsError(response, error)
  }
}

/**
 * POST /fs/reveal
 *
 * 请求体：root、path。在系统文件管理器中定位该条目。
 * @param request 入站请求
 * @param response 响应对象
 */
export async function handleFsReveal(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const body = await readJsonBody(request)

    await revealInFileManager(bodyString(body, 'root'), bodyString(body, 'path'))
    sendOk(response, null)
  } catch (error) { // 目标越界、命令缺失都要回稳定错误码，客户端据此提示
    respondFsError(response, error)
  }
}

/**
 * GET /fs/search
 *
 * 查询参数：root、q、regex、caseSensitive、wholeWord、exclude。
 * @param request 入站请求
 * @param response 响应对象
 */
export async function handleFsSearch(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const query = queryOf(request, 'q')

  if (query === '') {
    sendError(response, 'QUERY_EMPTY', 'Query string is empty')

    return
  }

  try {
    sendOk(
      response,
      await searchWorkspace({
        root: queryOf(request, 'root'),
        query,
        regex: queryOf(request, 'regex') === '1',
        caseSensitive: queryOf(request, 'caseSensitive') === '1',
        wholeWord: queryOf(request, 'wholeWord') === '1',
        exclude: queryOf(request, 'exclude'),
      }),
    )
  } catch (error) { // 非法正则是用户输入问题，必须给出可读提示而不是 500
    // 安全编译拒绝的写法带自己的错误码：过长、嵌套量词、语法非法，界面按码提示
    if (error instanceof SafeRegexError) {
      sendError(response, error.code, error.message)

      return
    }

    if (error instanceof SyntaxError) {
      sendError(response, 'REGEX_INVALID', `Invalid regular expression: ${error.message}`)

      return
    }

    respondFsError(response, error)
  }
}

/**
 * 把文件类异常翻译成 HTTP 响应。
 * @param response 响应对象
 * @param error 捕获到的异常
 */
function respondFsError(response: ServerResponse, error: unknown): void {
  if (error instanceof StaleFileError) {
    sendError(response, 'STALE_FILE', 'File has been modified externally', 409)

    return
  }

  if (error instanceof BodyError) {
    sendError(response, error.code, error.message, error.code === 'BODY_TOO_LARGE' ? 413 : 400)

    return
  }

  if (error instanceof FileTooLargeError) {
    sendError(response, 'FILE_TOO_LARGE', error.message, 413)

    return
  }

  if (error instanceof WorkspaceError) {
    const status = error.code === 'PATH_OUTSIDE_WORKSPACE' ? 403 : 400

    sendError(response, error.code, error.message, status)

    return
  }

  const code = (error as NodeJS.ErrnoException).code

  // Node 的 errno 直接映射成界面上有意义的几种，其余统一按 IO 失败处理
  if (code === 'ENOENT') {
    sendError(response, 'NOT_FOUND', String(error), 404)

    return
  }

  if (code === 'EEXIST') {
    sendError(response, 'ALREADY_EXISTS', 'Target already exists')

    return
  }

  if (code === 'EACCES' || code === 'EPERM') {
    sendError(response, 'PERMISSION_DENIED', 'Permission denied for this path', 403)

    return
  }

  if (code === 'EISDIR' || code === 'ENOTDIR') {
    sendError(response, 'NOT_A_FILE', String(error))

    return
  }

  console.error('[dsh-ide] 文件操作失败:', error)
  sendError(response, 'IO_ERROR', String(error), 500)
}
