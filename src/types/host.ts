/**
 * 宿主侧插件 API 的最小类型声明。
 *
 * 宿主只提供运行时代码，这里按本插件实际用到的能力声明，避免业务代码里散落 `any`。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'

/** Web 服务器的一条路由。 */
export interface WebServerRoute {
  kind: 'exact' | 'prefix'
  path: string
  handler: (request: IncomingMessage, response: ServerResponse) => unknown
}

/** Web 服务器服务：注册具名路由，返回注销函数。 */
export interface WebServerApi {
  register(route: WebServerRoute): () => void
}

/** 宿主侧插件上下文：只声明本插件实际依赖的能力。 */
export interface HostPluginContext {
  /** 注册随插件生命周期自动清理的副作用，回调返回清理函数。 */
  effect(effect: () => () => void, label?: string): void
  /** 在依赖服务就绪后执行回调，回调拿到带对应服务的子上下文。 */
  inject(names: string[], callback: (ctx: HostPluginContext) => void): () => void
  /** Web 服务器服务；通过 inject 取得后可用。 */
  webServer?: WebServerApi
}

/**
 * feature 提供的宿主侧扩展。
 *
 * 由 `src/client/features/host.ts` 之外的宿主装配清单聚合，
 * `src/host/index.ts` 只做统一注册。
 */
export interface FeatureHostExtension {
  /** 本扩展依赖的宿主服务，装配时合并去重后作为插件的 inject。 */
  inject?: string[]
  /** 注册本扩展的宿主能力。 */
  apply(ctx: HostPluginContext): void
}
