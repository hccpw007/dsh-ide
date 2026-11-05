/**
 * 懒加载内核的运行时加载器。
 *
 * 编辑器（CodeMirror）与终端（xterm）各打包成一个独立 ES 模块，由宿主侧的
 * `/dsh-ide/api/asset/<name>` 路由下发。这里必须用**原生** `import()`：
 * 主 bundle 被包成 ModuleLoader 的 CJS 工厂，esbuild 会把静态可见的 `import(x)`
 * 改写成 `require(x)`，而 chunk 是 ES 模块且不在 require 表里。因此经 `new Function`
 * 拿到一份未被改写的动态 import。
 *
 * 加载结果按名字缓存：同一个 chunk 只下载、解析一次，多个编辑器标签共享同一份模块实例。
 */

/** 支持的 chunk 名称。 */
export type LazyChunkName = 'editor-kernel' | 'terminal-kernel' | 'diff-kernel' | 'markdown-kernel'

/** 未被打包器改写的动态 import。 */
const nativeImport = new Function('url', 'return import(url)') as (url: string) => Promise<{ default?: unknown }>

/** chunk 缓存的 Promise，值与名字一一对应。 */
const cache = new Map<LazyChunkName, Promise<unknown>>()

/** 连续失败次数；用于指数退避，避免网络持续 500 时每次打开都重试。 */
const failures = new Map<LazyChunkName, number>()

/** 下一次允许重试的时间戳（毫秒）。 */
const retryAt = new Map<LazyChunkName, number>()

/** 首次重试的等待时间；之后按 2 倍递增。 */
const RETRY_BASE_MS = 2000

/** 重试等待的上限。 */
const RETRY_MAX_MS = 30_000

/** 懒加载 chunk 不可用；调用方据此展示「组件加载失败」而不是原始英文异常。 */
export class LazyChunkError extends Error {
  /**
   * @param chunk 失败（或处于退避期）的 chunk 名称
   * @param cause 原始异常
   */
  constructor(
    readonly chunk: LazyChunkName,
    cause?: unknown,
  ) {
    super(`Lazy chunk unavailable: ${chunk}`, { cause })
    this.name = 'LazyChunkError'
  }
}

/**
 * 加载一个 chunk。
 *
 * 失败后按 2s、4s、8s…（上限 30s）退避：构建产物缺失或宿主暂时 500 时，
 * 用户每点一次编辑器都不该重新付一次失败请求的代价。
 * @param name chunk 名称
 * @returns 模块的默认导出
 * @throws LazyChunkError chunk 不可用
 */
export function loadLazyChunk<T>(name: LazyChunkName): Promise<T> {
  const cached = cache.get(name)
  if (cached !== undefined) return cached as Promise<T>

  const blockedUntil = retryAt.get(name) ?? 0

  if (Date.now() < blockedUntil) return Promise.reject(new LazyChunkError(name))

  const url = `/dsh-ide/api/asset/${name}`

  const promise = nativeImport(url)
    .then((module) => {
      if (module.default === undefined) throw new Error(`chunk ${name} 没有默认导出`)

      failures.delete(name)
      retryAt.delete(name)

      return module.default
    })
    .catch((error: unknown) => {
      // 失败不能留在缓存里，否则一次网络抖动会让编辑器永久不可用
      cache.delete(name)

      const count = (failures.get(name) ?? 0) + 1
      failures.set(name, count)
      retryAt.set(name, Date.now() + Math.min(RETRY_BASE_MS * 2 ** (count - 1), RETRY_MAX_MS))
      console.error('[dsh-ide] 加载懒加载 chunk 失败:', name, error)

      throw error instanceof LazyChunkError ? error : new LazyChunkError(name, error)
    })

  cache.set(name, promise)

  return promise as Promise<T>
}
