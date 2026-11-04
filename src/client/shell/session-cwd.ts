/**
 * 会话状态的读取：工作目录与「当前正在查看的会话」。
 *
 * 工作台的一切路径都相对会话的 cwd：项目树的根、Git 仓库、终端启动目录、
 * 运行配置的工作目录。宿主把 cwd 放在会话列表的 store 里，插件通过
 * `ctx.get('sessions').list` 读取，并订阅它的变化——会话在首条消息后才绑定目录，
 * 不订阅就会一直停在「未绑定」。
 *
 * 「当前会话」由会话页插槽经 {@link setCurrentSession} 写入：侧边栏底部的 IDE
 * 入口所在插槽不携带会话上下文，只能靠这条记录锁定用户眼前的会话。
 *
 * 这里只做「拿 ctx、读快照、订阅」，不涉及 React，因此可以放在 shell 里被多处复用。
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
 * 读取会话列表里的一条会话条目。
 * @param sessionId 会话 id
 * @returns 会话条目；插件上下文未就绪、会话不存在或读取失败时为 undefined
 */
function readSessionEntry(sessionId: string): Record<string, unknown> | undefined {
  if (sessionId === '' || clientContext === undefined) return undefined

  try {
    const sessions = clientContext.get?.('sessions') as { list?: SessionsList } | undefined
    const snapshot = sessions?.list?.getSnapshot?.()

    if (typeof snapshot !== 'object' || snapshot === null) return undefined

    const byId = (snapshot as { byId?: Record<string, unknown> }).byId
    const entry = byId?.[sessionId]

    if (typeof entry !== 'object' || entry === null) return undefined

    return entry as Record<string, unknown>
  } catch (error) { // 读取失败按未绑定处理，不影响工作台其余部分
    console.error('[dsh-ide] 读取会话条目失败:', error)

    return undefined
  }
}

/**
 * 读取指定会话的工作目录。
 * @param sessionId 会话 id
 * @returns 绝对路径；未绑定或读取失败时为空串
 */
export function readSessionCwd(sessionId: string): string {
  const cwd = readSessionEntry(sessionId)?.cwd

  return typeof cwd === 'string' ? cwd : ''
}

/**
 * 工作空间标识。
 *
 * 同一工作目录（cwd）的对话属于同一个工作空间，共用一份编辑器与布局状态；
 * cwd 为空表示会话还没绑定目录，此时无法判断归属，返回空串让调用方降级。
 * @param cwd 会话工作目录
 * @returns `ws:<路径>`；未绑定时为空串
 */
export function workspaceIdOf(cwd: string): string {
  return cwd === '' ? '' : `ws:${cwd}`
}

/**
 * 状态池作用域键。
 *
 * 已绑定目录时用工作空间标识，让同一项目的不同对话、不同承载面命中同一份状态；
 * 未绑定时退回会话 id，避免所有未绑定会话共用一份空白状态。
 * @param cwd 会话工作目录
 * @param sessionId 会话 id
 * @returns 状态池键
 */
export function workspaceScopeKey(cwd: string, sessionId: string): string {
  const workspaceId = workspaceIdOf(cwd)

  return workspaceId === '' ? `session:${sessionId}` : workspaceId
}

/**
 * 从宿主传入的插槽 props 里取出会话 id。
 *
 * 不同承载面给 props 的形状并不一致，这里只认字符串形态的 sessionId，
 * 取不到就当未绑定会话，绝不猜一个 id 去访问别人的工作区。
 * @param props 宿主传给插槽组件的 props
 * @returns 会话 id；没有时为空串
 */
export function readSessionId(props: Record<string, unknown>): string {
  return typeof props.sessionId === 'string' ? props.sessionId : ''
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

/** 当前正在查看的会话 id；空串表示眼前没有会话。 */
let currentSessionId = ''

/** 当前会话变化的订阅集合。 */
const currentSessionListeners = new Set<() => void>()

/**
 * 记录当前正在查看的会话。
 *
 * 侧边栏底部的 IDE 入口只能收到宿主的 `wide` 标志，拿不到会话上下文，而入口必须
 * 与眼前的会话严格一致：由会话页的插槽把宿主传入的会话 id 记在这里，侧边栏按钮
 * 订阅它，避免用「最近活动的会话」去猜一个可能不属于用户当前视图的工作区。
 * @param sessionId 会话 id
 */
export function setCurrentSession(sessionId: string): void {
  if (sessionId === currentSessionId) return

  currentSessionId = sessionId

  for (const listener of currentSessionListeners) listener()
}

/**
 * 清空当前会话。
 *
 * 只在自己仍是当前值时才清：切换会话时新旧跟踪器会交替挂载与卸载，旧跟踪器的
 * 清理不能把新会话抹掉，否则侧边栏入口会短暂置灰。
 * @param sessionId 卸载的跟踪器记录的会话 id
 */
export function clearCurrentSession(sessionId: string): void {
  if (currentSessionId !== sessionId) return

  currentSessionId = ''

  for (const listener of currentSessionListeners) listener()
}

/**
 * 读取当前正在查看的会话 id。
 * @returns 会话 id；眼前没有会话时为空串
 */
export function readCurrentSession(): string {
  return currentSessionId
}

/**
 * 订阅当前会话变化。
 * @param listener 变化回调
 * @returns 取消订阅函数
 */
export function subscribeCurrentSession(listener: () => void): () => void {
  currentSessionListeners.add(listener)

  return () => {
    currentSessionListeners.delete(listener)
  }
}
