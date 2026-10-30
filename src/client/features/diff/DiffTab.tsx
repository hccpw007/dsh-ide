/**
 * 编辑器里的差异标签。
 *
 * 正文与 Git 面板的内嵌差异、Commit 弹窗共用同一个 DiffView（含顶部工具栏），
 * 编辑器里看到的差异与这三个入口完全一致，不另写一套渲染。
 */
import React, { useMemo, useSyncExternalStore } from 'react'

import type { DiffSource } from '../../../common/diff-source'
import { featureTranslate } from '../../../common/locale'
import type { FeatureViewProps } from '../../shell/contract'
import { DiffView } from '../git/DiffView'

/** 编辑器差异标签 props：来源与关闭动作由外壳随标签一起传入。 */
export type DiffTabProps = FeatureViewProps & {
  /** 差异来源；缺失说明标签数据损坏，正文显示空态。 */
  source?: DiffSource
  /** 关闭当前标签，供差异工具栏的关闭按钮使用。 */
  closeTab(): void
}

/**
 * 渲染编辑器差异标签。
 * @param props 见 DiffTabProps
 * @returns 与 Git 面板一致的差异视图
 */
export function DiffTab({ rootT, services, source, closeTab }: DiffTabProps): React.ReactElement {
  // DiffView 的文案属于 git 命名空间：这里用根翻译函数重新绑定，不必在 diff 下再抄一份
  const gitT = useMemo(() => featureTranslate(rootT, 'git'), [rootT])

  // 工作区根由宿主提供，可能在标签打开后切换会话
  const root = useSyncExternalStore(
    (listener) => services.subscribeRoot(listener),
    () => services.root,
    () => services.root,
  )

  // 标签里只有一个差异：文件导航因此显示「1 file」并保持禁用
  const files = useMemo<DiffSource[]>(() => (source === undefined ? [] : [source]), [source])

  return (
    <DiffView
      t={gitT}
      services={services}
      root={root}
      source={source ?? null}
      files={files}
      onClose={closeTab}
    />
  )
}
