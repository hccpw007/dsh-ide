/**
 * 冲突解决界面的图标。
 *
 * 与 Git 面板同一套风格：16×16 的 currentColor 线性图标，不依赖宿主图标集。
 * 通用的箭头、眼睛、齿轮直接复用 git 的导出，这里只画冲突窗口特有的那几枚。
 */
import React from 'react'

/**
 * 生成一个 16×16 的线性图标容器。
 * @param children 图形
 * @param size 渲染尺寸
 * @param strokeWidth 线条粗细
 * @returns SVG 节点
 */
function icon(children: React.ReactNode, size = 15, strokeWidth = 1.25): React.ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
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

/** 冲突标记：红色的叉，用在「未解决」分组标题上。 */
export function conflictMarkIcon(size = 14): React.ReactNode {
  return icon(
    <>
      <path d="M4 4l8 8M12 4l-8 8" />
    </>,
    size,
    1.5,
  )
}

/** 已解决标记：绿色的对勾，用在「已解决」分组标题上。 */
export function resolvedMarkIcon(size = 14): React.ReactNode {
  return icon(<path d="M3.5 8.4 6.4 11.3 12.5 5" />, size, 1.5)
}

/** 魔术棒：Resolve All Simple Conflicts（自动解决不需要人判断的冲突块）。 */
export function magicWandIcon(size = 15): React.ReactNode {
  return icon(
    <>
      <path d="M7.2 8.8 13 3" />
      <path d="M5.6 3.2v2.4M4.4 4.4h2.4M11.2 9.6v2M10.2 10.6h2" />
      <path d="M7.2 8.8 4.4 13.4" strokeWidth="1.6" />
    </>,
    size,
  )
}

/** 接受我方：右向双箭头贴着一道竖线，与 IDEA 合并工具栏的 Accept Left 一致。 */
export function acceptLeftIcon(size = 15): React.ReactNode {
  return icon(
    <>
      <path d="M2.6 4.6v6.8" />
      <path d="M5.2 8h7.2M9.8 5.4 12.4 8l-2.6 2.6" />
    </>,
    size,
  )
}

/** 接受对方：左向双箭头贴着一道竖线，与 Accept Right 一致。 */
export function acceptRightIcon(size = 15): React.ReactNode {
  return icon(
    <>
      <path d="M13.4 4.6v6.8" />
      <path d="M10.8 8H3.6M6.2 5.4 3.6 8l2.6 2.6" />
    </>,
    size,
  )
}

/** 文件行上的修改标记：字母 M 加一个向下的短箭头，与 IDEA 的文件状态徽标高一致。 */
export function modifiedBadgeIcon(): React.ReactNode {
  return (
    <span aria-hidden="true" className="flex shrink-0 items-center text-[11px] font-semibold leading-none">
      <span>M</span>

      <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
        <path d="M5 1.6v6M2.6 5.2 5 7.6l2.4-2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}
