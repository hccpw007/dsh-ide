/**
 * Update Project 对话框。
 *
 * 与 IDEA 的弹窗一一对应：两个单选项决定远端改动如何进入当前分支，底部左侧是帮助
 * 按钮与「Don't show again」，右侧依次是重置到远端分支、取消与确定。这里只收集
 * 选择，实际执行交给 update-project.ts，避免同一个流程出现第二份实现。
 */
import React, { useEffect, useState } from 'react'

import { cn } from '../../../common/cn'
import type { DialogSizeStore } from '../../../common/dialog-size'
import { useDialogResize } from '../../../common/dialog-resize'
import type { Translate } from '../../../types/plugin'

import type { UpdateProjectMode } from './update-project'

/** 弹窗默认大小：最多 640×190，刚好放下三段内容，窄屏上按可用区域收缩。 */
const INITIAL_SIZE = { widthRatio: 1, heightRatio: 1, maxWidth: 640, maxHeight: 190 }

/** 缩放下限：再小底部四个按钮就放不下了。 */
const MIN_SIZE = { width: 480, height: 170 }

/** 帮助按钮指向 IDEA 官方文档，与在 IDEA 里点 `?` 的效果一致。 */
const HELP_URL = 'https://www.jetbrains.com/help/idea/sync-with-a-remote-repository.html'

/** 对话框 props。 */
export interface UpdateProjectDialogProps {
  /** 外壳翻译函数；key 带 `git.` 前缀。 */
  t: Translate
  /** 打开时的默认选项，取上次保存的选择。 */
  mode: UpdateProjectMode
  /** 关闭对话框，不做任何 Git 操作。 */
  onCancel(): void
  /**
   * 点 OK。
   * @param mode 选中的更新方式
   * @param remember 是否勾选了 Don't show again
   */
  onApply(mode: UpdateProjectMode, remember: boolean): void
  /** 点 Reset to the Remote Branch。 */
  onResetToRemote(): void
  /** 尺寸存取入口；右下角拖拽结束后写回设置。 */
  dialogSizes: DialogSizeStore
}

/**
 * 渲染 Update Project 对话框。
 * @param props 见 UpdateProjectDialogProps
 * @returns 遮罩 + 对话框
 */
