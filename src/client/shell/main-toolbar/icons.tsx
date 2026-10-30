/**
 * 主工具栏的局部小图标。
 *
 * 这些图标只服务于顶部工具条的运行配置格与 Add / Show Diff 两个按钮，
 * 与 Git 面板的图标库互不复用，单独放在工具栏目录里。
 */
import React from 'react'

/** 运行配置前的项目标记：一个带勾的方框。 */
export function configIcon(): React.ReactNode {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M2.6 13.4V4.2h4l1.6 1.8h5.2v7.4z" />
      <path d="m5.4 9.6 1.6 1.6 3.2-3.2" />
    </svg>
  )
}

/** 运行配置下拉里当前选中项的勾选标记。 */
export function checkIcon(): React.ReactNode {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="m3.4 8.4 3 3 6.2-6.4" />
    </svg>
  )
}

/** 运行：实心三角。 */
export function playIcon(): React.ReactNode {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className="shrink-0">
      <path d="M4.6 2.8 13 8l-8.4 5.2z" />
    </svg>
  )
}

/** 新建：加号。 */
export function plusIcon(): React.ReactNode {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M8 3v10M3 8h10" />
    </svg>
  )
}

/** 查看历史：一上一下两条带箭头的横线。 */
export function swapArrowsIcon(): React.ReactNode {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M13 5.3H3M5.6 2.6 2.9 5.3l2.7 2.7" />
      <path d="M3 10.7h10M10.4 8l2.7 2.7-2.7 2.7" />
    </svg>
  )
}
