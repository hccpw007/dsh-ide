/**
 * Log 页签用到的两个对话框：分支输入与提交重置。
 *
 * 只负责外观与输入，真正的 Git 调用由调用方在确认回调里执行。
 */
import React from 'react'

import { cn } from '../../../common/cn'
import type { DialogSizeStore } from '../../../common/dialog-size'
import { useDialogResize } from '../../../common/dialog-resize'
import type { Translate } from '../../../types/plugin'

import type { GitCommit } from './api'

/** 分支输入框默认大小：刚好放下标题、说明、输入框与按钮。 */
const PROMPT_INITIAL_SIZE = { width: 380, height: 160 }

/** 分支输入框缩放下限。 */
const PROMPT_MIN_SIZE = { width: 300, height: 140 }

/** 重置对话框默认大小：比输入框高出一行模式说明。 */
const RESET_INITIAL_SIZE = { width: 400, height: 220 }

/** 重置对话框缩放下限。 */
const RESET_MIN_SIZE = { width: 320, height: 180 }

/** 分支输入对话框。 */
export function PromptDialog({
  t,
  title,
  hint,
  value,
  onChange,
  onCancel,
  onConfirm,
  dialogSizes,
}: {
  t: Translate
  title: string
  hint: string
  value: string
  onChange(value: string): void
  onCancel(): void
  onConfirm(): void
  /** 尺寸存取入口；右下角拖拽结束后写回设置。 */
  dialogSizes: DialogSizeStore
}): React.ReactElement {
  const { size, handle } = useDialogResize(dialogSizes, {
    key: 'git-prompt',
    initial: PROMPT_INITIAL_SIZE,
    min: PROMPT_MIN_SIZE,
  })

  return (
    <div className="fixed inset-0 z-[9998] flex items-start justify-center bg-black/30 pt-24">
      <div className="relative flex flex-col rounded-md border border-line2 bg-overlay p-3 shadow-2xl" style={size}>
        {/* 对话框标题与创建/重命名的起点说明 */}
        <div className="mb-1 shrink-0 text-xs text-primary">{title}</div>
        <div className="mb-2 shrink-0 truncate text-[11px] text-secondary">{hint}</div>

        <input
          autoFocus
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onConfirm()
            if (event.key === 'Escape') onCancel()
          }}
          className="mb-3 w-full shrink-0 rounded border border-line2 bg-base px-2 py-1 text-xs text-primary outline-none focus:border-line4"
        />

        {/* 按钮贴底：弹窗被拖高时留白集中在中段，按钮位置保持稳定 */}
        <div className="mt-auto flex shrink-0 justify-end gap-2">
          {/* 取消，不创建也不重命名 */}
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-line2 px-2 py-1 text-xs text-primary hover:bg-surface2"
          >
            {t('cancel')}
          </button>

          {/* 确认执行分支操作 */}
          <button
            type="button"
            onClick={onConfirm}
            className="rounded border border-line2 px-2 py-1 text-xs text-primary hover:bg-surface2"
          >
            {t('ok')}
          </button>
        </div>

        {handle}
      </div>
    </div>
  )
}

/** 重置提交对话框。 */
export function ResetDialog({
  t,
  target,
  onCancel,
  onReset,
  dialogSizes,
}: {
  t: Translate
  target: GitCommit
  onCancel(): void
  onReset(mode: 'soft' | 'mixed' | 'hard'): void
  /** 尺寸存取入口；右下角拖拽结束后写回设置。 */
  dialogSizes: DialogSizeStore
}): React.ReactElement {
  const { size, handle } = useDialogResize(dialogSizes, {
    key: 'git-reset',
    initial: RESET_INITIAL_SIZE,
    min: RESET_MIN_SIZE,
  })

  return (
    <div className="fixed inset-0 z-[9998] flex items-start justify-center bg-black/30 pt-24">
      <div className="relative flex flex-col rounded-md border border-line2 bg-overlay p-3 shadow-2xl" style={size}>
        {/* 重置提交对话框：三种模式的选择 */}
        <div className="mb-2 shrink-0 text-xs text-primary">{t('resetTitle')}</div>
        <div className="mb-3 shrink-0 truncate font-mono text-[11px] text-secondary">
          {target.shortHash} {target.subject}
        </div>

        <div className="shrink-0 space-y-1">
          {(['soft', 'mixed', 'hard'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onReset(mode)}
              className={cn(
                'block w-full rounded px-2 py-1 text-left text-xs hover:bg-surface2',
                mode === 'hard' ? 'text-danger' : 'text-primary',
              )}
            >
              {mode === 'soft' ? t('resetSoft') : mode === 'mixed' ? t('resetMixed') : t('resetHard')}
            </button>
          ))}
        </div>

        <div className="mt-auto flex shrink-0 justify-end">
          {/* 取消重置 */}
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-line2 px-2 py-1 text-xs text-primary hover:bg-surface2"
          >
            {t('cancel')}
          </button>
        </div>

        {handle}
      </div>
    </div>
  )
}
