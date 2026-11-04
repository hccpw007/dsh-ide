/**
 * Git 对话框宿主：按请求渲染提交或推送对话框。
 *
 * 工作台工具栏、分支弹窗与聊天页分支入口都要打开这两个对话框；把「按请求选哪个
 * 对话框 + 绑定 git 语言包」收敛到一处，调用方只负责持有当前请求并在关闭时清空。
 * 遮罩与定位仍由各对话框自己负责，调用方只需保证挂载点有正确的定位上下文。
 */
import React, { useMemo } from 'react'

import { featureTranslate } from '../../../common/locale'
import type { Translate } from '../../../types/plugin'

import { CommitDialog } from './CommitDialog'
import type { GitDialogServices } from './dialog-services'
import { PushDialog } from './PushDialog'

/** 可打开的 Git 对话框。 */
export type GitDialogKind = 'commit' | 'push'

/** 宿主 props。 */
export interface GitDialogsProps {
  /** 外壳翻译函数；key 带 `shell.` 前缀，这里再拼 git 命名空间。 */
  t: Translate
  /** 对话框依赖的工作台能力。 */
  services: GitDialogServices
  /** 当前要显示的对话框；null 表示都不显示。 */
  open: GitDialogKind | null
  /** 关闭当前对话框。 */
  onClose(): void
}

/**
 * 渲染当前请求的 Git 对话框。
 * @param props 见 GitDialogsProps
 * @returns 提交或推送对话框；无请求时为 null
 */
export function GitDialogs({ t, services, open, onClose }: GitDialogsProps): React.ReactElement | null {
  const gitTranslate = useMemo(() => featureTranslate(t, 'git'), [t])

  // 提交对话框：勾选变更并填写提交信息
  if (open === 'commit') {
    return <CommitDialog t={gitTranslate} services={services} onClose={onClose} />
  }

  // 推送对话框：确认待推送区间、标签范围后推送
  if (open === 'push') {
    return <PushDialog t={gitTranslate} services={services} root={services.root} onClose={onClose} />
  }

  return null
}
