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

/**
 * 加载一个 chunk。
 * @param name chunk 名称
 * @returns 模块的默认导出
 */
export function loadLazyChunk<T>(name: LazyChunkName): Promise<T> {
  const cached = cache.get(name)
  if (cached !== undefined) return cached as Promise<T>

  const url = `/dsh-ide/api/asset/${name}`

  const promise = nativeImport(url)
    .then((module) => {
      if (module.default === undefined) throw new Error(`chunk ${name} 没有默认导出`)

      return module.default
    })
    .catch((error: unknown) => {
      // 失败不能留在缓存里，否则一次网络抖动会让编辑器永久不可用
      cache.delete(name)
      console.error('[dsh-ide] 加载懒加载 chunk 失败:', name, error)

      throw error
    })

  cache.set(name, promise)

  return promise as Promise<T>
}
