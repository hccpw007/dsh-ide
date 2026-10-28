/**
 * 装配清单：需要随插件注册/注销的 feature 级宿主扩展。
 *
 * 普通宿主能力（文件、git、进程）集中在 `src/host/services/`，由 `src/host/routes/`
 * 统一挂到插件路由上；这里只登记那些必须参与宿主 Context 生命周期的扩展
 * （例如需要 `ctx.effect` 持有长期订阅的能力）。当前没有这样的扩展。
 */
import type { FeatureHostExtension } from '../types/host'

/** 需要随插件生命周期注册的宿主扩展。 */
export const featureHosts: FeatureHostExtension[] = []
