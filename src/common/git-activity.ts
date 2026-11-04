/**
 * Git 状态变更广播。
 *
 * 工作台的写操作（提交、推送、切换分支、回滚…）都会调用服务总线的 refreshGitStatus，
 * 但聊天页的分支按钮拿不到那个实例，按钮上的分支名与领先/落后箭头会一直停在旧值。
 * 这里用模块级广播把「Git 可能变了」告诉所有承载面：聊天页订阅后重读，工作台自己的
 * 刷新仍走实例总线。
 *
 * 一次操作可能连续触发多次（提交后接着推送、回滚多个文件），因此广播先立即发一次，
 * 让界面马上跟上，再在合并窗口结束后补发一次，保证最终状态也一定被读到。
 */

/** 合并窗口（毫秒）：窗口内的多次触发合并成一次补发。 */
const MERGE_WINDOW_MS = 500

/** 订阅者。 */
const listeners = new Set<() => void>()

/** 补发定时器；null 表示当前没有排队的补发。 */
let timer: number | null = null

/**
 * 通知「Git 状态可能变了」。
 *
 * 立即广播一次，并在合并窗口结束后补发一次：前者保证操作后马上看到新状态，
 * 后者覆盖同一窗口内后续写操作（例如提交后立即推送）的最终结果。
 */
export function notifyGitActivity(): void {
  for (const listener of listeners) listener()

  if (timer !== null) window.clearTimeout(timer)

  timer = window.setTimeout(() => {
    timer = null

    for (const listener of listeners) listener()
  }, MERGE_WINDOW_MS)
}

/**
 * 订阅 Git 状态变更广播。
 * @param listener 收到广播后重读自己的数据
 * @returns 取消订阅
 */
export function subscribeGitActivity(listener: () => void): () => void {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}
