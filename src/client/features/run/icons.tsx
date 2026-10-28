/**
 * 启动器面板用到的图标渲染函数。
 *
 * 与项目树图标一致：currentColor + 纯 SVG，不依赖宿主图标集，随按钮继承主题色。
 */
import React from 'react'

/**
 * 左侧列下方与面板标题使用的启动器图标。
 * @returns 播放三角
 */
export function runIcon(): React.ReactNode {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M6.2 4.1l8 4.9-8 4.9V4.1Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  )
}
