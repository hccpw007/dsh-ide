/**
 * 输出面板用到的图标渲染函数。
 *
 * 与项目树图标一致：currentColor + 纯 SVG，不依赖宿主图标集，随按钮继承主题色。
 */
import React from 'react'

/**
 * 左侧列下方与面板标题使用的输出图标。
 * @returns 带行号的日志行
 */
export function outputIcon(): React.ReactNode {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true" focusable="false">
      <rect x="2.2" y="3.2" width="13.6" height="11.6" rx="1.8" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M4.9 6.8h8M4.9 9.2h8M4.9 11.6h4.6"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}
