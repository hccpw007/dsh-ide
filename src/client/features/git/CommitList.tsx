/**
 * Log 页签中部的提交列表。
 *
 * 一行一提交：分支图、标题、引用标签、作者、日期与短 hash。左侧分支图是一整列
 * SVG（见 CommitGraph），行内只留占位宽度。列宽固定，标题独占剩余空间，长标题
 * 被截断而不是把作者/hash 挤掉。
 */
import React, { useMemo } from 'react'

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
  /** 当前检出提交的短 hash；空串表示游离 HEAD 或还没读到分支。 */
  headHash: string
  /** 滚动到底部时请求加载更旧的提交。 */
  onLoadMore(): void
}

/** 距离底部多少像素时开始加载下一批提交。 */
const LOAD_MORE_THRESHOLD = 120


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
  onLoadMore,
}: CommitListProps): React.ReactElement {
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

  return (
    <div className="min-h-0 flex-1 overflow-auto" onScroll={handleScroll}>
      <div className="relative">
        <CommitGraph layout={layout} solidRows={solidRows} headRows={headRows} />

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
