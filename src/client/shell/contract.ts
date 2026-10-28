/**
 * IDE feature 契约。
 *
 * 与 all-in-one 的差异：那边的 feature 只有「设置页卡片」一种形态（entry/page 或 switch），
 * 这里的功能是**常驻槽位**，因此按「渲染到哪里」分类，而不是按「有没有独立页面」分类。
 * 五类槽位互斥，各自只要求一个必需字段，具体校验见 registry.ts。
 */
import type { ComponentType, ReactNode } from 'react'

import type { LocaleDictionaries } from '../../common/locale'
import type { FeatureHostExtension } from '../../types/host'
import type { Translate } from '../../types/plugin'

/** feature 视图收到的 props。 */
export interface FeatureViewProps {
  /** 已绑定本 feature 前缀的翻译函数，组件内直接用 `title` 这类短 key。 */
  t: Translate
  /** 当前会话 id；承载面未绑定会话时是空串。 */
  sessionId: string
}

/** 编辑器区的标签类型：按地址认领内容并渲染。 */
export interface EditorContribution {
  /** 认领一个资源地址；返回 true 表示该地址由本类型渲染。 */
  canOpen(address: string): boolean
  /** 渲染指定地址的内容。 */
  render: ComponentType<FeatureViewProps & { address: string }>
}

/** feature 的槽位形态。 */
export type FeatureSlot = 'toolWindow' | 'bottomPanel' | 'editorTab' | 'statusBar' | 'service'

/**
 * 一条 IDE feature。
 *
 * 五个槽位字段互斥：
 *   toolWindow / bottomPanel  → view
 *   editorTab                 → editor
 *   statusBar                 → status
 *   service                   → host
 */
export interface IdeFeature {
  /** 唯一标识，同时作为语言 key 前缀与持久化 key，重复时只保留第一个。 */
  id: string
  /** 槽位形态，决定外壳从哪里读取组件。 */
  slot: FeatureSlot
  /** 本功能的中英文文案，外壳统一加 `<id>.` 前缀后注册。 */
  locales: LocaleDictionaries
  /** 排序权重，越小越靠前，默认 100，相同权重保持注册顺序。 */
  order?: number
  /** 工具条按钮与引导胶囊的图标；自带 SVG，不依赖宿主图标集。 */
  icon?: () => ReactNode
  /** toolWindow / bottomPanel 的主体。 */
  view?: ComponentType<FeatureViewProps>
  /** editorTab 的贡献。 */
  editor?: EditorContribution
  /** statusBar 的条目。 */
  status?: ComponentType<FeatureViewProps>
  /** 宿主侧扩展（路由、进程、目录监听）。 */
  host?: FeatureHostExtension
}
