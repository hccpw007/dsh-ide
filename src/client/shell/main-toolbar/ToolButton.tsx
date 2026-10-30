/**
 * 顶部工具栏的图标按钮。
 *
 * 只有图标、没有文字：提示文案与不可用原因都挂在 title 上，与 IDEA 工具栏一致。
 */
import React from 'react'

import { cn } from '../../../common/cn'

/** 工具栏图标按钮 props。 */
export interface ToolButtonProps {
  /** 悬停提示与无障碍名称。 */
  label: string
  /** 点击回调；不传时按钮只作占位。 */
  onClick?(event: React.MouseEvent): void
  /** 不可用的原因；有值时按钮禁用，并拼进悬停提示。 */
  unavailable?: string
  /** 强调色调：运行按钮用绿色，回滚等危险动作用红色。 */
  tone?: 'success' | 'danger'
  /** 图标。 */
  children: React.ReactNode
}

/**
 * 渲染一个工具栏图标按钮。
 * @param props 见 ToolButtonProps
 * @returns 28px 见方的图标按钮
 */
export function ToolButton({ label, onClick, unavailable, tone, children }: ToolButtonProps): React.ReactElement {
  const disabled = unavailable !== undefined

  return (
    <button
      type="button"
      title={disabled ? `${label} — ${unavailable}` : label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded transition-colors',
        disabled
          ? 'cursor-default text-secondary/40'
          : tone === 'success'
            ? 'text-success hover:bg-surface2'
            : tone === 'danger'
              ? 'text-danger hover:bg-surface2'
              : 'text-secondary hover:bg-surface2 hover:text-primary',
      )}
    >
      {children}
    </button>
  )
}
