/**
 * IDE 插件的用户偏好。
 *
 * 宿主没有给插件单独的设置通道，这两个开关只影响插件自身行为，因此用
 * localStorage 持久化：刷新、重开工作台都沿用，换会话也不重置。
 */
import { useSyncExternalStore } from 'react'

/** 插件偏好。 */
export interface IdePreferences {
  /** 是否在对话页底部操作行显示 IDE 弹窗入口按钮。 */
  readonly popupButtonVisible: boolean
  /** 同一工作空间是否共用一个 IDE：打开的文件与布局跨承载面实时同步。 */
  readonly sharedWorkspace: boolean
}

/** 存储键；带版本段，字段变更时换版本而不迁移。 */
const STORAGE_KEY = 'dsh-ide.preferences.v1'

/** 默认值：按钮默认显示，IDE 默认共享（用户明确要求的默认形态）。 */
const DEFAULT_PREFERENCES: IdePreferences = {
  popupButtonVisible: true,
  sharedWorkspace: true,
}

/**
 * 读取持久化偏好。
 * @returns 偏好；存储不可用或内容损坏时返回默认值
 */
function readPreferences(): IdePreferences {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)

    if (raw === null) return DEFAULT_PREFERENCES

    const parsed: unknown = JSON.parse(raw)

    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_PREFERENCES

    const candidate = parsed as { popupButtonVisible?: unknown; sharedWorkspace?: unknown }

    return {
      popupButtonVisible:
        typeof candidate.popupButtonVisible === 'boolean'
          ? candidate.popupButtonVisible
          : DEFAULT_PREFERENCES.popupButtonVisible,
      sharedWorkspace:
        typeof candidate.sharedWorkspace === 'boolean'
          ? candidate.sharedWorkspace
          : DEFAULT_PREFERENCES.sharedWorkspace,
    }
  } catch (error) { // 隐私模式或内容损坏时退回默认值，不影响工作台使用
    console.error('[dsh-ide] 读取 IDE 偏好失败:', error)

    return DEFAULT_PREFERENCES
  }
}

/** 当前偏好；只在提交时整体替换，保证订阅方拿到稳定引用。 */
let preferences: IdePreferences = readPreferences()

/** 订阅者集合。 */
const listeners = new Set<() => void>()

/**
 * 订阅偏好变化。
 * @param listener 变化回调
 * @returns 取消订阅函数
 */
export function subscribePreferences(listener: () => void): () => void {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}

/**
 * 读取当前偏好。
 * @returns 偏好快照
 */
export function idePreferences(): IdePreferences {
  return preferences
}

/**
 * 修改一个偏好并落盘。
 * @param key 偏好字段
 * @param value 新值
 */
export function setPreference<K extends keyof IdePreferences>(key: K, value: IdePreferences[K]): void {
  if (preferences[key] === value) return

  preferences = { ...preferences, [key]: value }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
  } catch (error) { // 写入失败只影响下次启动，本次会话仍按新值运行
    console.error('[dsh-ide] 保存 IDE 偏好失败:', error)
  }

  for (const listener of listeners) listener()
}

/**
 * 订阅偏好的 React 钩子。
 * @returns 当前偏好
 */
export function useIdePreferences(): IdePreferences {
  return useSyncExternalStore(subscribePreferences, idePreferences, idePreferences)
}
