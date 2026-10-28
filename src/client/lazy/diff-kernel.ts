/**
 * 差异内核：jsdiff 的懒加载封装。
 *
 * 差异库只在用户真正打开差异对比时才需要，放进主 bundle 会拖慢每一次打开会话的
 * 解析成本。这里只导出「逐行比较」一个函数，把库本身锁在 chunk 内。
 */
import { diffLines, type Change } from 'diff'

/** chunk 的默认导出。 */
const module = {
  /**
   * 逐行比较两段文本。
   * @param left 旧文本
   * @param right 新文本
   * @returns 变更块
   */
  diffLines(left: string, right: string): Change[] {
    return diffLines(left, right)
  },
}

export type { Change }
export default module
