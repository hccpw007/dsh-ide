/**
 * Log 页签的提交过滤规则。
 *
 * 纯函数，不依赖 React 状态：文本匹配与日期范围各自独立，列表组件只负责把
 * 条件传进来。正则写错时不抛给界面，按字面量兜底——用户还在输入过程中。
 */
import { SafeRegexError, compileSafeRegex } from '../../../common/safe-regex'
import type { GitCommit } from './api'
import type { DateFilter } from './LogFilterBar'

/**
 * 判断提交里参与搜索的文本。
 * @param commit 提交
 * @returns 可搜索文本
 */
function haystackOf(commit: GitCommit): string {
  return `${commit.subject}\n${commit.author}\n${commit.hash}\n${commit.shortHash}`
}

/**
 * 编译文本搜索的匹配函数。
 *
 * 日志列表会把同一个查询用在上千条提交上，正则因此必须只编译一次——原先是逐条
 * `new RegExp`，几千条提交就编译几千次。同时用户正则逐条执行且无法中断，编译统一
 * 走安全版本，被拒时按字面量兜底：过滤只影响展示，不能因为用户还在输入就清空列表。
 * @param query 搜索文本
 * @param regex 是否按正则解析
 * @param caseSensitive 是否区分大小写
 * @returns 判断某条提交是否命中的函数
 */
export function compileTextMatcher(
  query: string,
  regex: boolean,
  caseSensitive: boolean,
): (commit: GitCommit) => boolean {
  if (query === '') return () => true

  if (regex) {
    try {
      const pattern = compileSafeRegex(query, caseSensitive ? '' : 'i')

      return (commit) => pattern.test(haystackOf(commit))
    } catch (error) { // 非法或不安全的写法按字面量兜底，用户还在输入过程中
      if (!(error instanceof SafeRegexError)) console.error('[dsh-ide] 过滤提交失败:', error)
    }
  }

  const needle = caseSensitive ? query : query.toLowerCase()

  return (commit) => {
    const haystack = haystackOf(commit)

    return caseSensitive ? haystack.includes(needle) : haystack.toLowerCase().includes(needle)
  }
}

/**
 * 判断提交是否落在日期范围内。
 * @param commit 提交
 * @param filter 日期选项
 * @returns 命中时返回 true
 */
export function matchesDate(commit: GitCommit, filter: DateFilter): boolean {
  if (filter === 'all') return true

  const time = new Date(commit.date).getTime()
  if (Number.isNaN(time)) return true

  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const days = filter === 'today' ? 1 : filter === 'week' ? 7 : 30

  return time >= start - (days - 1) * 24 * 60 * 60 * 1000
}
