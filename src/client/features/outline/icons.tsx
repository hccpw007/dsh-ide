/**
 * 大纲面板用到的图标。
 *
 * 与其余 feature 一致：currentColor + 纯 SVG，不依赖宿主图标集。
 */
import React from 'react'

/**
 * 左侧工具条与面板标题使用的大纲图标。
 * @returns 层级列表
 */
export function outlineIcon(): React.ReactNode {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true" focusable="false">
      <path d="M3.4 4.6h3.2M3.4 9h3.2M3.4 13.4h3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M8.4 4.6h6.2M8.4 9h4.4M8.4 13.4h6.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}
