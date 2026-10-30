/**
 * 顶部主工具栏。
 *
 * 对应 IDEA 新 UI 顶部的主工具条，从左到右依次是：运行配置下拉、运行/更多、
 * 当前分支、一排 Git 与视图动作，最右侧是命令面板与设置。工作台没有 IDEA 的
 * 「部署目标」概念，那一格用当前工程名代替，位置与观感保持一致。
 *
 * 这里只做组合与共享少量跨组状态（更新工程对话框、分支加载中的忙碌标记）；
 * 运行配置、分支与 Git 动作各自封装在同目录的子组件里。
 */
import React, { useCallback, useState, useSyncExternalStore } from 'react'

import { openIdeContextMenu } from '../../../common/context-menu'
import type { Translate } from '../../../types/plugin'
import { ConfirmDialog, type ConfirmRequest } from '../../common/ConfirmDialog'
import { gearIcon, refreshIcon, searchIcon } from '../../features/git/icons'
import { UpdateProjectDialog } from '../../features/git/UpdateProjectDialog'
import { resetToRemoteBranch, updateProject, type UpdateProjectMode } from '../../features/git/update-project'
import type { WorkbenchServices } from '../services'

import { BranchControl } from './BranchControl'
import { GitActions } from './GitActions'
import { RunControls } from './RunControls'
import { ToolbarDivider } from './ToolbarDivider'
import { ToolButton } from './ToolButton'

/** 主工具栏 props。 */
export interface MainToolbarProps {
  /** 工作台服务总线。 */
  services: WorkbenchServices
  /** 外壳翻译函数。 */
  t: Translate
}

/**
 * 渲染主工具栏。
 * @param props 见 MainToolbarProps
 * @returns 顶部一条工具条
 */
export function MainToolbar({ services, t }: MainToolbarProps): React.ReactElement {
  // 工作区根由宿主提供，子组件共用一个值
  const root = useSyncExternalStore(
    (listener) => services.subscribeRoot(listener),
    () => services.root,
    () => services.root,
  )
  /** 分支信息加载中：更新按钮显示刷新中文案。 */
  const [busy, setBusy] = useState(false)
  /** Update Project 对话框是否打开。 */
  const [updateOpen, setUpdateOpen] = useState(false)
  /** Update Project 对话框打开时的默认选项，取宿主里保存的上次选择。 */
  const [updateMode, setUpdateMode] = useState<UpdateProjectMode>('merge')
  /** 待确认的危险操作；非空时弹出确认框。 */
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null)

  /**
   * 点更新图标：勾过 Don't show again 就直接更新，否则先弹出方式选择对话框。
   */
  const openUpdateProject = useCallback((): void => {
    const settings = services.settings()

    if (settings.updateProjectSkipDialog) {
      void updateProject(root, settings.updateProjectMode, services, t)

      return
    }

    setUpdateMode(settings.updateProjectMode)
    setUpdateOpen(true)
  }, [root, services, t])

  /**
   * 更新对话框点 OK：先记下选择（如勾选），再按所选方式更新工作区。
   * @param mode 更新方式
   * @param remember 是否勾选 Don't show again
   */
  const applyUpdate = useCallback(
    (mode: UpdateProjectMode, remember: boolean): void => {
      setUpdateOpen(false)

      // 记住选择落到宿主设置里，跨会话与换承载面都保持一致
      if (remember) services.updateSettings({ updateProjectMode: mode, updateProjectSkipDialog: true })

      void updateProject(root, mode, services, t)
    },
    [root, services, t],
  )

  /** 更新对话框点 Reset：hard reset 会丢掉本地未推送的提交，先二次确认。 */
  const resetProjectToRemote = useCallback((): void => {
    setUpdateOpen(false)
    setConfirm({
      // 确认框标题：把当前分支重置到远端分支
      title: t('git.updateProjectResetTitle'),
      message: t('git.updateProjectResetConfirm'),
      // 确认按钮：执行重置
      confirmLabel: t('git.updateProjectResetRemote'),
      // 取消按钮：放弃重置
      cancelLabel: t('shell.cancel'),
      danger: true,
      run: () => void resetToRemoteBranch(root, services, t),
    })
  }, [root, services, t])

  return (
    <div
      className="flex h-9 shrink-0 items-center gap-0.5 border-b border-line1 bg-surface1 pl-2 pr-2"
      // 工具栏右键：前几项对应 IDEA 的工具栏自定义，当前不可用，先保留结构
      onContextMenu={(event) =>
        openIdeContextMenu(event, services, [
          { id: 'customizeToolbar', label: t('shell.menuCustomizeToolbar') },
          { id: 'showToolbar', label: t('shell.menuShowToolbar') },
          { id: 'hideToolbar', label: t('shell.menuHideToolbar') },
          {
            id: 'settings',
            label: t('shell.settings'),
            shortcut: '⌘,',
            separatorBefore: true,
            run: () => services.openPage('settings'),
          },
        ])
      }
    >
      <RunControls t={t} services={services} root={root} />

      <ToolbarDivider />

      <BranchControl
        t={t}
        services={services}
        root={root}
        onBusyChange={setBusy}
        onRequestUpdate={openUpdateProject}
      />

      <ToolbarDivider />

      <GitActions t={t} services={services} root={root} busy={busy} onRequestUpdate={openUpdateProject} />

      <ToolbarDivider />

      <div className="flex items-center gap-0.5">
        {/* 刷新：重读分支、配置与文件树，外部改过文件后也能看到最新状态 */}
        <ToolButton
          label={t('shell.refresh')}
          onClick={() => {
            services.refreshGitStatus()
            // 文件树与 Git 状态反映的是同一份工作区，工具栏刷新要一并重读，
            // 否则在外部改过文件后点刷新，树里仍看不到新文件
            services.invalidate()
          }}
        >
          {refreshIcon()}
        </ToolButton>
      </div>

      <span className="flex-1" />

      {/* 命令面板：当前打开设置页 */}
      <ToolButton label={t('shell.commandPalette')} onClick={() => services.openPage('settings')}>
        {searchIcon()}
      </ToolButton>

      {/* 设置 */}
      <ToolButton label={t('shell.settings')} onClick={() => services.openPage('settings')}>
        {gearIcon()}
      </ToolButton>

      {/* 更新工程对话框：选择合并或变基，或把当前分支重置到远端分支 */}
      {updateOpen && (
        <UpdateProjectDialog
          t={t}
          mode={updateMode}
          onCancel={() => setUpdateOpen(false)}
          onApply={applyUpdate}
          onResetToRemote={resetProjectToRemote}
          dialogSizes={services.dialogSizes}
        />
      )}

      {confirm !== null && (
        <ConfirmDialog
          request={confirm}
          onClose={() => setConfirm(null)}
          dialogSizes={services.dialogSizes}
        />
      )}
    </div>
  )
}
