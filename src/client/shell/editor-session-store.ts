/**
 * 编辑器标签状态的跨承载面共享。
 *
 * 同一个工作空间可能同时出现在多个承载面（主区页签、右侧栏、对话页弹窗），
 * 也可能被多个对话共同使用。共享开关打开时它们必须看到同一份标签与激活项，
 * 所以状态按 `scopeKey` 收进模块级单例池；关闭共享时调用方传入带实例后缀的 key，
 * 各自一份、互不影响。
 *
 * 持久化按工作空间键落到 `editor-store`：只有共享实例写盘，避免多份实例互相覆盖。
 */
import { loadEditorState, saveEditorState, type StoredEditorState } from './editor-store'

/** 一份编辑器状态的读写入口。 */
export interface EditorSessionStore {
  /** 当前快照；引用稳定，只在更新时替换。 */
  getSnapshot(): StoredEditorState
  /** 订阅变化。 */
  subscribe(listener: () => void): () => void
  /** 按上一次状态计算新状态。 */
  update(updater: (previous: StoredEditorState) => StoredEditorState): void
}

/** 按 scopeKey 缓存的状态池。 */
const stores = new Map<string, EditorSessionStore>()

/** 空状态：会话未绑定时的占位。 */
const EMPTY_STATE: StoredEditorState = { tabs: [], active: '' }

/**
 * 创建一份状态。
 * @param storageKey 持久化键（工作空间键）
 * @param persist 是否写回 localStorage
 * @returns 状态入口
 */
function createStore(storageKey: string, persist: boolean): EditorSessionStore {
  let state: StoredEditorState = storageKey === '' ? EMPTY_STATE : loadEditorState(storageKey)

  const listeners = new Set<() => void>()

  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener)

      return () => {
        listeners.delete(listener)
      }
    },
    update: (updater) => {
      const next = updater(state)

      if (next === state) return

      state = next

      // 只有共享实例负责落盘：多个独立实例写同一工作空间会互相覆盖
      if (persist && storageKey !== '') saveEditorState(storageKey, state)

      for (const listener of listeners) listener()
    },
  }
}

/**
 * 取某个作用域的编辑器状态；不存在时创建。
 * @param scopeKey 作用域键（共享时等于工作空间键，独立时带实例后缀）
 * @param storageKey 持久化键（工作空间键）
 * @param persist 是否持久化
 * @returns 状态入口
 */
export function editorSessionStore(scopeKey: string, storageKey: string, persist: boolean): EditorSessionStore {
  const existing = stores.get(scopeKey)

  if (existing !== undefined) return existing

  const store = createStore(storageKey, persist)
  stores.set(scopeKey, store)

  return store
}
