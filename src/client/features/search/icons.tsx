/**
 * 搜索面板用到的图标。
 *
 * 与其余 feature 一致：currentColor + 纯 SVG，不依赖宿主图标集。
 */
import React from 'react'

/**
 * 左侧工具条与面板标题使用的搜索图标。
 * @returns 放大镜
 */
export function searchIcon(): React.ReactNode {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="4.6" stroke="currentColor" strokeWidth="1.3" />
      <path d="m11.4 11.4 3.4 3.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
