/**
 * 工作台布局状态。
 *
 * 面板开合与激活项按工作空间隔离：同一项目的不同对话、不同承载面共用同一份布局，
 * 各自记住上次用的是哪个工具窗口、底部面板是否展开；工具窗口宽度与底部面板高度
 * 是插件级视觉偏好，全局共用一套，切换项目不重置。状态存在 localStorage，且只在
 * 工作台挂载时读取——不放进插件启动路径，避免为一个还没被打开的视图付出启动开销。
 */
import { useMemo, useSyncExternalStore } from 'react'

import { readLayoutSize, writeLayoutSize } from '../../common/persisted-layout'

/** 工作台布局。 */
export interface WorkbenchLayout {
  /** 左侧工具窗口宽度（px）。 */
  toolWindowWidth: number
  /** 当前激活的工具窗口 feature id；null 表示收起。 */
  toolWindowActive: string | null
  /** 是否已记录过工具窗口选择；旧版本布局没有该字段，需要补上默认展开项。 */
  toolWindowInitialized: boolean
  /** 底部面板高度（px）。 */
  bottomPanelHeight: number
  /** 底部面板是否展开。 */
  bottomPanelOpen: boolean
  /** 当前激活的底部面板 feature id；null 表示还没选过。 */
  bottomPanelActive: string | null
}

/** 尺寸上下限：允许拖拽，但不允许拖到不可用的极值。 */
const MIN_TOOL_WINDOW_WIDTH = 180
const MAX_TOOL_WINDOW_WIDTH = 560
const MIN_BOTTOM_PANEL_HEIGHT = 120
const MAX_BOTTOM_PANEL_HEIGHT = 520

/** 没有保存过布局时的默认值；工具窗口的默认激活项由调用方按首个 feature 决定。 */
const DEFAULT_LAYOUT: WorkbenchLayout = {
  toolWindowWidth: 260,
  toolWindowActive: null,
  toolWindowInitialized: true,
  bottomPanelHeight: 200,
  // 默认收起底部面板：与 IDEA 一致，首次打开工作台先把空间留给编辑区，
  // 需要时点左侧列下方的图标展开
  bottomPanelOpen: false,
  bottomPanelActive: null,
}

/** 布局落盘的合并延迟：拖拽期间持续变化，停手后再写一次。 */
const LAYOUT_SAVE_DELAY_MS = 200

/** 尺寸落盘用的全局布局标识：整个插件共用一套，切换工作空间不重置。 */
const TOOL_WINDOW_WIDTH_KEY = 'workbench.toolWindowWidth'
const BOTTOM_PANEL_HEIGHT_KEY = 'workbench.bottomPanelHeight'

/**
 * localStorage 前缀；带版本段，格式变更时直接换版本而不是迁移。
 *
 * v2：布局改为按工作空间持久化，同一项目的不同对话共用一份；旧版本按会话存的
 * 数据不再读取，不做迁移。
 */
const STORAGE_PREFIX = 'dsh-ide.layout.v2.'

/**
 * 生成某个承载面的首次布局。
 * @param defaultToolWindowId 首个工具窗口 feature id；null 表示没有工具窗口
 * @returns 默认布局
 */
function defaultLayoutFor(defaultToolWindowId: string | null): WorkbenchLayout {
  return { ...DEFAULT_LAYOUT, toolWindowActive: defaultToolWindowId }
}

/**
 * 把数值收进合法区间。
 * @param value 原始值
 * @param min 下限
 * @param max 上限
 * @returns 收窄后的数值
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * 读取指定工作空间的布局。
 *
 * 尺寸从全局存储取：即使这个工作空间还没有任何记录，也要沿用上次拖出来的宽度与
 * 高度。工作空间存储只放面板开合与激活项；存储里可能是旧格式或被外部改坏的数据，
 * 因此逐字段做类型校验，任何一项不合法就回退到默认值，不让坏数据把工作台渲染
 * 成一团。
 * @param storageKey 持久化键（工作空间键）；空串表示承载面未绑定工作空间
 * @param defaultToolWindowId 首次打开时默认激活的工具窗口 feature id
 * @returns 该工作空间的布局
 */
