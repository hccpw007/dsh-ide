/**
 * TODO 面板用到的图标。
 *
 * 与其余 feature 一致：currentColor + 纯 SVG，不依赖宿主图标集。
 */
import React from 'react'

/**
 * 左侧工具条与面板标题使用的 TODO 图标。
 * @returns 勾选框加列表线
 */
export function todoIcon(): React.ReactNode {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true" focusable="false">
      <rect x="2.6" y="3.6" width="12.8" height="10.8" rx="1.6" stroke="currentColor" strokeWidth="1.3" />
      <path d="m5.2 8.1 1.5 1.5 2.4-2.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.6 11.4h3.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}
