/**
 * 会话工作目录的读取。
 *
 * 工作台的一切路径都相对会话的 cwd：项目树的根、Git 仓库、终端启动目录、
 * 运行配置的工作目录。宿主把 cwd 放在会话列表的 store 里，插件通过
 * `ctx.get('sessions').list` 读取，并订阅它的变化——会话在首条消息后才绑定目录，
 * 不订阅就会一直停在「未绑定」。
 *
 * 这里只做「拿 ctx、读 cwd、订阅」，不涉及 React，因此可以放在 shell 里被多处复用。
 */
import type { PluginContext } from '../../types/plugin'

/** 宿主会话列表的读取入口。 */
interface SessionsList {
  /** 当前快照。 */
  getSnapshot?(): unknown
  /** 订阅变化。 */
  subscribe?(listener: () => void): () => void
}

/** 当前插件上下文；未初始化时为 undefined。 */
let clientContext: PluginContext | undefined

/** 会话列表变化的订阅集合。 */
const listeners = new Set<() => void>()

/**
 * 绑定插件上下文并挂上会话列表订阅。
 * @param ctx 插件上下文
 * @returns 注销函数
 */
export function bindSessionSource(ctx: PluginContext): () => void {
  clientContext = ctx

  let unsubscribe: (() => void) | undefined

  try {
    const sessions = ctx.get?.('sessions') as { list?: SessionsList } | undefined
    const list = sessions?.list

    if (list !== undefined && typeof list.subscribe === 'function') {
      unsubscribe = list.subscribe(() => {
        for (const listener of listeners) listener()
      })
    }
  } catch (error) { // 宿主版本差异导致取不到 sessions 时，工作台退化为「未绑定会话」
    console.error('[dsh-ide] 订阅会话列表失败:', error)
  }

  return () => {
    unsubscribe?.()
    clientContext = undefined
  }
}

/**
 * 读取指定会话的工作目录。
 * @param sessionId 会话 id
 * @returns 绝对路径；未绑定或读取失败时为空串
 */
export function readSessionCwd(sessionId: string): string {
  if (sessionId === '' || clientContext === undefined) return ''

  try {
    const sessions = clientContext.get?.('sessions') as { list?: SessionsList } | undefined
    const snapshot = sessions?.list?.getSnapshot?.()

    if (typeof snapshot !== 'object' || snapshot === null) return ''

    const byId = (snapshot as { byId?: Record<string, unknown> }).byId
    const entry = byId?.[sessionId]

    if (typeof entry !== 'object' || entry === null) return ''

    const cwd = (entry as { cwd?: unknown }).cwd

    return typeof cwd === 'string' ? cwd : ''
  } catch (error) { // 读取失败按未绑定处理，不影响工作台其余部分
    console.error('[dsh-ide] 读取会话工作目录失败:', error)

    return ''
  }
}

/**
 * 订阅会话列表变化。
 * @param listener 变化回调
 * @returns 取消订阅函数
 */
export function subscribeSessions(listener: () => void): () => void {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}
