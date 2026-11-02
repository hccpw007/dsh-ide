/**
 * Log 页签中部的提交列表。
 *
 * 一行一提交：分支图、标题、引用标签、作者、日期与短 hash。左侧分支图是一整列
 * SVG（见 CommitGraph），行内只留占位宽度。作者列按内容宽度自适应、日期与 hash 列
 * 固定且收紧，三列挨在一起，标题独占剩余空间，长标题被截断而不是把作者/hash 挤掉；
 * 引用标签按 IDEA 的样式渲染（见 RefBadges）。
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'

import { cn } from '../../../common/cn'
import type { Translate } from '../../../types/plugin'

import type { GitCommit, GitRefs } from './api'
import { COMMIT_ROW_HEIGHT, CommitGraph, GRAPH_LANE_WIDTH, GRAPH_MAX_LANES } from './CommitGraph'
import { buildGraphLayout, flipGraphLayout } from './graph-layout'
import { REF_FILL_HOVER, REF_FILL_IDLE, REF_FILL_SELECTED, RefBadges, textWidth } from './RefBadges'
import { buildRefKindIndex } from './ref-badges-model'

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
  /** 当前检出提交的短 hash；空串表示游离 HEAD 或还没读到分支。 */
  headHash: string
  /** 分支树已读到的分支与标签；引用标签靠它判断每条引用是分支还是标签。 */
  knownRefs: GitRefs | null
  /** 滚动到底部时请求加载更旧的提交。 */
  onLoadMore(): void
  /**
   * 首屏提交是否已读完。
   *
   * 未读完时列表留空而不显示空态文案：首次渲染的提交数组必为空，空态若跟着渲染，
   * 打开面板的瞬间会先闪一句「无提交」再被真实数据顶掉。
   */
  loaded: boolean
}

/** 距离底部多少像素时开始加载下一批提交。 */
const LOAD_MORE_THRESHOLD = 120

/** 作者列最小宽度（px）：作者名很短时也留一点与日期列之间的间距。 */
const AUTHOR_MIN_WIDTH = 44

/** 作者列最大宽度（px）：作者名过长时封顶，超出部分截断，免得挤占标题区。 */
const AUTHOR_MAX_WIDTH = 76

/** 作者列的字体大小（px），与行内 `text-[11px]` 一致；列宽按它测量。 */
const AUTHOR_FONT_SIZE = 11

/** 日期列宽（px）；关闭日期列时不算这一段的宽度。 */
const DATE_WIDTH = 92

/** 短 hash 列宽（px）；8 位等宽字符在 11px 下的宽度再留 3px 余量。 */
const HASH_WIDTH = 56

/** 行内元素间距（px），与行容器的 `gap-1.5` 一致。 */
const ROW_GAP = 6

