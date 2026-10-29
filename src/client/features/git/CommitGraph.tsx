/**
 * 提交列表左侧的分支图列。
 *
 * 只画图不画字：整列是一张绝对定位的 SVG，铺在提交行背后，行与行之间共享同一套
 * 坐标，连线才能跨行首尾相接。提交列表按这里导出的行高/列宽留出占位，两边不
 * 各自写一份数字，避免图与列表错行。
 */
import React from 'react'

import type { GraphLayout } from './graph-layout'

/** 提交行高；连线按它折算像素坐标。 */
export const COMMIT_ROW_HEIGHT = 22

/** 泳道宽度；比行高窄一些，整列宽度更紧凑，折线略陡于 45°。 */
export const GRAPH_LANE_WIDTH = 16

/** 节点半径。 */
const NODE_RADIUS = 4

/** 连线宽度。 */
const LINE_WIDTH = 1.6

/** 节点描边宽度。 */
const NODE_STROKE_WIDTH = 1.8

/**
 * 分支图最多占用的列数。
 *
 * 提交历史再乱也只占这么多列：超出的泳道共享最右一列，图形宽度因此有上限，
 * 提交标题永远有位置可放（参考 dsh-ide-git 的做法）。
 */
export const GRAPH_MAX_LANES = 7

/**
 * 配色类：按泳道序号取色，顺序与 graph-layout 的配色序号一致。
 *
 * 用宿主主题令牌（success/info/warn/danger）而不是字面色值，明暗主题自动跟随；
 * 深色主题下这四色即绿、蓝、黄、红，与 IDEA 分支图的观感一致。
 */
const TONE_CLASSES = ['text-success', 'text-info', 'text-warn', 'text-danger'] as const

/** 分支图 props。 */
export interface CommitGraphProps {
  /** 布局结果。 */
  layout: GraphLayout
  /** 需要画成实心节点的行号；普通提交画空心环。 */
  solidRows: ReadonlySet<number>
}

/**
 * 渲染分支图。
 * @param props 见 CommitGraphProps
 * @returns 覆盖在提交行背后的 SVG
 */
export function CommitGraph({ layout, solidRows }: CommitGraphProps): React.ReactElement {
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
        const nodeColor = TONE_CLASSES[row.tone % TONE_CLASSES.length]

        return (
          <g key={index}>
            {row.lines.map((line, lineIndex) => (
              <line
                key={lineIndex}
                x1={centerX(line.fromLane)}
                y1={rowTop + line.fromRatio * COMMIT_ROW_HEIGHT}
                x2={centerX(line.toLane)}
                y2={rowTop + line.toRatio * COMMIT_ROW_HEIGHT}
                stroke="currentColor"
                strokeWidth={LINE_WIDTH}
                strokeLinecap="round"
                className={TONE_CLASSES[line.tone % TONE_CLASSES.length]}
              />
            ))}

            {/* 节点空心环用列表底色填充，连线不会从圆点里穿出来 */}
            <circle
              cx={centerX(row.lane)}
              cy={rowTop + COMMIT_ROW_HEIGHT / 2}
              r={NODE_RADIUS}
              stroke="currentColor"
              strokeWidth={NODE_STROKE_WIDTH}
              fill={solidRows.has(index) ? 'currentColor' : 'var(--dsw-alias-bg-base)'}
              className={nodeColor}
            />
          </g>
        )
      })}
    </svg>
  )
}
