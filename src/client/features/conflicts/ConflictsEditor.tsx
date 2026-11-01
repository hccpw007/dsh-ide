/**
 * 冲突编辑器的地址分派。
 *
 * 编辑器区只会把标签地址交给一个渲染器，而冲突 feature 有两个视图：逐块三选一的
 * 简化视图与三栏合并窗口。分派留在这里，两个视图各自不认识对方的地址格式。
 */
import React from 'react'

import type { FeatureViewProps } from '../../shell/contract'

import { ConflictViewer } from './ConflictViewer'
import { MergeViewer } from './MergeViewer'

/** 冲突编辑器收到的 props：地址与关闭动作由外壳随标签一起传入。 */
export type ConflictsEditorProps = FeatureViewProps & { address: string; closeTab(): void }

/**
 * 按地址选择冲突视图。
 * @param props 见 ConflictsEditorProps
 * @returns 三栏合并窗口或逐块选择视图
 */
export function ConflictsEditor({ t, rootT, sessionId, services, address, closeTab }: ConflictsEditorProps): React.ReactElement {
  if (address.startsWith('merge:')) {
    return (
      <MergeViewer t={t} rootT={rootT} sessionId={sessionId} services={services} address={address} closeTab={closeTab} />
    )
  }

  return <ConflictViewer t={t} rootT={rootT} sessionId={sessionId} services={services} address={address} />
}
