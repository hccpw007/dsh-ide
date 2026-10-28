/**
 * dsh-ide 的宿主侧入口。
 *
 * 壳子只负责装配：合并各 feature 的宿主服务依赖，注册插件路由，并依次调用
 * feature 的 apply。具体能力（文件读写、Git、进程）由 feature 目录内的 host.ts 实现。
 *
 * 宿主按 package.json 的 exports 直接加载根目录 index.js（JS），
 * 源码放在这里，由 build.ts 产出同名产物。
 */
import type { HostPluginContext } from '../types/host'

import { featureHosts } from './features'
import { registerRoutes } from './routes'

/** 合并壳子与全部 feature 的宿主服务依赖，去重后作为插件的 inject。 */
export const inject = Array.from(
  new Set(['webServer', ...featureHosts.flatMap((feature) => feature.inject ?? [])]),
)

/**
 * 宿主加载插件时调用。
 * @param ctx 宿主插件上下文
 */
export function apply(ctx: HostPluginContext): void {
  // 路由依赖 webServer；服务缺失时只记日志，不阻断 feature 的其它宿主能力
  ctx.inject(['webServer'], (scoped) => {
    const webServer = scoped.webServer
    if (webServer === undefined) {
      console.error('[dsh-ide] 宿主未提供 webServer，文件与 Git 路由不可用')

      return
    }

    ctx.effect(() => registerRoutes(webServer), 'dsh-ide: routes')
  })

  for (const feature of featureHosts) {
    try {
      feature.apply(ctx)
    } catch (error) { // 单个 feature 出错不应影响其它 feature 与路由
      console.error('[dsh-ide] feature 宿主扩展启动失败:', error)
    }
  }
}
