/**
 * Git 面板的图标。
 *
 * 全部是 currentColor 的纯 SVG：不依赖宿主图标集，颜色随按钮继承主题，明暗切换
 * 不需要额外处理。导出的是渲染函数，避免为每个 12px 图标单建一个组件文件。
 */
import React from 'react'

import { cn } from '../../../common/cn'

/**
 * 生成一个 16×16 的线性图标容器。
 * @param children 图形
 * @param size 渲染尺寸
 * @returns SVG 节点
 */
function icon(children: React.ReactNode, size = 14): React.ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
    >
      {children}
    </svg>
  )
}

/** 左侧工具条与面板标题使用的 Git 分支图标。 */
export function gitIcon(): React.ReactNode {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true" focusable="false">
      <circle cx="5.6" cy="4.8" r="1.9" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="5.6" cy="13.2" r="1.9" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="12.6" cy="7.6" r="1.9" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5.6 6.7v4.6M12.6 9.5c0 2-2 3.7-4.4 3.7H5.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

/** 环形刷新箭头。 */
export function refreshIcon(): React.ReactNode {
  return icon(
    <>
      <path d="M13.2 7.2A5.4 5.4 0 0 0 4 4.6L2.6 6" />
      <path d="M2.6 2.9V6h3.1" />
      <path d="M2.8 8.8A5.4 5.4 0 0 0 12 11.4l1.4-1.4" />
      <path d="M13.4 13.1V10H10.3" />
    </>,
  )
}

/** 收起全部分组：两条相对的三角。 */
export function collapseIcon(): React.ReactNode {
  return icon(
    <>
      <path d="M4 2.8 8 6.6l4-3.8" />
      <path d="M4 13.2 8 9.4l4 3.8" />
    </>,
  )
}

/** 向下展开。 */
export function chevronDownIcon(): React.ReactNode {
  return icon(<path d="m4 6 4 4 4-4" />)
}

/** 向右展开。 */
export function chevronRightIcon(): React.ReactNode {
  return icon(<path d="m6 4 4 4-4 4" />)
}

/** 关闭。 */
export function closeIcon(): React.ReactNode {
  return icon(
    <>
      <path d="m4 4 8 8" />
      <path d="m12 4-8 8" />
    </>,
  )
}

/** 新建页签。 */
export function plusIcon(): React.ReactNode {
  return icon(
    <>
      <path d="M8 3v10" />
      <path d="M3 8h10" />
    </>,
  )
}

/** 更多操作。 */
export function kebabIcon(): React.ReactNode {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false" className="shrink-0">
      <circle cx="8" cy="3.2" r="1.1" />
      <circle cx="8" cy="8" r="1.1" />
      <circle cx="8" cy="12.8" r="1.1" />
    </svg>
  )
}

/** 最小化。 */
export function minimizeIcon(): React.ReactNode {
  return icon(<path d="M3.5 11.5h9" />)
}

/** 向上箭头；差异导航里表示上一处。 */
export function arrowUpIcon(): React.ReactNode {
  return icon(<path d="M8 13V3M4.5 6.5 8 3l3.5 3.5" />)
}

/** 向下箭头。 */
export function arrowDownIcon(): React.ReactNode {
  return icon(<path d="M8 3v10M4.5 9.5 8 13l3.5-3.5" />)
}

/** 向左箭头。 */
export function arrowLeftIcon(): React.ReactNode {
  return icon(<path d="M13 8H3M6.5 4.5 3 8l3.5 3.5" />)
}

/** 向右箭头。 */
export function arrowRightIcon(): React.ReactNode {
  return icon(<path d="M3 8h10M9.5 4.5 13 8l-3.5 3.5" />)
}

/** 编辑（在编辑器中打开）。 */
export function pencilIcon(): React.ReactNode {
  return icon(
    <>
      <path d="M11.3 2.7a1.4 1.4 0 0 1 2 2L5.6 12.4l-3 .7.7-3z" />
      <path d="m10 4 2 2" />
    </>,
  )
}

