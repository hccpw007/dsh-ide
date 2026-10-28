import type { IdeFeature } from '../shell/contract'

import { featureList } from './index'
import { createIdeRegistry } from '../shell/registry'

/**
 * 全插件共享的 feature 注册表；列表在构建期确定，运行期不再变化。
 *
 * 单独成文件供外壳与入口共用，避免两处各自创建注册表导致校验结果不一致。
 */
export const registry = createIdeRegistry(featureList)

/** 供外壳直接取用的分组结果，避免每次渲染重复分组。 */
export const toolWindowFeatures: IdeFeature[] = registry.bySlot('toolWindow')
export const bottomPanelFeatures: IdeFeature[] = registry.bySlot('bottomPanel')
