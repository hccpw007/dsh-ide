/**
 * Git 面板图标的公共 SVG 容器。
 *
 * 界面控件图标与 Git 语义图标分成两个模块，都要用这个 16×16 的线性容器；
 * 容器单独成文件，两侧才不会为了共用它而互相依赖对方的图标集合。
 */
import React from 'react'

/**
 * 生成一个 16×16 的线性图标容器。
 * @param children 图形
 * @param size 渲染尺寸
 * @param strokeWidth 线条粗细；小尺寸图标可适当加粗保证观感
 * @returns SVG 节点
 */
export function icon(children: React.ReactNode, size = 15, strokeWidth = 1.25): React.ReactNode {
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
