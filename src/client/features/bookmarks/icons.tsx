/**
 * 书签面板用到的图标。
 *
 * 与其余 feature 一致：currentColor + 纯 SVG，不依赖宿主图标集。
 */
import React from 'react'

/**
 * 左侧工具条与面板标题使用的书签图标。
 * @returns 书签轮廓
 */
export function bookmarksIcon(): React.ReactNode {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M4.8 3.2h8.4c.6 0 1 .4 1 1v10.4l-5.2-3.2-5.2 3.2V4.2c0-.6.4-1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  )
}
