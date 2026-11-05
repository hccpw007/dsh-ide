/**
 * 提交列表左侧的分支图列。
 *
 * 只画图不画字：整列是一张绝对定位的 SVG，铺在提交行背后，行与行之间共享同一套
 * 坐标，连线才能跨行首尾相接。提交列表按这里导出的行高/列宽留出占位，两边不
 * 各自写一份数字，避免图与列表错行。
 *
 * 尺寸与配色取自 IDEA 的 vcs-log 实现（PaintParameters / HeadNodePainter /
 * DefaultColorGenerator）：行高 22、列宽 16、节点半径 4、线宽 1.5；普通提交是
 * 实心圆点，当前检出点画成 IDEA 的靶心（外环 + 背景间隙 + 中心点），颜色按色号
 * 经 HSB 重新着色，因此明暗主题下观感一致。
 */
import React from 'react'

import type { GraphLayout } from './graph-layout'

/** 提交行高；连线按它折算像素坐标。 */
export const COMMIT_ROW_HEIGHT = 22

/** 泳道宽度；与 IDEA 的节点元素宽一致。 */
export const GRAPH_LANE_WIDTH = 16

/** 节点半径；对应 IDEA 的 PaintParameters.CIRCLE_RADIUS。 */
const NODE_RADIUS = 4

/** 连线宽度；对应 IDEA 的 PaintParameters.THICK_LINE。 */
const LINE_WIDTH = 1.5

/** 选中提交的节点半径增量；对应 IDEA 选中时把圆放大一圈。 */
const SELECTED_NODE_DELTA = 0.5

/** HEAD 靶心的外圈半径；IDEA 的 HeadNodePainter 外径 12。 */
const HEAD_RADIUS = 6

/** 靶心的圈层厚度：外环、背景间隙、中心点各占 2px，与 IDEA 一致。 */
const HEAD_STEP = 2

/** 颜色里恒定的饱和度与亮度；IDEA 从主题读取的默认值。 */
const GRAPH_SATURATION = 0.4
const GRAPH_BRIGHTNESS = 0.65

/**
 * 分支图最多占用的列数。
 *
 * 提交历史再乱也只占这么多列：超出的泳道共享最右一列，图形宽度因此有上限，
 * 提交标题永远有位置可放。
 */
export const GRAPH_MAX_LANES = 7

/**
 * 泳道色号。
 *
 * 色号本身在 IDEA 里来自分支名 hash，这里按泳道顺序取一组偏绿、蓝、青、紫的
 * 色号，相邻泳道不会撞色，观感与 IDEA 的分支图一致。
 */
const LANE_COLOR_IDS = [8, 1, 4, 2, 5, 7, 3, 6]

/**
 * 把 RGB 折算成色相。
 * @param red 红色分量（0-255）
 * @param green 绿色分量（0-255）
 * @param blue 蓝色分量（0-255）
 * @returns 色相（0-1）
 */
function hueOf(red: number, green: number, blue: number): number {
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min

  if (delta === 0) return 0

  let hue: number

  if (max === red) hue = ((green - blue) / delta + 6) % 6
  else if (max === green) hue = (blue - red) / delta + 2
  else hue = (red - green) / delta + 4

  return hue / 6
}

/**
 * 把 HSB 转成 CSS 颜色。
 * @param hue 色相（0-1）
 * @param saturation 饱和度（0-1）
 * @param brightness 亮度（0-1）
 * @returns `#rrggbb`
 */
function hsbToColor(hue: number, saturation: number, brightness: number): string {
  const sector = hue * 6
  const chroma = brightness * saturation
  const second = chroma * (1 - Math.abs((sector % 2) - 1))
  const offset = brightness - chroma

  let red = 0
  let green = 0
  let blue = 0

  switch (Math.floor(sector) % 6) {
    case 0:
      red = chroma
      green = second
      break
    case 1:
      red = second
      green = chroma
      break
    case 2:
      green = chroma
      blue = second
      break
    case 3:
      green = second
      blue = chroma
      break
    case 4:
      red = second
      blue = chroma
      break
    default:
      red = chroma
      blue = second
  }

  /** 把 0-1 的分量转成两位十六进制。 */
  const channel = (value: number): string =>
    Math.round((value + offset) * 255)
      .toString(16)
      .padStart(2, '0')

  return `#${channel(red)}${channel(green)}${channel(blue)}`
}

/**
 * 计算分支图颜色。
 *
 * 与 IDEA 的 `DefaultColorGenerator.calcColor` 一致：色号先折算成 RGB，只取它的
 * 色相，再按固定的饱和度与亮度重新着色；乘法按 32 位整数溢出处理，与 JVM 一致。
 * @param colorId 色号；0 是 IDEA 的默认黑色
 * @returns CSS 颜色
 */
