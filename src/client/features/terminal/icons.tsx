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

/**
 * 新建终端按钮的加号。
 * @returns 十字图标
 */
export function plusIcon(): React.ReactNode {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 3.2v9.6M3.2 8h9.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

/**
 * 页签列表下拉的箭头。
 * @returns 向下的折线
 */
export function chevronDownIcon(): React.ReactNode {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4.2 6.2 8 10l3.8-3.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * 更多操作的竖排三点。
 * @returns 三个圆点
 */
export function kebabIcon(): React.ReactNode {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="3.6" r="1.15" fill="currentColor" />
      <circle cx="8" cy="8" r="1.15" fill="currentColor" />
      <circle cx="8" cy="12.4" r="1.15" fill="currentColor" />
    </svg>
  )
}

/**
 * 最小化（收起底部面板）的横线。
 * @returns 一条短横线
 */
export function minimizeIcon(): React.ReactNode {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.4 8h9.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

/**
 * 页签上的关闭叉。
 * @returns 交叉线
 */
export function closeTabIcon(): React.ReactNode {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.4 3.4l9.2 9.2M12.6 3.4l-9.2 9.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  )
}
