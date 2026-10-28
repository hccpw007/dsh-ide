/**
 * 工作台布局状态。
 *
 * 布局按会话隔离：每个会话对应一个项目，工具窗口宽度与底部面板高度各记各的。
 * 状态存在 localStorage，且只在工作台挂载时读取——不放进插件启动路径，
 * 避免为一个还没被打开的视图付出启动开销。
 */
import { useCallback, useEffect, useState } from 'react'

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

/** localStorage 前缀；带版本段，格式变更时直接换版本而不是迁移。 */
const STORAGE_PREFIX = 'dsh-ide.layout.v1.'

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
 * 读取指定会话的布局。
 *
 * 存储里可能是旧格式或被外部改坏的数据，因此逐字段做类型与范围校验；
 * 任何一项不合法就回退到默认值，不让坏数据把工作台渲染成一团。
 * @param sessionId 会话 id；空串表示承载面未绑定会话
 * @param defaultToolWindowId 首次打开时默认激活的工具窗口 feature id
 * @returns 该会话的布局
 */
function loadLayout(sessionId: string, defaultToolWindowId: string | null): WorkbenchLayout {
  if (sessionId === '') return defaultLayoutFor(defaultToolWindowId)

  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${sessionId}`)
    if (raw === null) return defaultLayoutFor(defaultToolWindowId)

    const parsed = JSON.parse(raw) as Partial<WorkbenchLayout>
    const activeId = parsed.toolWindowActive
    const bottomId = parsed.bottomPanelActive
    // 旧布局没有 initialized 字段：视为还没选过工具窗口，补上默认展开项而不是保持收起
    const initialized = parsed.toolWindowInitialized === true

    return {
      toolWindowWidth: clamp(
        typeof parsed.toolWindowWidth === 'number' ? parsed.toolWindowWidth : DEFAULT_LAYOUT.toolWindowWidth,
        MIN_TOOL_WINDOW_WIDTH,
        MAX_TOOL_WINDOW_WIDTH,
      ),
      toolWindowActive: initialized ? (typeof activeId === 'string' ? activeId : null) : defaultToolWindowId,
      toolWindowInitialized: true,
      bottomPanelHeight: clamp(
        typeof parsed.bottomPanelHeight === 'number' ? parsed.bottomPanelHeight : DEFAULT_LAYOUT.bottomPanelHeight,
        MIN_BOTTOM_PANEL_HEIGHT,
        MAX_BOTTOM_PANEL_HEIGHT,
      ),
      bottomPanelOpen: parsed.bottomPanelOpen === true,
      bottomPanelActive: typeof bottomId === 'string' ? bottomId : null,
    }
  } catch (error) { // 存储不可用或内容损坏时，内存态仍要能正常工作
    console.error('[dsh-ide] 读取工作台布局失败，使用默认布局:', error)

    return defaultLayoutFor(defaultToolWindowId)
  }
}

/**
 * 写入指定会话的布局。
 * @param sessionId 会话 id
 * @param layout 待保存的布局
 */
function saveLayout(sessionId: string, layout: WorkbenchLayout): void {
  if (sessionId === '') return

  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${sessionId}`, JSON.stringify(layout))
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
 * @param sessionId 当前会话 id
 * @param defaultToolWindowId 首次打开时默认激活的工具窗口 feature id
 * @returns 布局与更新函数
 */
export function useWorkbenchLayout(
  sessionId: string,
  defaultToolWindowId: string | null,
): WorkbenchLayoutHandle {
  const [layout, setLayout] = useState(() => loadLayout(sessionId, defaultToolWindowId))

  // 切换到另一个会话时换用那个会话自己的布局
  useEffect(() => {
    setLayout(loadLayout(sessionId, defaultToolWindowId))
  }, [sessionId, defaultToolWindowId])

  // 布局变化后落盘；首次挂载写回的是读出来的同一份值，不会污染存储
  useEffect(() => {
    saveLayout(sessionId, layout)
  }, [sessionId, layout])

  const update = useCallback((patch: Partial<WorkbenchLayout>) => {
    setLayout((previous) => ({ ...previous, ...patch }))
  }, [])

  return { layout, update }
}
