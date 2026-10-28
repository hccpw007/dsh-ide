/**
 * 分支面板用到的图标。
 *
 * 与其余 feature 一致：currentColor + 纯 SVG，不依赖宿主图标集。
 */
import React from 'react'

/**
 * 左侧工具条与面板标题使用的分支图标。
 * @returns 分支节点
 */
export function branchesIcon(): React.ReactNode {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true" focusable="false">
      <circle cx="5.4" cy="4.6" r="1.8" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="5.4" cy="13.4" r="1.8" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="12.6" cy="7.4" r="1.8" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5.4 6.4v5.2M12.6 9.2c0 2-1.6 3-3.6 3.2H7.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}
