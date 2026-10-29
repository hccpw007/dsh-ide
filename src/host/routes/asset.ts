/**
 * 懒加载 chunk 的资产路由。
 *
 * 编辑器与终端内核是独立的 ES 模块，由浏览器在首次使用时 `import()` 拉取；
 * 它们不能放进 client.js 的 ModuleLoader 工厂里（那里是 CJS）。因此这里把
 * `chunks/` 下的文件按固定 URL 下发。
 *
 * 只允许下发清单里的名字：路由参数直接来自 URL，任何路径拼接都可能被
 * `../../../etc/passwd` 之类的写法利用。
 */
import { readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { sendError } from '../../common/http-route'

/** chunk 目录：产物与本文件在打包后同处根目录，因此以 index.js 位置为基准。 */
const CHUNK_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'chunks')

/** 允许下发的 chunk 白名单。 */
const ALLOWED_CHUNKS = new Set([
  'editor-kernel.js',
  'terminal-kernel.js',
  'diff-kernel.js',
  'markdown-kernel.js',
])

/**
 * GET /asset/<name>
 *
 * @param request 入站请求
 * @param response 响应对象
 */
export async function handleAsset(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const raw = (request.url ?? '').split('?')[0] ?? ''
  const requested = raw.slice(raw.lastIndexOf('/') + 1)
  // 运行时按 chunk 名导入（`/asset/editor-kernel`），扩展名由这里补上
  const name = requested.endsWith('.js') ? requested : `${requested}.js`

  if (!ALLOWED_CHUNKS.has(name)) {
    sendError(response, 'ASSET_NOT_FOUND', `Unknown chunk: ${requested}`, 404)

    return
  }

  try {
    const content = await readFile(path.join(CHUNK_DIR, name))

    response.writeHead(200, {
      'content-type': 'text/javascript; charset=utf-8',
      'cache-control': 'no-cache',
      'content-length': content.byteLength,
    })
    response.end(content)
  } catch (error) { // 未构建出 chunk 时给出明确提示，而不是空响应
    console.error('[dsh-ide] 读取 chunk 失败:', name, error)
    sendError(response, 'ASSET_MISSING', `Chunk has not been built: ${name}`, 404)
  }
}