/** 设置。 */
export function gearIcon(): React.ReactNode {
  return icon(
    <>
      <path d="M6.5 2.1h3l.35 1.6.8.47 1.5-.75 2.12 2.12-.75 1.5.47.8 1.6.35v3l-1.6.35-.47.8.75 1.5-2.12 2.12-1.5-.75-.8.47-.35 1.6h-3l-.35-1.6-.8-.47-1.5.75L2.23 12.7l.75-1.5-.47-.8-1.6-.35v-3l1.6-.35.47-.8-.75-1.5L4.35 2.28l1.5.75.8-.47z" />
      <circle cx="8" cy="8" r="1.9" />
    </>,
  )
}

/** 差异标题前的文件锁标记。 */
export function lockIcon(): React.ReactNode {
  return icon(
    <>
      <rect x="3.4" y="7" width="9.2" height="6.4" rx="1" />
      <path d="M5.6 7V5.4a2.4 2.4 0 0 1 4.8 0V7" />
    </>,
  )
}

/** 分支图标：提交节点与连线。 */
export function branchIcon(): React.ReactNode {
  return icon(
    <>
      <circle cx="5" cy="3.4" r="1.5" />
      <circle cx="5" cy="12.6" r="1.5" />
      <circle cx="11.2" cy="6.4" r="1.5" />
      <path d="M5 4.9v6.2M11.2 7.9c0 2.2-1.7 3.5-4 3.5H6.5" />
    </>,
  )
}

/** 文件夹。 */
export function folderIcon(open = false): React.ReactNode {
  return icon(
    open ? (
      <>
        <path d="M1.8 12.6V4.2h4l1.3 1.5h7.1v1.1" />
        <path d="M1.8 12.6 3.5 7h11l-1.7 5.6z" />
      </>
    ) : (
      <path d="M1.8 12.6V4.2h4l1.3 1.5h7.1v6.9z" />
    ),
  )
}

/** 眼睛：切换文件树显示。 */
export function eyeIcon(): React.ReactNode {
  return icon(
    <>
      <path d="M1.5 8S4 3.8 8 3.8 14.5 8 14.5 8 12 12.2 8 12.2 1.5 8 1.5 8Z" />
      <circle cx="8" cy="8" r="1.7" />
    </>,
  )
}

/** 时钟：显示时间信息。 */
export function clockIcon(): React.ReactNode {
  return icon(
    <>
      <circle cx="8" cy="8" r="5.8" />
      <path d="M8 4.6V8l2.4 1.4" />
    </>,
  )
}

/** 排序：上下箭头。 */
export function sortIcon(): React.ReactNode {
  return icon(
    <>
      <path d="M5 3v10M2.8 10.8 5 13l2.2-2.2" />
      <path d="M11 13V3M8.8 5.2 11 3l2.2 2.2" />
    </>,
  )
}

/** 搜索放大镜。 */
export function searchIcon(): React.ReactNode {
  return icon(
    <>
      <circle cx="7" cy="7" r="4.2" />
      <path d="m10.2 10.2 3 3" />
    </>,
  )
}

/** 星标：远程 HEAD 分支。 */
export function starIcon(): React.ReactNode {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false" className="shrink-0">
      <path d="m8 1.8 1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z" />
    </svg>
  )
}

/** 双向箭头：显示/对比差异。 */
export function diffIcon(): React.ReactNode {
  return icon(
    <>
      <path d="M2.5 5.6h9.6M9.6 3.2 12 5.6l-2.4 2.4" />
      <path d="M13.5 10.4H3.9M6.4 8 4 10.4l2.4 2.4" />
    </>,
  )
}

/** 逆时针箭头：回滚改动。 */
export function rollbackIcon(): React.ReactNode {
  return icon(
    <>
      <path d="M3.2 8a4.8 4.8 0 1 0 1.6-3.6" />
      <path d="M2.6 3.4v3.4h3.4" />
    </>,
  )
}

