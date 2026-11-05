/**
 * 「在 Log 页签里定位某条提交」的意图队列。
 *
 * 发起方有两处：历史页签里选中的提交、推送弹窗里选中的提交；落点都是 Git 面板的
 * Log 页签。既然两端同属 git feature，这个交接就不收进 IdeServices —— 外壳只负责
 * 打开底部面板，不需要认识「Log 页签」「提交 hash」这些 feature 内部概念。
 *
 * 面板可能正开着，也可能刚被打开：开着时通过订阅即时送达；没开时先把意图记下来，
 * 等面板挂载时取走。与 console-store 一样用模块级单例，免得把意图穿透好几层 props。
 */

/** 定位请求的接收方。 */
type LogFocusListener = (hash: string) => void

/** 面板没挂载时暂存的待办；空串表示没有。 */
let pending = ''

/** 正在等待定位请求的接收方；面板挂载期间最多一个。 */
const listeners = new Set<LogFocusListener>()

/**
 * 请求在 Log 页签里定位某条提交。
 * @param hash 提交 hash；空串直接忽略
 */
export function requestLogFocus(hash: string): void {
  if (hash === '') return

  // 面板正开着：当场交给它，队列里不留残留，否则下次重新挂载会重复定位同一条提交
  if (listeners.size > 0) {
    // 单个监听器抛错不能让后续监听器收不到，也不能冒泡到「点了没反应」的发起方
    for (const listener of listeners) {
      try {
        listener(hash)
      } catch (error) {
        console.error('[dsh-ide] 定位提交的监听器抛错:', error)
      }
    }

    return
  }

  pending = hash
}

/**
 * 取走待定位的提交；面板挂载时先取一次，避免漏掉挂载之前发出的请求。
 * @returns 提交 hash；无待办时为空串
 */
export function takeLogFocus(): string {
  const hash = pending
  pending = ''

  return hash
}

/**
 * 订阅定位请求。
 * @param listener 接收方
 * @returns 取消订阅
 */
export function subscribeLogFocus(listener: LogFocusListener): () => void {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}