function graphColor(colorId: number): string {
  if (colorId === 0) return '#000000'

  /** 把溢出后的整数夹到 70-169，保证折算出的 RGB 分量可用。 */
  const fix = (value: number): number => Math.abs((value | 0) % 100) + 70
  const red = fix(Math.imul(colorId, 200) + 30)
  const green = fix(Math.imul(colorId, 130) + 50)
  const blue = fix(Math.imul(colorId, 90) + 100)

  return hsbToColor(hueOf(red, green, blue), GRAPH_SATURATION, GRAPH_BRIGHTNESS)
}

/** 泳道颜色缓存：色序取值有限，换算一次即可复用。 */
const laneColorCache = new Map<number, string>()

/**
 * 取泳道的颜色。
 *
 * 每行每条连线都调用一次；不缓存时同样的色序会被反复做一遍整数运算 +
 * HSB 转 RGB，几千行、上百条连线的图里就是几十万次重复计算。
 * @param tone 布局给出的泳道色序
 * @returns CSS 颜色
 */
function laneColor(tone: number): string {
  const cached = laneColorCache.get(tone)

  if (cached !== undefined) return cached

  const color = graphColor(LANE_COLOR_IDS[tone % LANE_COLOR_IDS.length] ?? 0)

  laneColorCache.set(tone, color)

  return color
}

/** 分支图 props。 */
export interface CommitGraphProps {
  /** 布局结果。 */
  layout: GraphLayout
  /** 需要画成实心节点的行号；普通提交画空心环。 */
  solidRows: ReadonlySet<number>
  /** 本地 HEAD 所在的行号；这些节点画成靶心，标出当前检出位置。 */
  headRows: ReadonlySet<number>
}

/**
 * 渲染分支图。
 * @param props 见 CommitGraphProps
 * @returns 覆盖在提交行背后的 SVG
 */
export function CommitGraph({ layout, solidRows, headRows }: CommitGraphProps): React.ReactElement {
  const width = Math.min(layout.laneCount, GRAPH_MAX_LANES) * GRAPH_LANE_WIDTH
  const height = layout.rows.length * COMMIT_ROW_HEIGHT

  /**
   * 列中心横坐标；超出上限的泳道一律落在最右一列。
   * @param lane 列号，可能是半列值（跨列连线的中点）
   * @returns 像素坐标
   */
  const centerX = (lane: number): number =>
    Math.min(lane, GRAPH_MAX_LANES - 1) * GRAPH_LANE_WIDTH + GRAPH_LANE_WIDTH / 2

  return (
    <svg
      className="pointer-events-none absolute left-0 top-0"
      width={width}
      height={height}
      fill="none"
      aria-hidden="true"
    >
      {layout.rows.map((row, index) => {
        const rowTop = index * COMMIT_ROW_HEIGHT
        const centerY = rowTop + COMMIT_ROW_HEIGHT / 2
        const color = laneColor(row.tone)

        return (
          <g key={index}>
            {row.lines.map((line, lineIndex) => (
              <line
                key={lineIndex}
                x1={centerX(line.fromLane)}
                y1={rowTop + line.fromRatio * COMMIT_ROW_HEIGHT}
                x2={centerX(line.toLane)}
                y2={rowTop + line.toRatio * COMMIT_ROW_HEIGHT}
                stroke={laneColor(line.tone)}
                strokeWidth={LINE_WIDTH}
                strokeLinecap="round"
              />
            ))}

            {/* HEAD 靶心：外环、背景间隙、中心点三层同心圆，与 IDEA 的 HeadNodePainter 一致 */}
            {headRows.has(index) && (
              <g>
                <circle cx={centerX(row.lane)} cy={centerY} r={HEAD_RADIUS} fill={color} />
                <circle
                  cx={centerX(row.lane)}
                  cy={centerY}
                  r={HEAD_RADIUS - HEAD_STEP}
                  fill="var(--dsw-alias-bg-base)"
                />
                <circle
                  cx={centerX(row.lane)}
                  cy={centerY}
                  r={HEAD_RADIUS - HEAD_STEP * 2}
                  fill={color}
                />
              </g>
            )}

            {/* 普通节点：实心圆点；选中的提交放大一点，与 IDEA 的选中态一致 */}
            {!headRows.has(index) && (
              <circle
                cx={centerX(row.lane)}
                cy={centerY}
                r={NODE_RADIUS + (solidRows.has(index) ? SELECTED_NODE_DELTA : 0)}
                fill={color}
              />
            )}
          </g>
        )
      })}
    </svg>
  )
}
