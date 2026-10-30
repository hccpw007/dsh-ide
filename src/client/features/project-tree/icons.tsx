/**
 * 项目树用到的图标渲染函数。
 *
 * 除文件类型图标外，这里全部使用 currentColor 与宿主主题令牌类名，不写死颜色；
 * SVG 随按钮文字一起继承明暗主题。文件类型图标是 IDEA 官方彩色图标，单独放在
 * file-icons.tsx。这里导出的是返回 ReactNode 的渲染函数而不是组件，避免为每个
 * 12px 图标单独建立组件文件。
 */
import React from 'react'

import { cn } from '../../../common/cn'

/**
 * 工具窗口按钮与入口使用的项目树图标。
 * @returns 文件夹加层级线的图标
 */
export function projectTreeIcon(): React.ReactNode {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M2.5 4.6c0-.83.67-1.5 1.5-1.5h3.16l1.5 1.8H14c.83 0 1.5.67 1.5 1.5v7.2c0 .83-.67 1.5-1.5 1.5H4c-.83 0-1.5-.67-1.5-1.5V4.6Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M5.6 8.3h6.8M5.6 11.1h4.4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  )
}

/**
 * 目录行的展开箭头。
 * @param expanded 目录是否已展开
 * @returns 收起时朝右、展开时朝下的箭头
 */
export function chevronIcon(expanded: boolean): React.ReactNode {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={cn('shrink-0 transition-transform', expanded ? 'rotate-90' : 'rotate-0')}
    >
      <path
        d="M4.25 2.5 7.75 6l-3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * 工具窗口标题旁的下拉箭头。
 * @returns 朝下的小箭头
 */
export function chevronDownIcon(): React.ReactNode {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true" focusable="false" className="shrink-0">
      <path
        d="M3 4.6 6 7.6l3-3"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * 目录行图标。
 * @param open 目录是否已展开
 * @returns 打开与闭合两种文件夹轮廓
 */
export function folderIcon(open: boolean): React.ReactNode {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
    >
      {open ? (
        <path
          d="M1.8 4.4c0-.66.54-1.2 1.2-1.2h2.9l1.3 1.55h5.8c.66 0 1.2.54 1.2 1.2v.55H3.1L1.8 11.4V4.4Z M1.8 11.4l1.5-4.05c.16-.43.57-.72 1.03-.72h9.1c.72 0 1.22.72.99 1.4l-1.4 4.1c-.16.47-.6.78-1.1.78H3.02c-.9 0-1.5-.9-1.22-1.51Z"
          stroke="currentColor"
          strokeWidth="1.05"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M1.8 4.4c0-.66.54-1.2 1.2-1.2h2.9l1.3 1.55h5.8c.66 0 1.2.54 1.2 1.2v6.3c0 .66-.54 1.2-1.2 1.2H3c-.66 0-1.2-.54-1.2-1.2V4.4Z"
          stroke="currentColor"
          strokeWidth="1.05"
          strokeLinejoin="round"
        />
      )}
    </svg>
  )
}

/**
 * 工具栏刷新图标。
 * @returns 环形箭头
 */
export function refreshIcon(): React.ReactNode {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M11.4 6.1A4.6 4.6 0 1 0 11 9.6"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path d="M11.7 2.9v3.4H8.3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * 工具栏定位当前文件图标。
 * @returns 带四向刻线的准星
 */
export function locateIcon(): React.ReactNode {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" focusable="false">
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.1" />
      <path
        d="M7 2.4v1.95M7 11.6V9.65M2.4 7h1.95M11.6 7H9.65"
        stroke="currentColor"
        strokeWidth="1.1"
      />
    </svg>
  )
}

/**
 * 工具栏全部展开图标。
 * @returns 向外扩张的双箭头
 */
export function expandAllIcon(): React.ReactNode {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M4 5.4 7 2.4l3 3M4 8.6l3 3 3-3"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * 工具栏全部折叠图标。
 * @returns 向内收拢的双箭头
 */
export function collapseAllIcon(): React.ReactNode {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M4 2.4 7 5.4l3-3M4 11.6l3-3 3 3"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * 工具栏忽略文件开关图标。
 * @param visible 当前是否显示被 .gitignore 忽略的项
 * @returns 显示时为睁眼，隐藏时为划掉的眼睛
 */
export function hiddenIcon(visible: boolean): React.ReactNode {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M1.4 7S3.3 3.6 7 3.6 12.6 7 12.6 7 10.7 10.4 7 10.4 1.4 7 1.4 7Z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <circle cx="7" cy="7" r="1.7" stroke="currentColor" strokeWidth="1.1" />
      {!visible && <path d="M2.2 2.2l9.6 9.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />}
    </svg>
  )
}

/**
 * 右键菜单「Copy」图标。
 * @returns 两个叠在一起的方框
 */
export function copyIcon(): React.ReactNode {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" focusable="false">
      <rect x="1.7" y="4.3" width="6.6" height="8" rx="1.1" stroke="currentColor" strokeWidth="1.1" />
      <path
        d="M4.7 3.2v-.6c0-.6.5-1.1 1.1-1.1h5.4c.6 0 1.1.5 1.1 1.1v6.2c0 .6-.5 1.1-1.1 1.1h-.6"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * 右键菜单「Paste」图标。
 * @returns 带顶部夹子的剪贴板
 */
export function pasteIcon(): React.ReactNode {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" focusable="false">
      <rect x="2.6" y="2.7" width="8.8" height="9.6" rx="1.2" stroke="currentColor" strokeWidth="1.1" />
      <path
        d="M5.3 2.7v-.5c0-.5.4-.9.9-.9h1.6c.5 0 .9.4.9.9v.5"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
      <path d="M5.1 6h3.8M5.1 8.6h2.6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  )
}

/**
 * 右键菜单「Reload from Disk」图标。
 * @returns 逆时针循环箭头
 */
export function reloadFromDiskIcon(): React.ReactNode {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" focusable="false">
      <path d="M11.4 6.1A4.6 4.6 0 1 0 11 9.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M11.7 2.9v3.4H8.3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * 右键菜单「Compare With...」图标。
 * @returns 一对相对的箭头
 */
export function compareWithIcon(): React.ReactNode {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" focusable="false">
      <path d="M2.2 4.6h8.2M8.2 2.4l2.2 2.2-2.2 2.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.8 9.4H3.6M5.8 7.2 3.6 9.4l2.2 2.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * 右键菜单「Add to .gitignore file」图标。
 * @returns 实心菱形
 */
export function gitignoreIcon(): React.ReactNode {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" focusable="false">
      <path d="M7 1.4 12.6 7 7 12.6 1.4 7 7 1.4Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  )
}
