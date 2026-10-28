/**
 * Git 路由。
 *
 * 只暴露「方法名 + 结构化参数」，绝不接受任意命令串：客户端能做的每一件事都在
 * 读 / 写两张方法表里有明确条目，新增能力必须改方法表。
 *
 * 写操作按仓库串行执行：同一个仓库的 `merge`、`rebase` 与 `commit` 并发会互相
 * 破坏索引，排队是正确性要求而非性能优化。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'

import { bodyString, readJsonBody } from '../../common/http-body'
import { sendError, sendOk } from '../../common/http-route'
import { GitError, resolveRepository, serialized } from '../services/git-service'

import { READ_METHODS } from './git-read'
import { WRITE_METHODS } from './git-write'

/** 方法表：读与写合并在同一张分发表里。 */
const METHODS: Record<string, (repo: string, body: Record<string, unknown>) => Promise<unknown>> = {
  ...READ_METHODS,
  ...WRITE_METHODS,
}

/**
 * POST /git/exec
 *
 * 请求体：method、cwd、以及该方法的参数。
 * @param request 入站请求
 * @param response 响应对象
 */
export async function handleGitExec(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const body = await readJsonBody(request)
    const method = bodyString(body, 'method')
    const cwd = bodyString(body, 'cwd')

    if (cwd === '') {
      sendError(response, 'CWD_REQUIRED', '缺少工作目录')

      return
    }

    const run = METHODS[method]
    if (run === undefined) {
      sendError(response, 'METHOD_UNKNOWN', `未知的 git 方法: ${method}`)

      return
    }

    const repo = await resolveRepository(cwd)
    if (repo === undefined) {
      sendError(response, 'GIT_NOT_REPOSITORY', '工作目录不是 git 仓库', 409)

      return
    }

    sendOk(response, await serialized(repo, () => run(repo, body)))
  } catch (error) { // git 失败正文（stderr）对用户最有价值，原样带回
    if (error instanceof GitError) {
      const status = error.code === 'GIT_NOT_REPOSITORY' ? 409 : 400

      sendError(response, error.code, error.stderr.trim() === '' ? error.message : error.stderr.trim(), status)

      return
    }

    console.error('[dsh-ide] git 调用失败:', error)
    sendError(response, 'GIT_FAILED', String(error), 500)
  }
}
