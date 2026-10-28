/**
 * 项目树用到的图标渲染函数。
 *
 * 全部使用 currentColor 与宿主主题令牌类名，不写死颜色；SVG 随按钮文字一起继承
 * 明暗主题。这里导出的是返回 ReactNode 的渲染函数而不是组件，避免为每个 12px 图标
 * 单独建立组件文件。
 */
import React from 'react'

import { cn } from '../../../common/cn'

/** 扩展名到文字颜色的映射；只做快速区分，不追求语言图标的精确配色。 */
const EXTENSION_TONES: Record<string, string> = {
  ts: 'text-info',
  tsx: 'text-info',
  js: 'text-info',
  jsx: 'text-info',
  mjs: 'text-info',
  cjs: 'text-info',
  json: 'text-success',
  yml: 'text-success',
  yaml: 'text-success',
  toml: 'text-success',
  ini: 'text-success',
  conf: 'text-success',
  css: 'text-info',
  scss: 'text-info',
  sass: 'text-info',
  less: 'text-info',
  html: 'text-danger',
  htm: 'text-danger',
  vue: 'text-danger',
  svelte: 'text-danger',
  md: 'text-secondary',
  mdx: 'text-secondary',
  txt: 'text-secondary',
  sh: 'text-success',
  bash: 'text-success',
  zsh: 'text-success',
  py: 'text-info',
  go: 'text-info',
  rs: 'text-danger',
  java: 'text-danger',
  kt: 'text-danger',
  c: 'text-info',
  h: 'text-info',
  cpp: 'text-info',
  cs: 'text-info',
  rb: 'text-danger',
  php: 'text-danger',
  png: 'text-warn',
  jpg: 'text-warn',
  jpeg: 'text-warn',
  gif: 'text-warn',
  webp: 'text-warn',
  svg: 'text-warn',
  ico: 'text-warn',
  lock: 'text-secondary',
}

/**
 * 取出文件扩展名。
 * @param name 文件名
 * @returns 小写扩展名；没有扩展名时为空串
 */
function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')

  // 点开头的文件（.gitignore）整体算隐藏文件，不把后缀当成类型
  if (dot <= 0 || dot === name.length - 1) return ''

  return name.slice(dot + 1).toLowerCase()
}

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
 * 文件行的类型角标。
 * @param name 文件名；据此取扩展名决定颜色与文字
 * @returns 扩展名角标；无扩展名时返回一个占位点
 */
export function fileBadge(name: string): React.ReactNode {
  const extension = extensionOf(name)

  if (extension === '') {
    return (
      <span
        className="flex h-4 w-4 shrink-0 items-center justify-center text-[10px] text-secondary"
        aria-hidden="true"
      >
        ·
      </span>
    )
  }

  return (
    <span
      className={cn(
        'flex h-4 w-4 shrink-0 items-center justify-center font-mono text-[9px] font-semibold uppercase leading-none',
        EXTENSION_TONES[extension] ?? 'text-secondary',
      )}
      aria-hidden="true"
    >
      {extension.slice(0, 3)}
    </span>
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
 * 工具栏全部折叠图标。
 * @returns 向内收拢的双箭头
 */
export function collapseAllIcon(): React.ReactNode {
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
 * 工具栏隐藏文件开关图标。
 * @param visible 当前是否显示隐藏文件
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
