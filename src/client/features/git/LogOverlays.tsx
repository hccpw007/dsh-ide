/**
 * Log 页签的浮层：右键菜单、输入框、重置、提交信息编辑与分支比较窗口。
 *
 * 这些浮层只在对应状态非空时出现，与主布局没有结构关系；拆成独立组件后
 * LogTab 的返回结构只剩分支树、过滤栏与提交列表。
 */
import React from 'react'

import type { Translate } from '../../../types/plugin'
import type { IdeServices } from '../../shell/contract'

import type { GitCommit } from './api'
import { BranchDiffDialog } from './BranchDiffDialog'
import { EditMessageDialog, PromptDialog, ResetDialog, type ResetMode } from './LogDialogs'
import type { CompareState, PromptState } from './log-state'
import { ContextMenu, type MenuState } from './menu'

/** 右键菜单浮层。 */
export interface MenuOverlay {
  /** 菜单状态；null 表示未打开。 */
  state: MenuState | null
  onClose(): void
}

/** 输入框浮层。 */
export interface PromptOverlay {
  state: PromptState | null
  value: string
  onChange(value: string): void
  onCancel(): void
  onConfirm(): void
}

/** 重置对话框浮层。 */
export interface ResetOverlay {
  /** 被重置到的提交；null 表示未打开。 */
  target: GitCommit | null
  /** 当前检出分支名，显示在对话框里。 */
  branch: string
  onCancel(): void
  onConfirm(mode: ResetMode): void
}

/** 提交信息编辑浮层。 */
export interface MessageOverlay {
  /** 被编辑的提交；null 表示未打开。 */
  target: GitCommit | null
  value: string
  onChange(value: string): void
  onCancel(): void
  onConfirm(): void
}

/** 分支比较浮层。 */
export interface CompareOverlay {
  /** 比较状态；null 表示未打开。 */
  state: CompareState | null
  onClose(): void
}

/** 浮层组件 props。 */
export interface LogOverlaysProps {
  /** 已绑定 git 前缀的翻译函数。 */
  t: Translate
  /** 工作台服务总线。 */
  services: IdeServices
  /** 工作区根。 */
  root: string
  menu: MenuOverlay
  prompt: PromptOverlay
  reset: ResetOverlay
  message: MessageOverlay
  compare: CompareOverlay
}

/**
 * 渲染 Log 页签的全部浮层。
 * @param props 见 LogOverlaysProps
 * @returns 各浮层的组合；未打开的不渲染
 */
export function LogOverlays({
  t,
  services,
  root,
  menu,
  prompt,
  reset,
  message,
  compare,
}: LogOverlaysProps): React.ReactElement {
  return (
    <>
      {menu.state !== null && <ContextMenu menu={menu.state} onClose={menu.onClose} />}

      {prompt.state !== null && (
        <PromptDialog
          t={t}
          title={prompt.state.title}
          hint={prompt.state.hint}
          value={prompt.value}
          onChange={prompt.onChange}
          dialogSizes={services.dialogSizes}
          onCancel={prompt.onCancel}
          onConfirm={prompt.onConfirm}
        />
      )}

      {reset.target !== null && (
        <ResetDialog
          t={t}
          target={reset.target}
          branch={reset.branch}
          dialogSizes={services.dialogSizes}
          onCancel={reset.onCancel}
          onReset={reset.onConfirm}
        />
      )}

      {message.target !== null && (
        <EditMessageDialog
          t={t}
          commit={message.target}
          value={message.value}
          onChange={message.onChange}
          dialogSizes={services.dialogSizes}
          onCancel={message.onCancel}
          onConfirm={message.onConfirm}
        />
      )}

      {/* 分支比较窗口：Compare with 与 Show Diff with Working Tree 共用 */}
      {compare.state !== null && (
        <BranchDiffDialog
          t={t}
          services={services}
          root={root}
          title={compare.state.title}
          left={compare.state.left}
          right={compare.state.right}
          files={compare.state.files}
          onClose={compare.onClose}
        />
      )}
    </>
  )
}