/** 行右内边距（px），与行容器的 `pr-2` 一致。 */
const ROW_PADDING_RIGHT = 8


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
  headHash,
  knownRefs,
  onLoadMore,
  loaded,
}: CommitListProps): React.ReactElement {
  /** 列表滚动容器与选中行：选中变化后要把选中行带进可视区。 */
  const containerRef = useRef<HTMLDivElement>(null)
  const selectedRowRef = useRef<HTMLButtonElement>(null)

  // 从历史页签跳转过来时，选中的提交可能在可视区外；只滚动列表自身，
  // 不用 scrollIntoView —— 它会把外层的宿主会话区一起滚动
  useEffect(() => {
    const container = containerRef.current
    const row = selectedRowRef.current
    if (container === null || row === null) return

    const containerRect = container.getBoundingClientRect()
    const rowRect = row.getBoundingClientRect()

    if (rowRect.top < containerRect.top) container.scrollTop -= containerRect.top - rowRect.top
    else if (rowRect.bottom > containerRect.bottom) container.scrollTop += rowRect.bottom - containerRect.bottom
  }, [selectedHash])

  /**
   * 滚到接近底部时继续加载更旧的提交。
   * @param event 滚动事件
   */
  const handleScroll = (event: React.UIEvent<HTMLDivElement>): void => {
    const element = event.currentTarget
    if (element.scrollHeight - element.scrollTop - element.clientHeight < LOAD_MORE_THRESHOLD) onLoadMore()
  }

  // 拓扑一律按新 → 旧计算，升序展示时再把算好的行序与行内折角翻过来
  const layout = useMemo(() => {
    const base = buildGraphLayout(ascending ? [...commits].reverse() : commits)

    return ascending ? flipGraphLayout(base) : base
  }, [ascending, commits])

  /** 画成实心节点的行：选中提交，与列表高亮行同源。 */
  const solidRows = useMemo(() => {
    const index = commits.findIndex((commit) => commit.hash === selectedHash)

    return new Set(index === -1 ? [] : [index])
  }, [commits, selectedHash])

  /** 本地 HEAD 所在的行：图上要单独圈出来，否则看不出当前检出的是哪一条历史。 */
  const headRows = useMemo(() => {
    if (headHash === '') return new Set<number>()

    const index = commits.findIndex((commit) => commit.shortHash === headHash)

    return new Set(index === -1 ? [] : [index])
  }, [commits, headHash])

  /** 分支图列的宽度；封顶后无论历史多乱，标题列都有位置。 */
  const graphWidth = Math.min(layout.laneCount, GRAPH_MAX_LANES) * GRAPH_LANE_WIDTH

  /**
   * 作者列宽：按当前列表里最长的作者名测量，夹在上下限之间。
   *
   * 固定列宽会让短作者名后面空出一大片、把日期和 hash 推到老远；按内容收窄后
   * 三列贴在一起，同名作者在整表里仍然对齐。
   */
  const authorWidth = useMemo(() => {
    let widest = 0

    for (const commit of commits) widest = Math.max(widest, textWidth(commit.author, AUTHOR_FONT_SIZE))

    return Math.min(AUTHOR_MAX_WIDTH, Math.max(AUTHOR_MIN_WIDTH, Math.ceil(widest)))
  }, [commits])

  /** 引用名到类型的索引：整表只建一次，避免每行反复遍历分支列表。 */
  const refIndex = useMemo(() => buildRefKindIndex(knownRefs), [knownRefs])

  /** 列表容器的实测宽度：引用标签按它计算能显示几组。 */
  const [rowWidth, setRowWidth] = useState(0)

  useEffect(() => {
    const container = containerRef.current
    if (container === null) return

    // 面板宽度随拖动分隔条变化，订阅尺寸而不是只在挂载时读一次
    const observer = new ResizeObserver(() => setRowWidth(container.clientWidth))
    observer.observe(container)
    setRowWidth(container.clientWidth)

    return () => observer.disconnect()
  }, [])

  /** 标题与引用标签共享的宽度：行宽扣掉分支图占位、固定列与行内间距。 */
  const labelAreaWidth = useMemo(() => {
    if (rowWidth === 0) return 0

    const columns = authorWidth + (showDates ? DATE_WIDTH : 0) + HASH_WIDTH
    const gaps = (showDates ? 5 : 4) * ROW_GAP

    return Math.max(0, rowWidth - graphWidth - columns - gaps - ROW_PADDING_RIGHT)
  }, [authorWidth, graphWidth, rowWidth, showDates])

  return (
    <div ref={containerRef} className="min-h-0 flex-1 overflow-auto" onScroll={handleScroll}>
      <div className="relative">
        <CommitGraph layout={layout} solidRows={solidRows} headRows={headRows} />

        {commits.map((commit) => (
          <button
            key={commit.hash}
            ref={selectedHash === commit.hash ? selectedRowRef : undefined}
            type="button"
            onClick={() => onSelect(commit)}
            onDoubleClick={() => onSelect(commit)}
            onContextMenu={(event) => onContextMenu(event, commit)}
            style={{ height: COMMIT_ROW_HEIGHT }}
            className={cn(
              'flex w-full items-center gap-1.5 pr-2 text-left text-xs transition-colors',
              // 引用图标内部填充取行背景色，多枚图标叠放时才遮得住下层图标的线条
              selectedHash === commit.hash
                ? cn('bg-info/25 text-primary', REF_FILL_SELECTED)
                : cn('text-primary', REF_FILL_IDLE, REF_FILL_HOVER, 'hover:bg-surface2/60'),
            )}
          >
            {/* 分支图占位：图本身画在背后的整列 SVG 上 */}
            <span className="shrink-0" style={{ width: graphWidth }} />

            {/* 提交标题 */}
            <span className="min-w-0 flex-1 truncate">{commit.subject}</span>

            {/* 引用标签：IDEA 样式，彩色标签图标簇 + 名称；放不下的折叠为汇总图标 */}
            <RefBadges
              refs={commit.refs}
              index={refIndex}
              subject={commit.subject}
              availableWidth={labelAreaWidth}
            />

            {/* 作者：列宽按最长作者名收窄，与其后的日期、hash 贴在一起 */}
            <span className="shrink-0 truncate text-[11px] text-secondary" style={{ width: authorWidth }}>
              {commit.author}
            </span>

            {/* 日期 */}
            {showDates && (
              <span className="shrink-0 truncate text-[11px] text-secondary" style={{ width: DATE_WIDTH }}>
                {formatCommitDate(commit.date)}
              </span>
            )}

            {/* 短 hash */}
            <span className="shrink-0 truncate font-mono text-[11px] text-secondary" style={{ width: HASH_WIDTH }}>
              {commit.shortHash}
            </span>
          </button>
        ))}
      </div>

      {/* 首屏读完且确实没有提交时才显示空态，避免加载期间闪一句“无提交” */}
      {loaded && commits.length === 0 && <div className="px-3 py-3 text-xs text-secondary">{t('noCommits')}</div>}
    </div>
  )
}
