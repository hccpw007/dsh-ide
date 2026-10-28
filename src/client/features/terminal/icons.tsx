/**
 * 终端面板用到的图标渲染函数。
 *
 * 与项目树图标一致：currentColor + 纯 SVG，不依赖宿主图标集，随按钮继承主题色。
 */
import React from 'react'

/**
 * 左侧列下方与面板标题使用的终端图标。
 * @returns 带提示符的方框
 */
export function terminalIcon(): React.ReactNode {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true" focusable="false">
      <rect x="2.2" y="3.2" width="13.6" height="11.6" rx="1.8" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M5.2 7.1 7.6 9.2l-2.4 2.1M9.4 11.4h3.4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
