/**
 * Git 语义图标。
 *
 * 分支、标签、推拉、检出、回滚、搁置、差异这类与 Git 概念绑定的图标；界面控件
 * 图标见 icons-ui。全部是 currentColor 的纯 SVG，颜色随按钮继承主题。
 */
import React from 'react'

import { cn } from '../../../common/cn'

import { icon } from './icons-base'

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

/** 分支图标：提交节点与连线。 */
export function branchIcon(size = 15, strokeWidth = 1.25): React.ReactNode {
  return icon(
    <>
      <circle cx="5" cy="3.4" r="1.5" />
      <circle cx="5" cy="12.6" r="1.5" />
      <circle cx="11.2" cy="6.4" r="1.5" />
      <path d="M5 4.9v6.2M11.2 7.9c0 2.2-1.7 3.5-4 3.5H6.5" />
    </>,
    size,
    strokeWidth,
  )
}

/**
 * 本地分支的标签标记：IDEA 用斜置的黄色标签区分本地分支。
 *
 * 形状按 IDEA 的 tag 图标复刻：右上直角头（开圆孔）+ 两条 45° 长边收成尖尾。
 * 用描边而非实心填充，并且拐角走 miter，才能保留参考图上的尖角。
 */
export function bookmarkIcon(): React.ReactNode {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
    >
      <path d="M8.63 1.2H14.8V6.95L7.05 14.8L1.2 8.63Z" />
      <circle cx="10.88" cy="4.85" r="1.32" />
    </svg>
  )
}

/**
 * 收藏星标：左侧分支树与被收藏的引用旁使用。
 * @param className 附加类名；下拉菜单里的收藏项传 `text-warn` 画成黄色，与树里一致
 * @returns 实心星标节点
 */
export function starIcon(className = ''): React.ReactNode {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={cn('shrink-0', className)}
    >
      <path d="m8 1.8 1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z" />
    </svg>
  )
}

/** 复制版本号：两层叠放的方框，与 IDEA 的 Copy Revision Number 同一造型。 */
export function copyRevisionIcon(): React.ReactNode {
  return icon(
    <>
      <rect x="5.6" y="2.6" width="7.8" height="7.8" rx="1.2" />
      <path d="M10.4 12.2v.6a1.2 1.2 0 0 1-1.2 1.2H3.8a1.2 1.2 0 0 1-1.2-1.2V6.8a1.2 1.2 0 0 1 1.2-1.2h.6" />
    </>,
  )
}

/** 创建补丁：带十字的方形补丁。 */
export function createPatchIcon(): React.ReactNode {
  return icon(
    <>
      <rect x="2.6" y="2.6" width="10.8" height="10.8" rx="2.2" />
      <path d="M8 5.4v5.2M5.4 8h5.2" />
    </>,
  )
}

/** 拉取：虚线斜箭头，IDEA 用虚线表示「只取回不合并」。 */
export function fetchIcon(): React.ReactNode {
  return icon(
    <>
      <path d="M12.8 3.2 7 9" strokeDasharray="1.9 1.7" />
      <path d="M3.6 8.4v4.2h4.2" />
    </>,
  )
}

/** 更新工程：斜向左下的箭头；分支名旁的同步标记用小一号尺寸。 */
export function updateIcon(size = 15, strokeWidth = 1.25): React.ReactNode {
  return icon(
    <>
      <path d="M12.6 3.4 3.6 12.4" />
      <path d="M3.2 7.6v5.2h5.2" />
    </>,
    size,
    strokeWidth,
  )
}

