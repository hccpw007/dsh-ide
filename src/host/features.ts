/**
 * 装配清单：所有 feature 的宿主侧扩展。
 *
 * 由 src/host/index.ts 统一注册，壳子只做聚合，不承载任何具体功能。
 * 新增宿主能力时在对应 feature 目录内实现 host.ts，然后在这里追加它的导出。
 *
 * P0 阶段还没有 feature，数组为空是预期状态。
 */
import type { FeatureHostExtension } from '../types/host'

export const featureHosts: FeatureHostExtension[] = []
