/**
 * 历史页签左侧的提交列表。
 *
 * 一行一提交：作者、时间、标题与最右侧的引用标签。与 Log 页签的列表相比没有分支
 * 图与短 hash —— 这里看的是「同一个文件被谁、何时、为什么改过」，IDEA 的文件历史
 * 也是这三列。引用标签与 Log 页签共用 RefBadges，两处观感一致。
 */
import React, { useMemo } from 'react'

import { cn } from '../../../common/cn'
import type { Translate } from '../../../types/plugin'

import type { GitCommit, GitRefs } from './api'
import { COMMIT_ROW_HEIGHT } from './CommitGraph'
import { formatCommitDate } from './CommitList'
import { buildRefKindIndex, REF_FILL_HOVER, REF_FILL_IDLE, RefBadges } from './RefBadges'

/** 选中行的图标填充色：与树选中蓝同色，遮住叠放时下层图标的线条。 */
const REF_FILL_SELECTED = '[--ide-ref-fill:var(--ide-tree-selected-bg)]'

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
  /** 分支树已读到的分支与标签；引用标签靠它判断每条引用是分支还是标签。 */
  knownRefs: GitRefs | null
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
  knownRefs,
  onSelect,
}: HistoryCommitListProps): React.ReactElement {
  /** 引用名到类型的索引：整表只建一次，避免每行反复遍历分支列表。 */
  const refIndex = useMemo(() => buildRefKindIndex(knownRefs), [knownRefs])

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
            // 选中行用 IDEA 的树选中蓝；引用图标内部填充同步取行背景色，遮挡叠放的下层图标
            selectedHash === commit.hash
              ? cn('bg-treeselected text-primary', REF_FILL_SELECTED)
              : cn('text-primary', REF_FILL_IDLE, REF_FILL_HOVER, 'hover:bg-surface2/60'),
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

          {/* 引用标签：IDEA 样式，彩色 tag 图标 + 灰色名称 */}
          <RefBadges refs={commit.refs} index={refIndex} />
        </button>
      ))}

      {commits.length === 0 && <div className="px-3 py-3 text-xs text-secondary">{t('noCommits')}</div>}
    </div>
  )
}
