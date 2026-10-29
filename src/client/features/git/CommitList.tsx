/**
 * Log 页签中部的提交列表。
 *
 * 一行一提交：分支图、标题、引用标签、作者、日期与短 hash。左侧分支图是一整列
 * SVG（见 CommitGraph），行内只留占位宽度。列宽固定，标题独占剩余空间，长标题
 * 被截断而不是把作者/hash 挤掉。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { cn } from '../../../common/cn'
import type { Translate } from '../../../types/plugin'

import type { GitCommit } from './api'
import { COMMIT_ROW_HEIGHT, CommitGraph, GRAPH_LANE_WIDTH, GRAPH_MAX_LANES } from './CommitGraph'
import { buildGraphLayout, flipGraphLayout } from './graph-layout'

/** 提交列表 props。 */
export interface CommitListProps {
  /** 已绑定 git 前缀的翻译函数。 */
  t: Translate
  /** 已加载的提交，顺序即展示顺序。 */
  commits: GitCommit[]
  /** 当前选中的提交 hash。 */
  selectedHash: string
  /** 选中提交。 */
  onSelect(commit: GitCommit): void
  /** 右键提交。 */
  onContextMenu(event: React.MouseEvent, commit: GitCommit): void
  /** 是否显示日期列。 */
  showDates: boolean
  /** 是否按时间升序展示；分支图需要据此翻折。 */
  ascending: boolean
  /** 滚动到底部时请求加载更旧的提交。 */
  onLoadMore(): void
}

/** 距离底部多少像素时开始加载下一批提交。 */
const LOAD_MORE_THRESHOLD = 120

/** 可见范围上下各多算多少行，滚动时线不会在边缘突然出现或消失。 */
const WINDOW_BUFFER_ROWS = 6

/** 一屏最多按多少行算布局；取不到容器高度时用它兜底。 */
const DEFAULT_WINDOW_ROWS = 40

/**
 * 格式化提交时间。
 *
 * 最近一分钟显示 just now，最近一小时显示相对分钟，当天显示 Today HH:mm，
 * 其余显示 YYYY/MM/DD；与 IDEA 的时间列口径一致。
 * @param iso ISO 时间
 * @returns 展示文本
 */
