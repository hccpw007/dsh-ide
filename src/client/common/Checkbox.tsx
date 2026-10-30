/**
 * 全项目统一的勾选框。
 *
 * 外观定稿于 Commit 弹窗变更树的勾选框：14px 方块、选中为实心蓝底白勾、部分选中显示
 * 横杠。此前各功能自绘或直接用浏览器原生 `input[type=checkbox]`，尺寸、圆角与配色在
 * 深浅主题下各不相同，统一收敛到这里。
 */
import React from 'react'

import { cn } from '../../common/cn'

/** 勾选状态：'mixed' 表示父节点下子项只选中一部分。 */
export type CheckboxState = boolean | 'mixed'

/** 勾选框 props。 */
export interface CheckboxProps {
  /** 勾选状态。 */
  checked: CheckboxState
  /**
   * 状态切换回调。
   * @param next 点击后的目标状态；部分选中时首次点击变为全选
   */
  onChange(next: boolean): void
  /** 紧随方块的文案；不传时只渲染方块，文案由所在行负责。 */
  label?: React.ReactNode
  /** 无障碍角色：互斥选项传 radio，其余保持 checkbox。 */
  role?: 'checkbox' | 'radio'
  /** 追加到根按钮的布局类，如对齐、字号或宽度。 */
  className?: string
}

/**
 * 渲染一个勾选框。
 * @param props 见 CheckboxProps
 * @returns 方块加可选文案的可点击按钮
 */
export function Checkbox({
  checked,
  onChange,
  label,
  role = 'checkbox',
  className,
}: CheckboxProps): React.ReactElement {
  return (
    <button
      type="button"
      role={role}
      aria-checked={checked === 'mixed' ? 'mixed' : checked}
      onClick={(event) => {
        // 勾选只改变自身状态，不触发所在行的选中或展开
        event.stopPropagation()
        onChange(checked !== true)
      }}
      className={cn('inline-flex shrink-0 items-center gap-2 text-left', className)}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border',
          checked === false ? 'border-line4 bg-inputbg' : 'border-actionblue bg-actionblue',
        )}
      >
        {checked === true && (
          // shrink-0 必不可少：SVG 作为 flex item 默认会被压缩，14px 的勾选框里对勾会消失
          <svg
            width="10"
            height="10"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden="true"
            focusable="false"
            className="shrink-0 text-onAccent"
          >
            <path
              d="M2.2 6.2 4.8 8.8 9.8 3.2"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}

        {/* 部分选中：一条横杠，与 IDEA 的三态勾选框一致 */}
        {checked === 'mixed' && <span className="h-0.5 w-2 rounded-sm bg-onAccent" />}
      </span>

      {label}
    </button>
  )
}