function loadLayout(storageKey: string, defaultToolWindowId: string | null): WorkbenchLayout {
  const sizes: Pick<WorkbenchLayout, 'toolWindowWidth' | 'bottomPanelHeight'> = {
    toolWindowWidth:
      readLayoutSize(TOOL_WINDOW_WIDTH_KEY, MIN_TOOL_WINDOW_WIDTH, MAX_TOOL_WINDOW_WIDTH)
      ?? DEFAULT_LAYOUT.toolWindowWidth,
    bottomPanelHeight:
      readLayoutSize(BOTTOM_PANEL_HEIGHT_KEY, MIN_BOTTOM_PANEL_HEIGHT, MAX_BOTTOM_PANEL_HEIGHT)
      ?? DEFAULT_LAYOUT.bottomPanelHeight,
  }

  if (storageKey === '') return { ...defaultLayoutFor(defaultToolWindowId), ...sizes }

  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${storageKey}`)
    if (raw === null) return { ...defaultLayoutFor(defaultToolWindowId), ...sizes }

    const parsed = JSON.parse(raw) as Partial<WorkbenchLayout>
    const activeId = parsed.toolWindowActive
    const bottomId = parsed.bottomPanelActive
    // 旧布局没有 initialized 字段：视为还没选过工具窗口，补上默认展开项而不是保持收起
    const initialized = parsed.toolWindowInitialized === true

    return {
      ...sizes,
      toolWindowActive: initialized ? (typeof activeId === 'string' ? activeId : null) : defaultToolWindowId,
      toolWindowInitialized: true,
      bottomPanelOpen: parsed.bottomPanelOpen === true,
      bottomPanelActive: typeof bottomId === 'string' ? bottomId : null,
    }
  } catch (error) { // 存储不可用或内容损坏时，内存态仍要能正常工作
    console.error('[dsh-ide] 读取工作台布局失败，使用默认布局:', error)

    return { ...defaultLayoutFor(defaultToolWindowId), ...sizes }
  }
}

/** 工作空间维度的布局：只含面板开合与激活项，尺寸走全局存储。 */
interface WorkspaceLayout {
  /** 当前激活的工具窗口 feature id；null 表示收起。 */
  toolWindowActive: string | null
  /** 是否已记录过工具窗口选择。 */
  toolWindowInitialized: boolean
  /** 底部面板是否展开。 */
  bottomPanelOpen: boolean
  /** 当前激活的底部面板 feature id。 */
  bottomPanelActive: string | null
}

/**
 * 写入指定工作空间的布局。
 *
 * 尺寸与面板状态分开存：尺寸写全局键，切换工作空间时不会被该工作空间的旧记录覆盖。
 * @param storageKey 持久化键（工作空间键）
 * @param layout 待保存的布局
 */
function saveLayout(storageKey: string, layout: WorkbenchLayout): void {
  if (storageKey === '') return

  try {
    writeLayoutSize(TOOL_WINDOW_WIDTH_KEY, layout.toolWindowWidth)
    writeLayoutSize(BOTTOM_PANEL_HEIGHT_KEY, layout.bottomPanelHeight)

    const workspace: WorkspaceLayout = {
      toolWindowActive: layout.toolWindowActive,
      toolWindowInitialized: layout.toolWindowInitialized,
      bottomPanelOpen: layout.bottomPanelOpen,
      bottomPanelActive: layout.bottomPanelActive,
    }

    window.localStorage.setItem(`${STORAGE_PREFIX}${storageKey}`, JSON.stringify(workspace))
  } catch (error) { // 隐私模式下写入会失败，此时布局只在本次会话内有效
    console.error('[dsh-ide] 保存工作台布局失败:', error)
  }
}

/**
 * 把拖拽得到的新尺寸收进该字段的合法区间。
 *
 * 收窄放在这里而不是拖拽组件里：分隔条只报告指针位移的结果，
 * 尺寸语义（多宽算合法）属于布局本身。
 * @param field 要调整的尺寸字段
 * @param value 指针拖动后的原始尺寸
 * @returns 收窄后的尺寸
 */
export function clampLayoutSize(field: 'toolWindowWidth' | 'bottomPanelHeight', value: number): number {
  return field === 'toolWindowWidth'
    ? clamp(value, MIN_TOOL_WINDOW_WIDTH, MAX_TOOL_WINDOW_WIDTH)
    : clamp(value, MIN_BOTTOM_PANEL_HEIGHT, MAX_BOTTOM_PANEL_HEIGHT)
}

/** 布局 hook 的返回值。 */
export interface WorkbenchLayoutHandle {
  /** 当前布局。 */
  layout: WorkbenchLayout
  /** 局部更新布局；只传变化的字段。 */
  update(patch: Partial<WorkbenchLayout>): void
}

/**
 * 管理工作台布局并负责落盘。
 *
 * 状态放在按 `scopeKey` 缓存的模块级 store 里：共享开关打开时同一工作空间的所有
 * 承载面用同一个 key，于是拖分隔条、切工具窗口在哪个承载面做，其它承载面立刻跟着变；
 * 关闭共享时调用方给带实例后缀的 key，各自独立。落盘合并成「停手后再写一次」，
 * 避免拖拽期间每帧序列化 localStorage 卡住主线程。
 * @param storageKey 持久化键（工作空间键）
 * @param defaultToolWindowId 首次打开时默认激活的工具窗口 feature id
 * @param scopeKey 布局作用域键
 * @param persist 是否写回 localStorage
 * @returns 布局与更新函数
 */
export function useWorkbenchLayout(
  storageKey: string,
  defaultToolWindowId: string | null,
  scopeKey: string,
  persist: boolean,
): WorkbenchLayoutHandle {
  const store = useMemo(
    () => layoutStore(scopeKey, storageKey, defaultToolWindowId, persist),
    [defaultToolWindowId, persist, scopeKey, storageKey],
  )
  const layout = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)

  return { layout, update: store.update }
}

/** 一份布局状态的读写入口。 */
interface LayoutStore {
  /** 当前布局；引用稳定，只在更新时替换。 */
  getSnapshot(): WorkbenchLayout
  /** 订阅变化。 */
  subscribe(listener: () => void): () => void
  /** 合并更新，并在停手后落盘。 */
  update(patch: Partial<WorkbenchLayout>): void
}

/** 按 scopeKey 缓存的布局池。 */
const layoutStores = new Map<string, LayoutStore>()

/**
 * 取某个作用域的布局状态；不存在时创建。
 * @param scopeKey 作用域键
 * @param storageKey 持久化键（工作空间键）
 * @param defaultToolWindowId 首次打开时默认激活的工具窗口
 * @param persist 是否落盘
 * @returns 布局入口
 */
function layoutStore(
  scopeKey: string,
  storageKey: string,
  defaultToolWindowId: string | null,
  persist: boolean,
): LayoutStore {
  const existing = layoutStores.get(scopeKey)

  if (existing !== undefined) return existing

  let layout = loadLayout(storageKey, defaultToolWindowId)
  let saveTimer: number | undefined

  const listeners = new Set<() => void>()

  const store: LayoutStore = {
    getSnapshot: () => layout,
    subscribe: (listener) => {
      listeners.add(listener)

      return () => {
        listeners.delete(listener)
      }
    },
    update: (patch) => {
      layout = { ...layout, ...patch }

      // 只有共享实例负责落盘：多个独立实例写同一工作空间会互相覆盖
      if (persist) {
        window.clearTimeout(saveTimer)
        saveTimer = window.setTimeout(() => saveLayout(storageKey, layout), LAYOUT_SAVE_DELAY_MS)
      }

      for (const listener of listeners) listener()
    },
  }

  layoutStores.set(scopeKey, store)

  return store
}
