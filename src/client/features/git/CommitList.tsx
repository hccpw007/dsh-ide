/**
 * Log 页签中部的提交列表。
 *
 * 一行一提交：彩色节点、标题、引用标签、作者、日期与短 hash。列宽固定，标题独占
 * 剩余空间，长标题被截断而不是把作者/hash 挤掉。
 */
import React from 'react'

import { cn } from '../../../common/cn'
import type { Translate } from '../../../types/plugin'

import type { GitCommit } from './api'

/** 提交列表 props。 */
export interface CommitListProps {
  /** 已绑定 git 前缀的翻译函数。 */
  t: Translate
  /** 已加载的提交。 */
  commits: GitCommit[]
  /** 当前选中的提交 hash。 */
  selectedHash: string
  /** 选中提交。 */
  onSelect(commit: GitCommit): void
  /** 右键提交。 */
  onContextMenu(event: React.MouseEvent, commit: GitCommit): void
  /** 是否显示日期列。 */
  showDates: boolean
}

/** 提交节点颜色；按行号轮换，模拟分支图的多种颜色。 */
const GRAPH_TONES = ['text-info', 'text-success', 'text-primary', 'text-warn'] as const

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
}: CommitListProps): React.ReactElement {
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      {commits.map((commit, index) => (
        <button
          key={commit.hash}
          type="button"
          onClick={() => onSelect(commit)}
          onDoubleClick={() => onSelect(commit)}
          onContextMenu={(event) => onContextMenu(event, commit)}
          className={cn(
            'flex h-[22px] w-full items-center gap-1.5 pl-1.5 pr-2 text-left text-xs transition-colors',
            selectedHash === commit.hash ? 'bg-info/25 text-primary' : 'text-primary hover:bg-layer2/60',
          )}
        >
          {/* 分支图节点：颜色按行轮换，竖线表达提交在时间线上的连续性 */}
          <span className={cn('flex w-4 shrink-0 justify-center', GRAPH_TONES[index % GRAPH_TONES.length])}>
            <svg width="10" height="14" viewBox="0 0 10 14" fill="none" stroke="currentColor" strokeWidth="1.2">
              <path d="M5 0v14" opacity="0.35" />
              <circle cx="5" cy="7" r="2.2" fill="currentColor" stroke="none" />
            </svg>
          </span>

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

      {commits.length === 0 && <div className="px-3 py-3 text-xs text-secondary">{t('noCommits')}</div>}
    </div>
  )
}
