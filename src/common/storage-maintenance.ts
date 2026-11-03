/**
 * 本地存储的清理与配额兜底。
 *
 * 插件从不主动删除自己写下的界面记录：换过版本的前缀、被删掉的项目与会话都会
 * 一直占着浏览器分给本源的配额。配额是宿主与所有插件共用的，占满后每次写入都会
 * 抛配错且只落在控制台，用户只会看到「布局和标签突然记不住了」。
 *
 * 这里集中处理两件事：插件启动后在浏览器空闲帧清掉已失效的旧版本前缀（当前代码
 * 根本不读，清理无副作用），以及写入触发配额上限时按「旧版本 → 其它工作空间/会话」
 * 的顺序腾出空间，让当前这次写入仍能成功。存储被浏览器禁用（隐私模式）时只记录
 * 日志，界面功能不受影响。
 */

/** 已失效的历史键前缀：当前代码不再读取，删除不会丢失任何可用状态。 */
const DEPRECATED_PREFIXES: readonly string[] = [
  'dsh-ide.editors.v1.',
  'dsh-ide.editors.v2.',
  'dsh-ide.layout.v1.',
]

/** 全局键前缀：与项目、会话无关，任何情况下都不淘汰。 */
const GLOBAL_PREFIXES: readonly string[] = [
  'dsh-ide.preferences.v1',
  'dsh-ide.theme.v1',
  'dsh-ide.layout-size.v1.',
  'dsh-ide.project-tree.v1.',
]

/** 清理标记键：记录已执行清理的版本，避免每次启动都全量遍历存储。 */
const CLEANUP_MARKER_KEY = 'dsh-ide.cleanup.v1'

/** 清理版本号：新增已失效前缀时递增，下一次启动即重新执行清理。 */
const CLEANUP_VERSION = 1

/** 会话级键前缀：只影响单个会话的界面记忆，配额紧张时最先淘汰。 */
const SESSION_PREFIXES: readonly string[] = [
  'dsh-ide.terminal.v1.',
  'dsh-ide.git-tab.v1.',
  'dsh-ide.bookmarks.v1.',
]

/** 工作空间级键前缀：淘汰完会话级才动，尽量保住其它项目最近一次界面。 */
const WORKSPACE_PREFIXES: readonly string[] = ['dsh-ide.layout.v2.', 'dsh-ide.editors.v3.']

/** 分支收藏的前缀；键后缀是绝对路径，需要补上工作空间标识前缀才能与其它键对齐。 */
const FAVORITES_PREFIX = 'dsh-ide.git.favorites.v1.'

/**
 * 判断键是否属于已失效的历史版本。
 * @param key 存储键
 * @returns 是否已失效
 */
function isDeprecated(key: string): boolean {
  return DEPRECATED_PREFIXES.some((prefix) => key.startsWith(prefix))
}

/**
 * 判断键是否与项目、会话无关的全局键。
 * @param key 存储键
 * @returns 是否为全局键
 */
function isGlobal(key: string): boolean {
  return GLOBAL_PREFIXES.some((prefix) => key.startsWith(prefix))
}

/**
 * 取键所属的上下文标识。
 *
 * 同一上下文的记录在配额兜底时一起保留：写某个项目的标签时不能顺手把它自己的
 * 布局删掉。无法识别的键返回空串，调用方据此跳过，避免误删将来新增的键。
 * @param key 存储键
 * @returns 上下文标识；无法识别时为空串
 */
function contextOf(key: string): string {
  for (const prefix of SESSION_PREFIXES) {
    if (key.startsWith(prefix)) return `session:${key.slice(prefix.length)}`
  }

  for (const prefix of WORKSPACE_PREFIXES) {
    if (key.startsWith(prefix)) return key.slice(prefix.length)
  }

  if (key.startsWith(FAVORITES_PREFIX)) return `ws:${key.slice(FAVORITES_PREFIX.length)}`

  return ''
}

/**
 * 判断异常是否为存储配额不足。
 *
 * Safari 旧版本用 `NS_ERROR_DOM_QUOTA_REACHED`，其余浏览器统一为
 * `QuotaExceededError`；按 name 判断可以跨浏览器生效。
 * @param error 捕获到的异常
 * @returns 是否为配额不足
 */
function isQuotaError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false

  const name = (error as { name?: unknown }).name

  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED'
}

/** 单次写入的结果。 */
type WriteResult = 'ok' | 'quota' | 'error'

/**
 * 尝试写入一次。
 * @param key 存储键
 * @param value 序列化后的值
 * @returns 写入结果；配额不足交给调用方兜底，其它错误记录后不再重试
 */
function writeOnce(key: string, value: string): WriteResult {
  try {
    window.localStorage.setItem(key, value)

    return 'ok'
  } catch (error) { // 配额不足返回 quota 走兜底；存储被禁用时重试也没有意义
    if (isQuotaError(error)) return 'quota'

    console.error('[dsh-ide] 写入本地存储失败:', key, error)

    return 'error'
  }
}

/**
 * 清理已失效的历史版本记录。
 *
 * 正常启动时每个插件版本只跑一次，用标记键记住；配额兜底时强制重跑，因为标记
 * 写入本身也可能因配额失败而丢失。启动路径不要直接调它，用
 * `scheduleStorageMaintenance` 放到空闲帧，避免和首屏渲染抢主线程。
 * @param force 是否忽略标记立即执行
 */
