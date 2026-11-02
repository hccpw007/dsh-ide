/**
 * Log 页签共享的状态类型。
 *
 * 输入框与分支比较窗口的状态既由动作 hook 写入、又由视图渲染，独立成文件后
 * 两边不必互相引用。
 */
import type { GitCompareFile } from './api'

/** 输入对话框状态。 */
export interface PromptState {
  /** 标题。 */
  title: string
  /** 说明文字。 */
  hint: string
  /** 确认回调。 */
  submit(value: string): void
}

/** 分支差异窗口状态；Compare with 与 Show Diff with Working Tree 共用。 */
export interface CompareState {
  /** 窗口标题。 */
  title: string
  /** 比较基准。 */
  left: string
  /** 被比较的引用；null 表示右侧取工作区。 */
  right: string | null
  /** 差异文件列表。 */
  files: GitCompareFile[]
}
