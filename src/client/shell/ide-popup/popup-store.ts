/**
 * 对话页 IDE 弹窗的开关状态。
 *
 * 按钮挂在宿主的 `conversation.composer.dock` 插槽、弹窗挂在 `shell.overlay`，
 * 两处属于不同的 React 树，只能通过模块级 store 共享。状态不落盘：刷新后默认
 * 关闭，避免用户一打开会话就被弹窗挡住；切换会话时对话框自己判断会话是否变化。
 */

/** 弹窗状态。 */
export interface IdePopupState {
  /** 弹窗是否打开。 */
  readonly open: boolean
  /** 打开弹窗时的会话 id；空串表示从未打开过。 */
  readonly sessionId: string
}

/** 当前状态；只在 commit 时整体替换，保证 useSyncExternalStore 拿到稳定引用。 */
let state: IdePopupState = { open: false, sessionId: '' }

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
 */
export function toggleIdePopup(sessionId: string): void {
  commit(
    state.sessionId === sessionId
      ? { open: !state.open, sessionId }
      : { open: true, sessionId },
  )
}

/** 收起弹窗；工具栏右上角的关闭图标与再次点底部入口按钮都走这里。 */
export function closeIdePopup(): void {
  if (!state.open) return

  commit({ open: false, sessionId: state.sessionId })
}
