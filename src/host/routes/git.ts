/**
 * Git 路由。
 *
 * 客户端只能调用方法表里存在的「方法名 + 结构化参数」，不能传任意命令串；
 * 新增能力必须显式改方法表，避免面板变成一个隐形的 git shell。
 * 唯一例外是 `init`：它要在还不是仓库的目录上执行，无法先解析仓库根，
 * 因此在方法表之外单独放行。
 *
 * 只读方法并发执行，写方法按仓库串行：读日志不该被一次 fetch 堵住，而并发写
 * 会破坏索引。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'

import { bodyString, readJsonBody } from '../../common/http-body'
import { sendError, sendOk } from '../../common/http-route'
import { GitError, forgetRepository, initRepository, resolveRepository, serialized } from '../services/git-service'

import { READ_METHODS } from './git-read'
import { WRITE_METHODS } from './git-write'

/**
 * POST /git/exec
 *
 * 请求体：method、cwd 与方法参数。
 * @param request 入站请求
 * @param response 响应对象
 */
export async function handleGitExec(request: IncomingMessage, response: ServerResponse): Promise<void> {
  // 单独提出工作区根：失败分支要靠它清掉已经失效的仓库根缓存
  let cwd = ''

  try {
    const body = await readJsonBody(request)
    const method = bodyString(body, 'method')
    cwd = bodyString(body, 'cwd')

    if (cwd === '') {
      sendError(response, 'CWD_REQUIRED', 'A working directory is required')

      return
    }

    // init 是唯一不需要「已经是仓库」的方法：它的作用就是把当前目录变成仓库，
    // 因此不进方法表、也不经过 resolveRepository，否则永远拿不到仓库根
    if (method === 'init') {
      sendOk(response, await serialized(cwd, () => initRepository(cwd)))

      return
    }

    const read = READ_METHODS[method]
    const write = WRITE_METHODS[method]

    if (read === undefined && write === undefined) {
      sendError(response, 'METHOD_UNKNOWN', `Unknown git method: ${method}`)

      return
    }

    const repo = await resolveRepository(cwd)
    if (repo === undefined) {
      sendError(response, 'GIT_NOT_REPOSITORY', 'The working directory is not a Git repository', 409)

      return
    }

    const value = write !== undefined ? await serialized(repo, () => write(repo, body)) : await read(repo, body)

    sendOk(response, value)
  } catch (error) { // Git 的 stderr 对用户最有价值，原样带回而不是套一层概括
    if (error instanceof GitError) {
      const message = error.stderr.trim() === '' ? error.message : error.stderr.trim()

      // 工作区里的 .git 被删掉后，仓库根缓存会让 git 以「not a git repository」失败；
      // 这与「本来就不是仓库」是同一件事，统一回 GIT_NOT_REPOSITORY 并清掉缓存，
      // 否则客户端会把它当成普通故障，继续按仓库显示图标与分支
      if (/not a git repository/i.test(error.stderr)) {
        forgetRepository(cwd)
        sendError(response, 'GIT_NOT_REPOSITORY', 'The working directory is not a Git repository', 409)

        return
      }

      // 真实命令行随失败信封一起回去，客户端控制台才能在命令失败时也回显完整参数
      const details = error.command === undefined ? undefined : { command: error.command }
      sendError(response, error.code, message, 400, details)

      return
    }

    console.error('[dsh-ide] Git request failed:', error)
    sendError(response, 'GIT_FAILED', String(error), 500)
  }
}
