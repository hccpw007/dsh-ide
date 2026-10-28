/**
 * feature 注册表的各槽位分组。
 *
 * 单独成文件供外壳与入口共用，避免两处各自创建注册表导致校验结果不一致。
 */
import type { FeatureSlot, IdeFeature } from '../shell/contract'

import { featureList } from './index'
import { createIdeRegistry } from '../shell/registry'

/**
 * 全插件共享的 feature 注册表；列表在构建期确定，运行期不再变化。
 */
export const registry = createIdeRegistry(featureList)

/**
 * 取某个槽位下的 feature。
 * @param slot 槽位
 * @returns 该槽位下按 order 排好的 feature
 */
function ofSlot(slot: FeatureSlot): IdeFeature[] {
  return registry.bySlot(slot)
}

/** 供外壳直接取用的分组结果，避免每次渲染重复分组。 */
export const toolWindowFeatures: IdeFeature[] = ofSlot('toolWindow')
export const bottomPanelFeatures: IdeFeature[] = ofSlot('bottomPanel')
export const editorFeatures: IdeFeature[] = ofSlot('editorTab')
export const statusBarFeatures: IdeFeature[] = ofSlot('statusBar')
