/**
 * 顶部工具栏的 Git 与视图动作。
 *
 * Add 依赖项目树选中项与 Git 状态（决定能不能点），其余按钮要么打开弹窗
 * （Commit / Rollback），要么把动作转成服务总线上的意图（Push / Show Diff /
 * Show History 都跳到 Git 面板）。刷新按钮留在主工具栏，这里不含它。
 */
import React, { useCallback, useMemo, useState, useSyncExternalStore } from 'react'

import type { Translate } from '../../../types/plugin'
import { featureTranslate } from '../../../common/locale'
import { addSelection, canAddSelection } from '../../features/git/add-selection'
import { CommitDialog } from '../../features/git/CommitDialog'
import { clockIcon, nodeLineIcon, pushIcon, rollbackIcon, updateIcon } from '../../features/git/icons'
import { RollbackDialog } from '../../features/git/RollbackDialog'
import type { WorkbenchServices } from '../services'

import { plusIcon, swapArrowsIcon } from './icons'
import { ToolButton } from './ToolButton'

/** Git 动作组 props。 */
export interface GitActionsProps {
  /** 外壳翻译函数。 */
  t: Translate
  /** 工作台服务总线。 */
  services: WorkbenchServices
  /** 工作区根。 */
  root: string
  /** 分支信息加载中：更新按钮显示刷新中文案。 */
  busy: boolean
  /** 打开 Update Project 对话框。 */
  onRequestUpdate(): void
}

/**
 * 渲染 Add / Update / Push / Commit / Show Diff / Rollback / Show History 一串按钮。
 * @param props 见 GitActionsProps
 * @returns 按钮组与 Commit、Rollback 两个弹窗
 */
export function GitActions({
  t,
  services,
  root,
  busy,
  onRequestUpdate,
}: GitActionsProps): React.ReactElement {
  /** Commit 弹窗是否打开。 */
  const [commitOpen, setCommitOpen] = useState(false)
  /** Rollback Changes 对话框是否打开。 */
  const [rollbackOpen, setRollbackOpen] = useState(false)

  /** Commit 弹窗的翻译函数必须稳定，否则弹窗内的回调会反复重建。 */
  const gitTranslate = useMemo(() => featureTranslate(t, 'git'), [t])

  // 项目树选中项与 Git 状态：决定顶部 Add 能不能点
  const selection = useSyncExternalStore(
    (listener) => services.subscribeSelection(listener),
    () => services.selection(),
    () => services.selection(),
  )
  const gitStatus = useSyncExternalStore(
    (listener) => services.subscribeGitStatus(listener),
    () => services.gitStatus(),
    () => services.gitStatus(),
  )

  /** Add 按钮不可用的原因；undefined 表示可以对选中项执行 add。 */
  const addUnavailable =
    selection === null ? t('git.addRequiresSelection') : canAddSelection(selection, gitStatus) ? undefined : t('git.addNothingToAdd')

  /** 把项目树选中项加入 Git 索引；完成后在右下角提示结果。 */
  const addSelected = useCallback((): void => {
    if (selection === null) return

    // 项目根用工作区目录名做提示文案，其余直接用相对路径
    const label = selection.path === '' ? (root.split('/').pop() ?? root) : selection.path

    void addSelection(root, selection, label, services, t)
  }, [root, selection, services, t])

  return (
    <>
      {/* Add：把项目树里选中的文件或文件夹加入 Git 索引 */}
      <ToolButton label={t('shell.add')} unavailable={addUnavailable} onClick={addSelected}>
        {plusIcon()}
      </ToolButton>

      {/* 更新工程：弹出方式选择对话框，按合并或变基把上游合入当前分支 */}
      <ToolButton label={busy ? t('shell.refreshing') : t('shell.updateProject')} onClick={onRequestUpdate}>
        {updateIcon()}
      </ToolButton>

      {/* 推送：跳到 Git 面板，由面板按分支状态执行推送 */}
      <ToolButton label={t('shell.push')} onClick={() => services.openBottomPanel('git')}>
        {pushIcon()}
      </ToolButton>

      {/* 提交：打开 Commit 弹窗，由弹窗选择变更并填写提交信息 */}
      <ToolButton label={t('shell.commit')} onClick={() => setCommitOpen(true)}>
        {nodeLineIcon()}
      </ToolButton>

      {/* 显示差异：跳到 Git 面板的 Local Changes */}
      <ToolButton label={t('shell.showDiff')} onClick={() => services.openBottomPanel('git')}>
        {swapArrowsIcon()}
      </ToolButton>

      {/* 回滚：打开 Rollback Changes 对话框，勾选要回滚的文件 */}
      <ToolButton label={t('shell.rollback')} onClick={() => setRollbackOpen(true)}>
        {rollbackIcon()}
      </ToolButton>

      {/* 查看历史：跳到 Git 面板的 Log */}
      <ToolButton label={t('shell.showHistory')} onClick={() => services.openBottomPanel('git')}>
        {clockIcon()}
      </ToolButton>

      {/* Commit 弹窗：复刻 IDEA 的提交对话框，勾选文件并填写提交信息 */}
      {commitOpen && (
        <CommitDialog t={gitTranslate} services={services} onClose={() => setCommitOpen(false)} />
      )}

      {/* Rollback Changes 对话框：回滚后刷新分支领先/落后与工具栏状态 */}
      {rollbackOpen && (
        <RollbackDialog
          t={gitTranslate}
          services={services}
          root={root}
          onClose={() => setRollbackOpen(false)}
          onRolledBack={() => services.refreshGitStatus()}
        />
      )}
    </>
  )
}