export function formatCommitDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''

  const now = new Date()
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)
  const pad = (value: number): string => String(value).padStart(2, '0')
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`

  if (seconds >= 0 && seconds < 60) return 'just now'
  if (seconds >= 60 && seconds < 3600) return `${String(Math.floor(seconds / 60))} minutes ago`

  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()

  if (sameDay) return `Today ${time}`

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()

  if (isYesterday) return `Yesterday ${time}`

  return `${String(date.getFullYear())}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`
}

/**
 * 渲染提交列表。
 * @param props 见 CommitListProps
 * @returns 提交行
 */
export function CommitList({
  t,
  commits,
  selectedHash,
  onSelect,
  onContextMenu,
  showDates,
  ascending,
  onLoadMore,
}: CommitListProps): React.ReactElement {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [window_, setWindow] = useState({ start: 0, end: DEFAULT_WINDOW_ROWS })

  /**
   * 重算可见范围。
   *
   * 分支图只画可见的这段提交：把整段历史都算进布局时，列数会按最深处的分叉
   * 一路涨到几十列，图列被撑到几百像素，标题列反而被挤没。IDEA 的 Git 图同
   * 样只在可见范围内绘制。
   */
  const updateWindow = useCallback((): void => {
    const element = scrollRef.current
    if (element === null) return

    const rowsInView = Math.max(Math.ceil(element.clientHeight / COMMIT_ROW_HEIGHT), DEFAULT_WINDOW_ROWS)
    // 按整屏分块重算：块内滚动时布局不变，图不会每滚一像素就重排一次
    const blockStart = Math.floor(element.scrollTop / (rowsInView * COMMIT_ROW_HEIGHT)) * rowsInView
    const start = Math.max(0, blockStart - WINDOW_BUFFER_ROWS)
    const end = Math.min(commits.length, blockStart + rowsInView + WINDOW_BUFFER_ROWS * 2)

    setWindow((previous) => (previous.start === start && previous.end === end ? previous : { start, end }))
  }, [commits.length])

  useEffect(() => {
    updateWindow()
  }, [updateWindow])

  /**
   * 滚动时更新可见范围，接近底部时继续加载。
   * @param event 滚动事件
   */
  const handleScroll = (event: React.UIEvent<HTMLDivElement>): void => {
    const element = event.currentTarget
    updateWindow()
    if (element.scrollHeight - element.scrollTop - element.clientHeight < LOAD_MORE_THRESHOLD) onLoadMore()
  }

  // 拓扑一律按新 → 旧计算，升序展示时再把算好的行序与行内折角翻过来
  const layout = useMemo(() => {
    const slice = commits.slice(window_.start, window_.end)
    const base = buildGraphLayout(ascending ? [...slice].reverse() : slice)

    return ascending ? flipGraphLayout(base) : base
  }, [ascending, commits, window_])

  /** 画成实心节点的行：选中提交，与列表高亮行同源；换算成可见范围内的相对行号。 */
  const solidRows = useMemo(() => {
    const index = commits.findIndex((commit) => commit.hash === selectedHash)

    return new Set(index < window_.start || index >= window_.end ? [] : [index - window_.start])
  }, [commits, selectedHash, window_])

  /** 分支图列的宽度；封顶后每行留出的宽度一致，滚动时标题不会左右跳。 */
  const graphWidth = Math.min(layout.laneCount, GRAPH_MAX_LANES) * GRAPH_LANE_WIDTH

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto" onScroll={handleScroll}>
      <div className="relative">
        <CommitGraph layout={layout} solidRows={solidRows} top={window_.start * COMMIT_ROW_HEIGHT} />

        {commits.map((commit) => (
          <button
            key={commit.hash}
            type="button"
            onClick={() => onSelect(commit)}
            onDoubleClick={() => onSelect(commit)}
            onContextMenu={(event) => onContextMenu(event, commit)}
            style={{ height: COMMIT_ROW_HEIGHT }}
            className={cn(
              'flex w-full items-center gap-1.5 pr-2 text-left text-xs transition-colors',
              selectedHash === commit.hash ? 'bg-info/25 text-primary' : 'text-primary hover:bg-layer2/60',
            )}
          >
            {/* 分支图占位：图本身画在背后的整列 SVG 上 */}
            <span className="shrink-0" style={{ width: graphWidth }} />

            {/* 提交标题 */}
            <span className="min-w-0 flex-1 truncate">{commit.subject}</span>

            {/* 引用标签：本地分支绿色、远程分支琥珀色，与分支树呼应 */}
            {commit.refs.length > 0 && (
              <span className="flex max-w-[240px] shrink-0 items-center gap-1 overflow-hidden">
                {commit.refs.slice(0, 4).map((ref) => {
                  const remote = ref.includes('/')

                  return (
                    <span
                      key={ref}
                      title={ref}
                      className={cn(
                        'max-w-[120px] truncate rounded-[3px] border px-1 text-[10px] leading-[14px]',
                        remote ? 'border-warn/50 text-warn' : 'border-success/50 text-success',
                      )}
                    >
                      {ref}
                    </span>
                  )
                })}
              </span>
            )}

            {/* 作者 */}
            <span className="w-[80px] shrink-0 truncate text-[11px] text-secondary">{commit.author}</span>

            {/* 日期 */}
            {showDates && (
              <span className="w-[104px] shrink-0 truncate text-[11px] text-secondary">
                {formatCommitDate(commit.date)}
              </span>
            )}

            {/* 短 hash */}
            <span className="w-[62px] shrink-0 truncate font-mono text-[11px] text-secondary">{commit.shortHash}</span>
          </button>
        ))}
      </div>

      {commits.length === 0 && <div className="px-3 py-3 text-xs text-secondary">{t('noCommits')}</div>}
    </div>
  )
}
