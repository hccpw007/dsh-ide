/**
 * 对话页 IDE 弹窗的开关状态。
 *
 * 按钮挂在宿主的 `conversation.composer.dock` 插槽、弹窗挂在 `shell.overlay`，
 * 两处属于不同的 React 树，只能通过模块级 store 共享。状态不落盘：刷新后默认
 * 关闭，避免用户一打开会话就被弹窗挡住。
 *
 * 切换对话时弹窗只是收起，不清理任何状态：按钮组件发现面前的对话和弹窗绑定的
 * 对话不是同一个就调用 `closeIdePopup`，工作台实例、打开的文件与布局都留在原处，
 * 点入口按钮重新打开仍是关闭前那一份界面。
 *
 * 每个工作空间各记一条「上次打开时渲染的会话」，因此打开过多个项目后回到其中
 * 任何一个，都能恢复该项目关闭前的界面；同时只保活当前一个实例——切到别的项目
 * 打开时旧实例随之卸载，标签与布局在重新挂载时从工作空间状态池恢复，不会让多个
 * 项目的工作台（编辑器、项目树、终端进程）一起挂在后台。
 */
import { readSessionCwd, workspaceIdOf } from '../session-cwd'

/** 弹窗状态。 */
export interface IdePopupState {
  /** 弹窗是否打开。 */
  readonly open: boolean
  /** 当前跟随的会话 id：只用于按钮激活与工作空间判定；空串表示从未打开过。 */
  readonly sessionId: string
  /** 弹窗实际渲染的会话 id：打开时固定，切换对话不改变。 */
  readonly openSessionId: string
  /** 打开时所在的工作空间标识；空串表示会话尚未绑定工作目录。 */
  readonly workspaceKey: string
}

/** 当前状态；只在 commit 时整体替换，保证 useSyncExternalStore 拿到稳定引用。 */
let state: IdePopupState = { open: false, sessionId: '', openSessionId: '', workspaceKey: '' }

/**
 * 各工作空间上次打开弹窗时渲染的会话 id；空串键表示会话尚未绑定工作目录。
 *
 * 每个项目只占一条几十字节的记录，却不保活它的实例：回到该项目时按这条记录重建
 * 工作台，标签与布局从工作空间状态池恢复，开销远小于让旧实例一直挂在后台。
 */
const openSessions = new Map<string, string>()

/** 订阅者集合。 */
const listeners = new Set<() => void>()

/**
 * 提交新状态并通知订阅者。
 * @param next 新状态
 */
function commit(next: IdePopupState): void {
  state = next

  for (const listener of listeners) listener()
}

/**
 * 订阅弹窗状态。
 * @param listener 变化回调
 * @returns 取消订阅函数
 */
export function subscribeIdePopup(listener: () => void): () => void {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}

/**
 * 读取当前弹窗状态。
 * @returns 状态快照
 */
export function idePopupState(): IdePopupState {
  return state
}

/**
 * 切换指定会话的弹窗。
 *
 * 会话变了就从打开开始，不把上一个会话的开关带过来：用户在新会话点按钮，
 * 期望看到的是这个会话的 IDE，而不是「上次是开着的，所以现在要关」。
 * @param sessionId 按钮所属会话
 * @param workspaceKey 按钮所属会话的工作空间标识；空串表示尚未绑定目录
 */
export function toggleIdePopup(sessionId: string, workspaceKey: string): void {
  const sameWorkspace =
    workspaceKey === '' || state.workspaceKey === '' || workspaceKey === state.workspaceKey

  // 已打开且属于同一工作空间时，再点一次即收起（按钮此时显示为激活态）；
  // 同一工作空间内切换对话后弹窗已被收起，这里不会误判成「再点一次」
  if (state.open && sameWorkspace) {
    commit({ ...state, open: false })

    return
  }

  // 会话尚未绑定目录时退回当前记录的工作空间，避免多个未绑定目录的会话共用一条记录
  const key = workspaceKey === '' ? state.workspaceKey : workspaceKey
  const remembered = openSessions.get(key)
  // 记录里的会话可能早已被删除：读不到工作目录或已不属于该项目就作废，改用眼前的
  // 对话建一份新的，否则打开弹窗会停在一个没有工作空间的空白工作台上
  const reusable = remembered !== undefined && workspaceIdOf(readSessionCwd(remembered)) === key
  const openSessionId = reusable ? remembered : sessionId
  openSessions.set(key, openSessionId)

  commit({ open: true, sessionId, openSessionId, workspaceKey: key })
}

/**
 * 把已打开的弹窗补记到实际工作空间。
 *
 * 只在会话从「尚未绑定目录」变成绑定目录时调用：界面原地不动，只把所属工作空间
 * 记准，之后在同一项目内切换对话再打开才有键可查。
 * @param sessionId 当前对话会话 id
 * @param workspaceKey 新识别出的工作空间标识
 */
export function followIdePopup(sessionId: string, workspaceKey: string): void {
  if (!state.open) return
  if (state.sessionId === sessionId && state.workspaceKey === workspaceKey) return

  // 记录随之迁到新键，否则绑定目录后按项目查不到这份界面；旧的空串记录可能仍被
  // 其他未绑定目录的会话使用，保留不动
  if (workspaceKey !== state.workspaceKey) openSessions.set(workspaceKey, state.openSessionId)

  commit({ ...state, sessionId, workspaceKey })
}

/** 收起弹窗；工具栏右上角的关闭图标与再次点底部入口按钮都走这里。 */
export function closeIdePopup(): void {
  if (!state.open) return

  commit({ ...state, open: false })
}
