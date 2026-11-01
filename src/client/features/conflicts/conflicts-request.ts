/**
 * 「弹出冲突解决窗口」的意图队列。
 *
 * 发起方是实际执行 Git 写操作的流程（更新工程、推送被拒后的自动合并），落点是主
 * 工具栏挂载的冲突列表窗。两端分属不同 feature，因此用模块级单例交接意图：
 * 窗口没挂载时先把请求记下来，挂载时取走；这一做法与 Git 面板的 log-focus 一致。
 */

/** 冲突窗口的触发来源。 */
export type ConflictFlow = 'update' | 'push'

/** 一次冲突窗口请求。 */
export interface ConflictsRequest {
  /** 触发来源，决定完成合并后要不要接着推送。 */
  flow: ConflictFlow
  /** 完成合并后的收尾动作；推送流程用它重试推送。 */
  onFinished?(): void
}

/** 窗口没挂载时暂存的请求；null 表示没有待办。 */
let pending: ConflictsRequest | null = null

/** 正在等待请求的接收方；窗口挂载期间最多一个。 */
const listeners = new Set<(request: ConflictsRequest) => void>()

/**
 * 请求打开冲突解决窗口。
 * @param request 触发来源与收尾动作
 */
export function requestConflicts(request: ConflictsRequest): void {
  // 窗口正开着：当场交给它，队列里不留残留，否则下次重新挂载会重复弹窗
  if (listeners.size > 0) {
    for (const listener of listeners) listener(request)

    return
  }

  pending = request
}

/**
 * 取走待打开的请求；窗口挂载时先取一次，避免漏掉挂载之前发出的请求。
 * @returns 请求；无待办时返回 null
 */
export function takeConflictsRequest(): ConflictsRequest | null {
  const request = pending
  pending = null

  return request
}

/**
 * 订阅冲突窗口请求。
 * @param listener 接收方
 * @returns 取消订阅
 */
export function subscribeConflicts(listener: (request: ConflictsRequest) => void): () => void {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}
