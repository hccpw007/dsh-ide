/**
 * 宿主客户端 API 的最小类型声明。
 *
 * 宿主包只发布运行时代码，没有对外类型，这里按插件实际用到的能力声明，
 * 避免在业务代码里散落 `any`。字段形状来自宿主 `dsh-client-ui-slots`、
 * `dsh-client-locale` 与 `dsh-client-ui-sidebar-right` 的实际调用约定。
 */
import type { ComponentType, ReactNode } from 'react'

/** 宿主注入的翻译函数，按语言包 key 取当前语言的文案。 */
export type Translate = (key: string) => string

/** 宿主 locale 服务：注册字典与绑定命名空间。 */
export interface LocaleApi {
  /** 注册某命名空间的语言字典，返回注销函数。 */
  register(namespace: string, locale: string, dictionary: Record<string, string>): () => void
  /** 绑定命名空间，得到只查该命名空间的翻译函数。 */
  bind(namespace: string): Translate
}

/**
 * 插槽描述。
 *
 * `id` 用于同一插槽内的导航标识，`key` 用于同类型的多格位正文（右侧栏 tab 正文
 * 就是按 `key` 对齐 tab 类型 id 的），两者语义不同，不能混用。
 */
export interface SlotDescriptor {
  /** 插槽名，如 `conversation.view`、`sidebar.right.pane.tab`。 */
  name: string
  /** 插槽内的注册标识；同一 single 插槽只有一个生效。 */
  id?: string
  /** 正文格位标识；右侧栏按 tab 类型的 id 取用。 */
  key?: string
  /** 排序权重，越小越靠前。 */
  order?: number
  /** 同一 single 插槽内优先级最低者渲染；默认 0。 */
  priority?: number
  /** 标签文案，供宿主渲染 View 页签。 */
  label?: () => string
  /** 语言命名空间，插槽组件会收到绑定该命名空间的 `t`。 */
  locale?: string
  /** 按会话 id 计算注入给组件的 props。 */
  inject?: (sessionId?: string) => Record<string, unknown>
}

/** 宿主 slot 服务：插槽就绪时执行工厂并注册组件。 */
export interface SlotsApi {
  /**
   * 在插槽可用后执行工厂。
   *
   * 工厂返回的注销函数由宿主在卸载时调用；部分宿主版本还会把注销函数直接返回，
   * 因此返回值必须按可调用性判断，不能假定一定存在。
   */
  inject(slot: string, factory: () => () => void): (() => void) | void
  /** 把组件注册进插槽，返回注销函数。 */
  register(descriptor: SlotDescriptor, component: ComponentType<Record<string, unknown>>): () => void
}

/** 右侧栏引导页的一个入口胶囊。 */
export interface SidebarTabGuideEntry {
  /** 入口 id，在同一 tab 类型内唯一。 */
  id: string
  /** 胶囊排序权重。 */
  order?: number
  /** 胶囊标题。 */
  title: () => string
  /** 胶囊说明；胶囊数量超过四个时宿主会隐藏说明。 */
  description?: () => string
  /** 胶囊图标。 */
  icon?: (props?: { size?: number }) => ReactNode
}

/** 右侧栏 tab 类型的注册参数。 */
export interface SidebarTabDefinition {
  /** tab 在 tab 系统里的身份，全部注册中唯一；重复注册会抛错。 */
  id: string
  /** tab 类型；页类型按 kind 打开，资源类型由 patterns 认领。 */
  kind: string
  /** 作用于 `dsh-resource://` 地址的 glob；页类型不填。 */
  patterns?: string[]
  /** 解析优先级档位：extension / builtin / fallback。 */
  priority?: string
  /** 否决某次资源命中。 */
  canOpen?: (address: string) => boolean
  /** 标签页标题。 */
  title: () => string
  /** 引导页入口；省略表示不占引导页。 */
  guide?: SidebarTabGuideEntry[]
  /** 声明后，切走标签不卸载正文。 */
  keepMounted?: boolean
}

/** 右侧栏 tab 类型注册表。 */
export interface SidebarRightTabsApi {
  /** 注册一个 tab 类型，返回注销函数。 */
  register(definition: SidebarTabDefinition): () => void
}

/** 插件上下文：只声明本插件实际依赖的宿主能力。 */
export interface PluginContext {
  /** 注册随插件生命周期自动清理的副作用。 */
  effect(effect: () => () => void, label?: string): void
  /** 在依赖服务就绪后执行回调，返回注销函数。 */
  inject(names: string[], callback: (ctx: PluginContext) => void): () => void
  /** 按服务名取服务；宿主不同版本的上下文可能只暴露这个入口。 */
  get?(name: string): unknown
  locale: LocaleApi
  slots: SlotsApi
}

/** 客户端插件定义，作为 ModuleLoader 工厂的默认导出。 */
export interface ClientPlugin {
  inject: string[]
  apply(ctx: PluginContext): void
}
