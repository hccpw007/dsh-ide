/**
 * Git 历史面板用到的图标。
 *
 * 与其余 feature 一致：currentColor + 纯 SVG，不依赖宿主图标集。
 */
import React from 'react'

/**
 * 左侧工具条与面板标题使用的历史图标。
 * @returns 时间线加节点
 */
export function historyIcon(): React.ReactNode {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true" focusable="false">
      <path d="M3 9a6 6 0 1 0 1.8-4.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M3 3.4V6.6h3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 6.2V9l2 1.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
