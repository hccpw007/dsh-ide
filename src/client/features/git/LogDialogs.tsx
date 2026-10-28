/**
 * Log 页签用到的两个对话框：分支输入与提交重置。
 *
 * 只负责外观与输入，真正的 Git 调用由调用方在确认回调里执行。
 */
import React from 'react'

import { cn } from '../../../common/cn'
import type { Translate } from '../../../types/plugin'

import type { GitCommit } from './api'

/** 分支输入对话框。 */
export function PromptDialog({
  t,
  title,
  hint,
  value,
  onChange,
  onCancel,
  onConfirm,
}: {
  t: Translate
  title: string
  hint: string
  value: string
  onChange(value: string): void
  onCancel(): void
  onConfirm(): void
}): React.ReactElement {
  return (
    <div className="fixed inset-0 z-[9998] flex items-start justify-center bg-black/30 pt-24">
      <div className="w-[380px] rounded-md border border-line2 bg-overlay p-3 shadow-2xl">
        {/* 对话框标题与创建/重命名的起点说明 */}
        <div className="mb-1 text-xs text-primary">{title}</div>
        <div className="mb-2 truncate text-[11px] text-secondary">{hint}</div>

        <input
          autoFocus
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onConfirm()
            if (event.key === 'Escape') onCancel()
          }}
          className="mb-3 w-full rounded border border-line2 bg-base px-2 py-1 text-xs text-primary outline-none focus:border-line4"
        />

        <div className="flex justify-end gap-2">
          {/* 取消，不创建也不重命名 */}
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-line2 px-2 py-1 text-xs text-primary hover:bg-layer2"
          >
            {t('cancel')}
          </button>

          {/* 确认执行分支操作 */}
          <button
            type="button"
            onClick={onConfirm}
            className="rounded border border-line2 px-2 py-1 text-xs text-primary hover:bg-layer2"
          >
            {t('ok')}
          </button>
        </div>
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
}: {
  t: Translate
  target: GitCommit
  onCancel(): void
  onReset(mode: 'soft' | 'mixed' | 'hard'): void
}): React.ReactElement {
  return (
    <div className="fixed inset-0 z-[9998] flex items-start justify-center bg-black/30 pt-24">
      <div className="w-[400px] rounded-md border border-line2 bg-overlay p-3 shadow-2xl">
        {/* 重置提交对话框：三种模式的选择 */}
        <div className="mb-2 text-xs text-primary">{t('resetTitle')}</div>
        <div className="mb-3 font-mono text-[11px] text-secondary">
          {target.shortHash} {target.subject}
        </div>

        <div className="space-y-1">
          {(['soft', 'mixed', 'hard'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onReset(mode)}
              className={cn(
                'block w-full rounded px-2 py-1 text-left text-xs hover:bg-layer2',
                mode === 'hard' ? 'text-danger' : 'text-primary',
              )}
            >
              {mode === 'soft' ? t('resetSoft') : mode === 'mixed' ? t('resetMixed') : t('resetHard')}
            </button>
          ))}
        </div>

        <div className="mt-3 flex justify-end">
          {/* 取消重置 */}
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-line2 px-2 py-1 text-xs text-primary hover:bg-layer2"
          >
            {t('cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
