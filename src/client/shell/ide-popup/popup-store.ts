/**
 * 对话页 IDE 弹窗的开关状态。
 *
 * 按钮挂在宿主的 `conversation.composer.dock` 插槽、弹窗挂在 `shell.overlay`，
 * 两处属于不同的 React 树，只能通过模块级 store 共享。状态不落盘：刷新后默认
 * 关闭，避免用户一打开会话就被弹窗挡住。
 *
 * 同一工作空间内切换对话时弹窗保持打开：按钮组件比较新旧会话的工作目录，
 * 命中同一工作空间就调用 `followIdePopup` 更新判定用的会话，跨工作空间才收起。
 * 弹窗实际渲染仍固定在打开时的会话（`openSessionId`），这样切换对话不会让文件树、
 * 编辑区与终端重新挂载，看起来完全没动。
 */

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
  // 同一工作空间内切换过对话后，state.sessionId 已是新会话，这里不能按会话比较
  if (state.open && sameWorkspace) {
    commit({ ...state, open: false })

    return
  }

  commit({ open: true, sessionId, openSessionId: sessionId, workspaceKey })
}

/**
 * 让已打开的弹窗跟随到另一个会话。
 *
 * 只在同一工作空间内切换对话时调用：只更新判定用的会话与工作空间，渲染上下文
 * （`openSessionId`）保持不变，因此文件树、编辑区与终端原地不动。`workspaceKey`
 * 传新会话已绑定的工作空间；未知时保留原值，等目录绑定后再由按钮判定。
 * @param sessionId 新会话 id
 * @param workspaceKey 新会话的工作空间标识
 */
export function followIdePopup(sessionId: string, workspaceKey: string): void {
  if (!state.open) return
  if (state.sessionId === sessionId && state.workspaceKey === workspaceKey) return

  commit({ ...state, sessionId, workspaceKey })
}

/** 收起弹窗；工具栏右上角的关闭图标与再次点底部入口按钮都走这里。 */
export function closeIdePopup(): void {
  if (!state.open) return

  commit({ ...state, open: false })
}
