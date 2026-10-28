/**
 * Git 面板用到的图标渲染函数。
 *
 * 与项目树图标一致：currentColor + 纯 SVG，不依赖宿主图标集，随按钮继承主题色。
 */
import React from 'react'

/**
 * 左侧列下方与面板标题使用的 Git 图标。
 * @returns 分支圆点与连线
 */
export function gitIcon(): React.ReactNode {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true" focusable="false">
      <circle cx="5.6" cy="4.8" r="1.9" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="5.6" cy="13.2" r="1.9" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="12.6" cy="7.6" r="1.9" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M5.6 6.7v4.6M12.6 9.5c0 2-2 3.7-4.4 3.7H5.6"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  )
}
