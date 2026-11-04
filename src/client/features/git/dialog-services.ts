/**
 * Git 对话框依赖的工作台能力。
 *
 * Commit / Push / Rollback / Conflicts 与内嵌差异视图原本直接要求完整的 `IdeServices`，
 * 但聊天页的分支入口没有工作台：没有编辑器、没有 Git 面板、也没有设置页，只能提供
 * 其中一部分。这里按它们真正用到的成员收窄成一份子集，工作台传完整总线仍然兼容
 * （结构化类型），聊天页则只需实现这一小份能力。
 */
import type { IdeServices } from '../../shell/contract'

export type GitDialogServices = Pick<
  IdeServices,
  | 'root'
  | 'subscribeRoot'
  | 'toast'
  | 'refreshGitStatus'
  | 'invalidate'
  | 'dialogSizes'
  | 'settings'
  | 'subscribeSettings'
  | 'updateSettings'
  | 'openFile'
  | 'openDiff'
  | 'openBottomPanel'
  | 'openMerge'
>