export function UpdateProjectDialog({
  t,
  mode,
  onCancel,
  onApply,
  onResetToRemote,
  dialogSizes,
}: UpdateProjectDialogProps): React.ReactElement {
  const [selected, setSelected] = useState<UpdateProjectMode>(mode)
  const [remember, setRemember] = useState(false)
  const { size, handle } = useDialogResize(dialogSizes, {
    key: 'git-update-project',
    initial: INITIAL_SIZE,
    min: MIN_SIZE,
  })

  // Esc 取消、Enter 确认：与桌面 IDE 的对话框习惯一致
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onCancel()

      if (event.key === 'Enter') {
        // 拦住默认行为，避免同一个回车又触发一次焦点按钮
        event.preventDefault()
        onApply(selected, remember)
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)

    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [onApply, onCancel, remember, selected])

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center bg-black/30 pt-24"
      onClick={onCancel}
      onContextMenu={(event) => event.preventDefault()}
    >
      {/* 点击对话框本身不该关闭，拦在冒泡阶段 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('git.updateProjectTitle')}
        className="relative flex flex-col overflow-hidden rounded-[12px] border border-[color:var(--ide-dialog-border)] bg-[var(--ide-dialog-bg)] shadow-2xl"
        style={size}
        onClick={(event) => event.stopPropagation()}
      >
        {/* 标题行：macOS 窗口的三个控制点与标题，与 IDEA 截图一致 */}
        <div className="flex items-center gap-7 px-5 pb-2 pt-3.5">
          <span aria-hidden="true" className="flex items-center gap-2.5">
            <span className="h-3 w-3 rounded-full bg-[var(--ide-window-close)]" />
            <span className="h-3 w-3 rounded-full bg-[var(--ide-window-minimize)]" />
            <span className="h-3 w-3 rounded-full bg-[var(--ide-window-maximize)]" />
          </span>

          {/* 对话框标题 */}
          <span className="whitespace-nowrap text-[13px] font-bold text-[color:var(--ide-dialog-fg)]">
            {t('git.updateProjectTitle')}
          </span>
        </div>

        {/* 两个互斥的更新方式；单选组只收集选择，点 OK 才执行 */}
        <div role="radiogroup" aria-label={t('git.updateProjectTitle')} className="min-h-0 flex-1 px-6 py-3">
          <RadioRow
            label={t('git.updateProjectMerge')}
            checked={selected === 'merge'}
            onSelect={() => setSelected('merge')}
          />

          <RadioRow
            label={t('git.updateProjectRebase')}
            checked={selected === 'rebase'}
            onSelect={() => setSelected('rebase')}
          />
        </div>

        {/* 底部操作行：左侧帮助与「不再询问」，右侧三个动作按钮 */}
        <div className="flex items-center gap-2.5 px-4 pb-4 pt-2">
          {/* 帮助按钮：打开 IDEA 官方文档中更新工程一节 */}
          <a
            href={HELP_URL}
            target="_blank"
            rel="noreferrer noopener"
            title={t('git.updateProjectHelp')}
            aria-label={t('git.updateProjectHelp')}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[color:var(--ide-dialog-control-border)] bg-[var(--ide-dialog-control-bg)] text-[12px] font-semibold text-[color:var(--ide-dialog-fg)] hover:bg-[var(--ide-dialog-hover-bg)]"
          >
            ?
          </a>

          {/* 勾选后下次点更新图标直接按当前选择执行，不再弹窗 */}
          <button
            type="button"
            role="checkbox"
            aria-checked={remember}
            onClick={() => setRemember(!remember)}
            className="flex shrink-0 items-center gap-2.5 whitespace-nowrap text-[13px] text-[color:var(--ide-dialog-fg)]"
          >
            <span
              aria-hidden="true"
              className={cn(
                'flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[2px] border',
                remember
                  ? 'border-[color:var(--ide-dialog-accent)] bg-[var(--ide-dialog-accent)]'
                  : 'border-[color:var(--ide-dialog-check-border)] bg-[var(--ide-dialog-control-bg)]',
              )}
            >
              {remember && (
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="#ffffff" strokeWidth="2.2">
                  <path d="m3.4 8.4 3 3 6.2-6.4" />
                </svg>
              )}
            </span>

            {t('git.updateProjectDontShowAgain')}
          </button>

          <span className="flex-1" />

          {/* 把当前分支重置到上游远端分支；危险动作，由调用方再确认一次 */}
          <button
            type="button"
            onClick={onResetToRemote}
            className="h-7 shrink-0 whitespace-nowrap rounded-[4px] border border-[color:var(--ide-dialog-control-border)] bg-[var(--ide-dialog-control-bg)] px-2.5 text-[13px] text-[color:var(--ide-dialog-fg)] hover:bg-[var(--ide-dialog-hover-bg)]"
          >
            {t('git.updateProjectResetRemote')}
          </button>

          {/* 取消：不执行任何更新 */}
          <button
            type="button"
            onClick={onCancel}
            className="h-7 shrink-0 whitespace-nowrap rounded-[4px] border border-[color:var(--ide-dialog-control-border)] bg-[var(--ide-dialog-control-bg)] px-4 text-[13px] text-[color:var(--ide-dialog-fg)] hover:bg-[var(--ide-dialog-hover-bg)]"
          >
            {t('git.cancel')}
          </button>

          {/* 确定：按所选方式执行更新 */}
          <button
            type="button"
            autoFocus
            onClick={() => onApply(selected, remember)}
            className="h-7 shrink-0 whitespace-nowrap rounded-[4px] border border-[color:var(--ide-dialog-accent-border)] bg-[var(--ide-dialog-accent)] px-6 text-[13px] font-medium text-white hover:bg-[var(--ide-dialog-accent-hover)]"
          >
            {t('git.ok')}
          </button>
        </div>

        {handle}
      </div>
    </div>
  )
}

/**
 * 一行单选项。
 * @param props 文案、是否选中与选中回调
 * @returns 可点击的整行
 */
function RadioRow({
  label,
  checked,
  onSelect,
}: {
  label: string
  checked: boolean
  onSelect(): void
}): React.ReactElement {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className="flex w-full items-center gap-3 py-1.5 text-left"
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
          checked
            ? 'border-[color:var(--ide-dialog-accent)] bg-[var(--ide-dialog-accent)]'
            : 'border-[color:var(--ide-dialog-check-border)] bg-transparent',
        )}
      >
        {checked && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
      </span>

      <span className="whitespace-nowrap text-[13px] text-[color:var(--ide-dialog-fg)]">{label}</span>
    </button>
  )
}
