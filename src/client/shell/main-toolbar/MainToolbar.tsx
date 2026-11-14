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
import { MergeStatusBar } from '../../features/conflicts/MergeStatusBar'
import { initRepository } from '../../features/git/api'
import { gearIcon, refreshIcon, searchIcon } from '../../features/git/icons-ui'
import { UpdateProjectDialog } from '../../features/git/UpdateProjectDialog'
import { resetToRemoteBranch, updateProject, type UpdateProjectMode } from '../../features/git/update-project'
import type { WorkbenchServices } from '../services'

import { BranchControl } from './BranchControl'
import { GitActions } from './GitActions'
import { closeIcon } from './icons'
import { RunControls } from './RunControls'
import { ToolbarDivider } from './ToolbarDivider'
import { ToolButton } from './ToolButton'

/** 主工具栏 props。 */
export interface MainToolbarProps {
  /** 工作台服务总线。 */
  services: WorkbenchServices
  /** 外壳翻译函数。 */
  t: Translate
  /** 关闭当前承载面；只有对话页弹窗传入，主区与右侧栏没有关闭入口。 */
  onClose?: () => void
}

/**
 * 渲染主工具栏。
 * @param props 见 MainToolbarProps
 * @returns 顶部一条工具条
 */
export function MainToolbar({ services, t, onClose }: MainToolbarProps): React.ReactElement {
  // 工作区根由宿主提供，子组件共用一个值
  const root = useSyncExternalStore(
    (listener) => services.subscribeRoot(listener),
    () => services.root,
    () => services.root,
  )

  /** 工作区是否为 Git 仓库：非仓库时点击 Git 区先引导初始化。 */
  const gitRepository = useSyncExternalStore(
    (listener) => services.subscribeGitStatus(listener),
    () => services.gitRepository(),
    () => services.gitRepository(),
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
   * 对话框里切换更新方式：立刻写入宿主设置，下次打开（含新会话）就沿用这个选择。
   * @param mode 新选中的更新方式
   */
  const persistUpdateMode = useCallback(
    (mode: UpdateProjectMode): void => {
      setUpdateMode(mode)
      services.updateSettings({ updateProjectMode: mode })
    },
    [services],
  )

  /**
   * 更新对话框点 OK：按所选方式更新工作区；勾了 Don't show again 才补记跳过弹窗。
   * @param mode 更新方式
   * @param remember 是否勾选 Don't show again
   */
  const applyUpdate = useCallback(
    (mode: UpdateProjectMode, remember: boolean): void => {
      setUpdateOpen(false)

      // 更新方式在单选框切换时就已保存，这里只补记「下次跳过对话框」
      if (remember) services.updateSettings({ updateProjectSkipDialog: true })

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

  /**
   * 在当前工作区执行 `git init`。
   *
   * 成功后只刷新状态：分支名、文件状态与左侧 Git 入口都由这次刷新带动恢复，
   * 不主动抢占用户当前打开的底部面板。
   */
  const initializeGit = useCallback((): void => {
    void initRepository(root).then((result) => {
      if (!result.ok) {
        console.error('[dsh-ide] 初始化 Git 仓库失败:', result.error)
        services.toast('error', t('shell.gitInitFailed'))

        return
      }

      services.toast('success', t('shell.gitInitDone'))
      // 初始化会顺带生成 .gitignore：项目树缓存里还没有这个文件，
      // 只刷新 Git 状态看不到它，必须同时广播一次文件系统变更让目录重读
      services.invalidate()
      services.refreshGitStatus()
    })
  }, [root, services, t])

  /**
   * 点击顶部 Git 区。
   *
   * 工作区不是 Git 仓库时，Add / Update / Commit 等按钮点下去只会各自报一次
   * 「不是仓库」的错；与 IDEA 一致，先在捕获阶段拦下整块点击，问是否初始化。
   */
  const interceptGitAreaClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>): void => {
      // 未绑定工作区时没有可初始化的目录，交给各按钮自己的「未绑定会话」提示
      if (gitRepository || root === '') return

      // 捕获阶段拦停：分支弹窗与各动作按钮都不该在非仓库状态下继续响应
      event.preventDefault()
      event.stopPropagation()

      setConfirm({
        // 确认框标题：当前工作区还不是 Git 仓库
        title: t('shell.gitNotRepositoryTitle'),
        // 确认框正文：说明使用 Git 操作前需要先初始化
        message: t('shell.gitNotRepositoryMessage'),
        // 确认按钮：执行初始化
        confirmLabel: t('shell.gitInitConfirm'),
        // 取消按钮：不初始化，保持原样
        cancelLabel: t('shell.cancel'),
        run: initializeGit,
      })
    },
    [gitRepository, initializeGit, root, t],
  )

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
            separatorBefore: true,
            run: () => services.openPage('settings'),
          },
        ])
      }
    >
      <RunControls t={t} services={services} root={root} />

      <ToolbarDivider />

      {/* Git 区：非仓库工作区时整块点击都转成「是否初始化」的确认 */}
      <div className="flex min-w-0 items-center gap-0.5" onClickCapture={interceptGitAreaClick}>
        <BranchControl
          t={t}
          services={services}
          root={root}
          onBusyChange={setBusy}
          onRequestUpdate={openUpdateProject}
        />

        {/* 合并状态：与截图一致，紧跟在分支名后面显示当前操作与 Accept / Abort */}
        <MergeStatusBar t={t} services={services} />

        <ToolbarDivider />

        <GitActions t={t} services={services} root={root} busy={busy} onRequestUpdate={openUpdateProject} />
      </div>

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

      {/* 全局搜索：展开左侧列下方同一个搜索面板，入口与工具条图标指向同一份视图 */}
      <ToolButton label={t('shell.menuSearchEverywhere')} onClick={() => services.openBottomPanel('search')}>
        {searchIcon()}
      </ToolButton>

      {/* 设置 */}
      <ToolButton label={t('shell.settings')} onClick={() => services.openPage('settings')}>
        {gearIcon()}
      </ToolButton>

      {/* 关闭弹窗：仅弹窗承载面有，放在设置右侧，对应 IDEA 窗口右上角的关闭位置 */}
      {onClose !== undefined && (
        <ToolButton label={t('shell.popupClose')} onClick={onClose}>
          {closeIcon()}
        </ToolButton>
      )}

      {/* 更新工程对话框：选择合并或变基，或把当前分支重置到远端分支 */}
      {updateOpen && (
        <UpdateProjectDialog
          t={t}
          mode={updateMode}
          onModeChange={persistUpdateMode}
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
