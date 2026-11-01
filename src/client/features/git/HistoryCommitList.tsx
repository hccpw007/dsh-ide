/**
 * 历史页签左侧的提交列表。
 *
 * 一行一提交：作者、时间、标题与最右侧的引用标签。与 Log 页签的列表相比没有分支
 * 图与短 hash —— 这里看的是「同一个文件被谁、何时、为什么改过」，IDEA 的文件历史
 * 也是这三列。
 */
import React from 'react'

import { cn } from '../../../common/cn'
import type { Translate } from '../../../types/plugin'

import type { GitCommit } from './api'
import { COMMIT_ROW_HEIGHT } from './CommitGraph'
import { formatCommitDate } from './CommitList'
import { refLabelIcon } from './icons'

/** 历史提交列表 props。 */
export interface HistoryCommitListProps {
  /** 已绑定 git 前缀的翻译函数。 */
  t: Translate
  /** 该文件的提交，顺序即展示顺序。 */
  commits: GitCommit[]
  /** 当前选中的提交 hash。 */
  selectedHash: string
  /** 是否显示时间列。 */
  showDates: boolean
  /** 选中某个提交。 */
  onSelect(commit: GitCommit): void
}

/**
 * 渲染历史提交列表。
 * @param props 见 HistoryCommitListProps
 * @returns 提交行
 */
export function HistoryCommitList({
  t,
  commits,
  selectedHash,
  showDates,
  onSelect,
}: HistoryCommitListProps): React.ReactElement {
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      {commits.map((commit) => (
        <button
          key={commit.hash}
          type="button"
          onClick={() => onSelect(commit)}
          style={{ height: COMMIT_ROW_HEIGHT }}
          className={cn(
            'flex w-full items-center gap-2 px-2 text-left text-xs transition-colors',
            // 选中行用 IDEA 的树选中蓝，与项目树、Log 列表是同一个观感
            selectedHash === commit.hash ? 'bg-treeselected text-primary' : 'text-primary hover:bg-surface2/60',
          )}
        >
          {/* 作者 */}
          <span className="w-[88px] shrink-0 truncate text-secondary">{commit.author}</span>

          {/* 提交时间 */}
          {showDates && (
            <span className="w-[112px] shrink-0 truncate text-secondary">{formatCommitDate(commit.date)}</span>
          )}

          {/* 提交标题 */}
          <span className="min-w-0 flex-1 truncate">{commit.subject}</span>

          {/* 引用标签：本地分支绿色、远程分支蓝色，与分支树呼应 */}
          {commit.refs.length > 0 && (
            <span className="flex max-w-[220px] shrink-0 items-center gap-2 overflow-hidden">
              {commit.refs.slice(0, 3).map((ref) => (
                <span key={ref} title={ref} className="flex min-w-0 items-center gap-1">
                  <span className={ref.includes('/') ? 'text-info' : 'text-success'}>{refLabelIcon()}</span>

                  <span className="max-w-[120px] truncate text-[11px] text-secondary">{ref}</span>
                </span>
              ))}
            </span>
          )}
        </button>
      ))}

      {commits.length === 0 && <div className="px-3 py-3 text-xs text-secondary">{t('noCommits')}</div>}
    </div>
  )
}