export function pruneDeprecatedStorage(force = false): void {
  try {
    if (!force && window.localStorage.getItem(CLEANUP_MARKER_KEY) === String(CLEANUP_VERSION)) return

    let removed = 0

    // 倒序遍历：删除会改变后续下标，正序会漏掉紧随其后的键
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index)

      if (key === null || !isDeprecated(key)) continue

      window.localStorage.removeItem(key)
      removed += 1
    }

    window.localStorage.setItem(CLEANUP_MARKER_KEY, String(CLEANUP_VERSION))

    if (removed > 0) console.info(`[dsh-ide] 已清理 ${removed} 条旧版本界面记录`)
  } catch (error) { // 存储被禁用或已满：跳过清理，工作台其余功能照常可用
    console.error('[dsh-ide] 清理旧版本界面记录失败:', error)
  }
}

/**
 * 收集可以淘汰的键，按淘汰优先级排序。
 * @param currentKey 本次正在写入的键
 * @param currentContext 本次写入所属的上下文
 * @returns 会话级在前、工作空间级在后的候选键
 */
function collectCandidates(currentKey: string, currentContext: string): string[] {
  const sessionCandidates: string[] = []
  const workspaceCandidates: string[] = []

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)

    // 不存在的下标、当前键、全局键与同一上下文的记录都保留
    if (key === null || key === currentKey || isGlobal(key)) continue

    const context = contextOf(key)

    // 无法识别的键（将来新增的存储）不参与淘汰，避免误删
    if (context === '' || context === currentContext) continue

    // 会话级影响面最小，排在工作空间级之前
    if (SESSION_PREFIXES.some((prefix) => key.startsWith(prefix))) sessionCandidates.push(key)
    else workspaceCandidates.push(key)
  }

  return [...sessionCandidates, ...workspaceCandidates]
}

/**
 * 淘汰其它上下文的记录，直到当前写入能成功。
 *
 * 只有配额已满且旧版本前缀也清不出空间时才会走到这里；被删的是其它项目/会话的
 * 布局、标签与面板页签，代价是这些项目下次打开回到默认界面。按估算所需空间逐步
 * 删除、每够一档就试写一次，尽量少牺牲其它项目。
 * @param currentKey 本次正在写入的键
 * @param value 序列化后的值
 * @returns 是否已写入成功
 */
function pruneInactiveStorage(currentKey: string, value: string): boolean {
  const currentContext = contextOf(currentKey)
  // 释放目标按 UTF-16 估算，另加 1KB 余量：配额按字符计，序列化长度不足以直接比对
  const target = value.length * 2 + 1024
  let freed = 0

  try {
    for (const key of collectCandidates(currentKey, currentContext)) {
      const raw = window.localStorage.getItem(key)

      window.localStorage.removeItem(key)
      freed += key.length + (raw?.length ?? 0)

      // 够一档就试写：成功即停手，避免继续删本来还能用的记录
      if (freed >= target && writeOnce(currentKey, value) === 'ok') return true
    }
  } catch (error) { // 存储被禁用时删除同样会失败，按未腾出空间处理
    console.error('[dsh-ide] 淘汰其它项目记录失败:', error)
  }

  // 候选删完仍未达到估算目标时最后再试一次：实际释放量可能已经够用
  return writeOnce(currentKey, value) === 'ok'
}

/**
 * 把启动清理排到浏览器空闲帧，不阻塞插件激活与首屏渲染。
 *
 * localStorage 只能在主线程访问，放进 Web Worker 最后仍要把读写 postMessage 回来，
 * 因此用空闲调度实现「静默执行」：浏览器空闲时才跑，交互繁忙时自动让路，最长
 * 3 秒后兜底执行（timeout 保证后台标签页也能轮到）。不支持 IdleCallback 的浏览器
 * 退回下一个任务，效果等同。
 * @returns 取消函数；插件在清理执行前被卸载时调用
 */
export function scheduleStorageMaintenance(): () => void {
  let cancelled = false

  const run = (): void => {
    if (cancelled) return

    pruneDeprecatedStorage()
  }

  if (typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(run, { timeout: 3000 })

    return () => {
      cancelled = true
      window.cancelIdleCallback(handle)
    }
  }

  const handle = window.setTimeout(run, 0)

  return () => {
    cancelled = true
    window.clearTimeout(handle)
  }
}

/**
 * 写入本地存储；配额不足时先清理旧版本、再淘汰其它项目记录后重试。
 *
 * 与直接调用 `localStorage.setItem` 的区别只在失败路径：成功时行为完全一致，
 * 失败时不会静默，最终仍失败会明确提示用户「界面状态将不再记忆」。
 * @param key 存储键
 * @param value 序列化后的值
 */
export function safeSetItem(key: string, value: string): void {
  const first = writeOnce(key, value)

  if (first === 'ok') return
  // 存储被禁用或写入了非法值：重试与清理都不会改变结果
  if (first === 'error') return

  // 配额不足：先清已失效的旧版本前缀，成本最低且不会丢失任何还能读到的状态
  pruneDeprecatedStorage(true)

  if (writeOnce(key, value) === 'ok') return

  // 仍不足：淘汰其它工作空间/会话的界面记忆，保证当前这次写入成功
  if (pruneInactiveStorage(key, value)) {
    console.warn('[dsh-ide] 本地存储接近上限，已清理其它项目的界面记录')

    return
  }

  console.warn('[dsh-ide] 浏览器存储空间已满，IDE 布局与打开的标签将不再记忆')
}