/** 向下入线：搁置改动。 */
export function stashIcon(): React.ReactNode {
  return icon(
    <>
      <path d="M8 2.2v7.4M4.9 6.7 8 9.8l3.1-3.1" />
      <path d="M3 13.4h10" />
    </>,
  )
}

/** 向上出线：恢复搁置的改动。 */
export function unstashIcon(): React.ReactNode {
  return icon(
    <>
      <path d="M8 9.8V2.4M4.9 5.5 8 2.4l3.1 3.1" />
      <path d="M3 13.4h10" />
    </>,
  )
}

/** 列表：提交选项与分组。 */
export function listIcon(): React.ReactNode {
  return icon(
    <>
      <path d="M6 4.2h7.4M6 8h7.4M6 11.8h7.4" />
      <path d="M2.6 4.2h.9M2.6 8h.9M2.6 11.8h.9" />
    </>,
  )
}

/** 斜向箭头：检出分支。 */
export function checkoutIcon(): React.ReactNode {
  return icon(
    <>
      <path d="M12.4 3.6 4.2 11.8" />
      <path d="M4.2 6.6v5.2h5.2" />
    </>,
  )
}

/** 垃圾桶：删除。 */
export function trashIcon(): React.ReactNode {
  return icon(
    <>
      <path d="M2.8 4.4h10.4M6 4.4V2.8h4v1.6" />
      <path d="M4.4 4.4 5 13.4h6l.6-9" />
      <path d="M6.6 6.8v4.2M9.4 6.8v4.2" />
    </>,
  )
}

/** 漏斗：过滤。 */
export function filterIcon(): React.ReactNode {
  return icon(
    <>
      <path d="M2.6 3.6h10.8L9.2 8.4v4.6L6.8 12V8.4Z" />
    </>,
  )
}

/** 双向向下箭头：滚动到末尾。 */
export function scrollEndIcon(): React.ReactNode {
  return icon(
    <>
      <path d="M8 2.4v6.2M5.2 6 8 8.8 10.8 6" />
      <path d="M8 8.4v3.2M5.2 9.2 8 12l2.8-2.8" />
    </>,
  )
}

/** 左尖括号：返回上一步。 */
export function backIcon(): React.ReactNode {
  return icon(<path d="M10 3.2 5.2 8l4.8 4.8" />)
}

/** 文件类型到图标色调的映射；只用于快速辨认，不做精确语言配色。 */
const FILE_TONES: Record<string, string> = {
  json: 'text-info',
  js: 'text-warn',
  jsx: 'text-warn',
  ts: 'text-info',
  tsx: 'text-info',
  mjs: 'text-warn',
  cjs: 'text-warn',
  css: 'text-info',
  scss: 'text-info',
  html: 'text-danger',
  md: 'text-secondary',
  yml: 'text-success',
  yaml: 'text-success',
  toml: 'text-success',
  sh: 'text-success',
  py: 'text-info',
  go: 'text-info',
  rs: 'text-danger',
  java: 'text-danger',
  kt: 'text-danger',
}

/**
 * 按扩展名取文件图标。
 * @param path 文件路径
 * @param size 渲染尺寸
 * @returns 带色调的页面图标
 */
export function fileIcon(path: string, size = 14): React.ReactNode {
  const name = path.slice(path.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
  const tone = FILE_TONES[ext] ?? 'text-secondary'
  const json = ext === 'json'

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cn('shrink-0', tone)}
    >
      <path d="M3.6 1.8h5.2l3.6 3.6v8.8H3.6z" />
      <path d="M8.8 1.8v3.6h3.6" />
      {/* JSON 文件用大括号标记，和普通文本文件区分开 */}
      {json && <path d="M6.6 8c-.7 0-.7 1-.7 1s0 1-.7 1c.7 0 .7 1 .7 1M9.4 8c.7 0 .7 1 .7 1s0 1 .7 1c-.7 0-.7 1-.7 1" strokeWidth="0.9" />}
    </svg>
  )
}
