/**
 * 三栏合并浮动窗口的打开状态。
 *
 * 窗口不占编辑器标签，状态若只放在外壳组件里，承载面一重建窗口就会无声消失。
 * 这里按「承载面 + 会话」记住正在合并的冲突文件：外壳重挂载时窗口原地恢复，
 * 主区与右侧栏各自独立，切换会话也不会把一个会话的合并窗口带到另一个会话。
 */

/** 键：承载面与会话，主区与右侧栏互不影响。 */
function keyOf(surface: string, sessionId: string): string {
  return `${surface}:${sessionId}`
}

/** 正在合并的冲突文件相对路径；键见 keyOf。 */
const openPaths = new Map<string, string>()

/** 订阅者集合：配置项变化时通知所有外壳实例。 */
const listeners = new Set<() => void>()

/**
 * 打开（或切换）某个承载面上的合并窗口。
 * @param surface 承载面；'main' 或 'sidebar'
 * @param sessionId 会话 id
 * @param path 冲突文件相对路径
 */
export function openMergeWindow(surface: string, sessionId: string, path: string): void {
  const key = keyOf(surface, sessionId)
  if (openPaths.get(key) === path) return

  openPaths.set(key, path)
  emit()
}

/**
 * 关闭某个承载面上的合并窗口。
 * @param surface 承载面
 * @param sessionId 会话 id
 */
export function closeMergeWindow(surface: string, sessionId: string): void {
  if (openPaths.delete(keyOf(surface, sessionId))) emit()
}

/**
 * 取某个承载面上正在合并的冲突文件。
 * @param surface 承载面
 * @param sessionId 会话 id
 * @returns 相对路径；窗口未打开时为 null
 */
export function mergeWindowPath(surface: string, sessionId: string): string | null {
  return openPaths.get(keyOf(surface, sessionId)) ?? null
}

/**
 * 订阅合并窗口状态变化。
 * @param listener 回调
 * @returns 取消订阅
 */
export function subscribeMergeWindow(listener: () => void): () => void {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}

/** 通知所有外壳实例重新读取状态；单个订阅者抛错不影响其它订阅者。 */
function emit(): void {
  for (const listener of listeners) {
    try {
      listener()
    } catch (error) { // 一个订阅者出错不应打断其余订阅者
      console.error('[dsh-ide] 合并窗口监听器抛错:', error)
    }
  }
}
