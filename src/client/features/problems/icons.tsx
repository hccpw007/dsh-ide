/**
 * 问题面板用到的图标。
 *
 * 与其余 feature 一致：currentColor + 纯 SVG，不依赖宿主图标集。
 */
import React from 'react'

/**
 * 左侧工具条与面板标题使用的问题图标。
 * @returns 带感叹号的圆
 */
export function problemsIcon(): React.ReactNode {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true" focusable="false">
      <circle cx="9" cy="9" r="6.2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M9 5.8v4.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="9" cy="12.1" r="0.8" fill="currentColor" />
    </svg>
  )
}