/** 推送：斜向右上的箭头；分支名旁的同步标记用小一号尺寸。 */
export function pushIcon(size = 15, strokeWidth = 1.25): React.ReactNode {
  return icon(
    <>
      <path d="M3.4 12.6 12.4 3.6" />
      <path d="M7.6 3.2h5.2v5.2" />
    </>,
    size,
    strokeWidth,
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

/** 回滚：左向箭头接一条绕回原处的弧线，与 IDEA 的 Rollback 图标一致。 */
export function rollbackIcon(): React.ReactNode {
  return icon(
    <>
      <path d="M10.2 5.2H4.8" />
      <path d="m7.6 2.6-2.8 2.6 2.8 2.6" />
      <path d="M10.2 5.2a3.2 3.2 0 0 1 0 6.4H4.4" />
    </>,
  )
}

/**
 * 回退箭头：上边一行箭头朝左，右端向下绕成半圆、底部折回，形状同 IDEA 的撤销。
 * @param size 渲染尺寸
 */
export function undoArrowIcon(size = 14): React.ReactNode {
  return icon(
    <>
      <path d="M11 5H4" />
      <path d="M6.6 2.4 4 5l2.6 2.6" />
      <path d="M11 5a3 3 0 0 1 0 6H4.4" />
    </>,
    size,
  )
}

/** 搁置改动：向下箭头落入托盘，与 IDEA 的 Shelve Changes 图标一致。 */
export function stashIcon(): React.ReactNode {
  return icon(
    <>
      <path d="M8 2.2v7.4" />
      <path d="M5.4 7 8 9.6 10.6 7" />
      <path d="M2.5 9.4h2.6l1 1.8h3.8l1-1.8h2.6V14H2.5z" />
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

/** 从栈顶取出：托盘在上，箭头向上穿出，区别于恢复但保留记录的 unstash。 */
export function popStashIcon(): React.ReactNode {
  return icon(
    <>
      <path d="M3 2.6h10" />
      <path d="M8 13.6V6.2M4.9 9.3 8 6.2l3.1 3.1" />
    </>,
  )
}

/**
 * 双向箭头：显示/对比差异。
 * @param size 渲染尺寸
 */
export function diffIcon(size = 15): React.ReactNode {
  return icon(
    <>
      <path d="M2.5 5.6h9.6M9.6 3.2 12 5.6l-2.4 2.4" />
      <path d="M13.5 10.4H3.9M6.4 8 4 10.4l2.4 2.4" />
    </>,
    size,
  )
}

/** 提交节点与两侧连线：Commit 动作（提交弹窗入口）。 */
export function nodeLineIcon(): React.ReactNode {
  return icon(
    <>
      <circle cx="8" cy="8" r="2.1" />
      <path d="M1.6 8h4.3M10.1 8h4.3" />
    </>,
  )
}

/**
 * 在 Log 页签中定位：提交节点与日志行。
 * @param size 渲染尺寸
 */
export function showInLogIcon(size = 15): React.ReactNode {
  return icon(
    <>
      <circle cx="4.6" cy="4.4" r="1.5" />
      <path d="M4.6 5.9v5.7M4.6 11.6h3.4" />
      <path d="M10.6 4.4h3M10.6 11.6h1.4" />
      <circle cx="12.4" cy="11.6" r="1.3" />
    </>,
    size,
  )
}

/**
 * 提交行右侧的引用标签图标。
 *
 * 形状按 IDEA 的 refs 书签复刻：左端收成尖角，上边斜向右上顶部的尖，右侧是
 * 带直角短边的方形端，下边斜向底部尖，右上留出吊牌孔。图形几乎占满 16 格
 * （宽高比接近 IDEA 的单枚书签），用 round 连接让小尺寸下的尖角仍有圆润观感；
 * 颜色由调用方的 text-* 决定。
 * @param size 渲染尺寸
 * @param filled 是否用所在行背景色填充图形内部：图标簇叠放时必须填充，让后面的
 *   图标盖住前面图标的线条；单枚展示（悬停提示）时保持中空
 */
export function refTagIcon(size = 14, filled = true): React.ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
    >
      {/* 内部填充行背景色：叠放时用它遮挡下层图标的轮廓，与 IDEA 的图标簇一致 */}
      <path d="M1.1 9.2 9.3 1.1 14 1.9 14.7 7 6.8 14.9z" fill={filled ? 'var(--ide-ref-fill, transparent)' : 'none'} />
      {/* 吊牌孔：实心彩色圆点 */}
      <circle cx="11.1" cy="4.9" r=".6" fill="currentColor" />
    </svg>
  )
}
