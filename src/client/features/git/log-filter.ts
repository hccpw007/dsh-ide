/**
 * Log 页签的提交过滤规则。
 *
 * 纯函数，不依赖 React 状态：文本匹配与日期范围各自独立，列表组件只负责把
 * 条件传进来。正则写错时不抛给界面，按字面量兜底——用户还在输入过程中。
 */
import type { GitCommit } from './api'
import type { DateFilter } from './LogFilterBar'

/**
 * 判断提交是否命中文本搜索。
 * @param commit 提交
 * @param query 搜索文本
 * @param regex 是否按正则解析
 * @param caseSensitive 是否区分大小写
 * @returns 命中时返回 true
 */
export function matchesText(commit: GitCommit, query: string, regex: boolean, caseSensitive: boolean): boolean {
  if (query === '') return true

  const haystack = `${commit.subject}\n${commit.author}\n${commit.hash}\n${commit.shortHash}`

  if (regex) {
    try {
      return new RegExp(query, caseSensitive ? '' : 'i').test(haystack)
    } catch (error) { // 用户正在输入合法正则时按字面量兜底，避免输入过程闪错
      console.error('[dsh-ide] Invalid Git log regex, falling back to literal search:', error)
    }
  }

  return caseSensitive ? haystack.includes(query) : haystack.toLowerCase().includes(query.toLowerCase())
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
