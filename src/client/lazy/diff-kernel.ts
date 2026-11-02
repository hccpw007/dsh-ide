/**
 * 差异内核：jsdiff 的懒加载封装。
 *
 * 差异库只在用户真正打开差异对比时才需要，放进主 bundle 会拖慢每一次打开会话的
 * 解析成本。这里只导出「逐行比较」一个函数，把库本身锁在 chunk 内。
 *
 * 两个入口都带计算预算：jsdiff 的 Myers 最坏是 O(N·D)，几千行的大改动就能把主线程
 * 冻结数秒。超预算时 jsdiff 返回 undefined 而不是抛错，调用方据此退化为按行号对齐、
 * 整行标改，界面因此不会失去响应。
 */
import { diffChars, diffLines, type Change } from 'diff'

/**
 * 行级比较的时间预算（毫秒）。
 *
 * 实测 3000 行改 20% 以内约 70 ms，5000 行约 200 ms；滑到这个预算之外的必然是
 * 半数以上的行都变了，此时精确对齐的收益抵不上等待，交给调用方按行号对齐更快。
 */
const LINE_DIFF_TIMEOUT_MS = 300

/** 单行字符级比较的时间预算（毫秒）：一行词级高亮不值得让整屏等它。 */
const CHAR_DIFF_TIMEOUT_MS = 30

/** chunk 的默认导出。 */
const module = {
  /**
   * 逐行比较两段文本。
   * @param left 旧文本
   * @param right 新文本
   * @returns 变更块；超出时间预算时为 undefined
   */
  diffLines(left: string, right: string): Change[] | undefined {
    return diffLines(left, right, { timeout: LINE_DIFF_TIMEOUT_MS })
  },

  /**
   * 逐字符比较单行内容；Git 差异视图用它做行内高亮。
   * @param left 旧行
   * @param right 新行
   * @returns 变更块；超出时间预算时为 undefined
   */
  diffChars(left: string, right: string): Change[] | undefined {
    return diffChars(left, right, { timeout: CHAR_DIFF_TIMEOUT_MS })
  },
}

export type { Change }
export default module
