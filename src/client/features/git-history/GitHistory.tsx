/**
 * Git 历史工具窗口。
 *
 * 提交列表按页加载：每页 120 条，滚动到底自动要下一页，已经加载过的页不会重复。
 * 列表按需求列序展示日期、作者、短 hash、引用徽章与标题；点击一条进入详情，
 * 详情里逐文件显示改动统计，点文件打开差异。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'

import { cn } from '../../../common/cn'
import type { FeatureViewProps } from '../../shell/contract'

import { readCommit, readLog, type GitCommit, type GitCommitDetail } from '../git/api'

/** 每页条数。 */
const PAGE_SIZE = 120

/** 引用徽章配色。 */
function refTone(ref: string): string {
  if (ref.startsWith('HEAD')) return 'text-success'
  if (ref.startsWith('tag:')) return 'text-warn'
  if (ref.startsWith('origin/') || ref.includes('/')) return 'text-info'

  return 'text-brand'
}

/**
 * 渲染 Git 历史。
 * @param props 见 FeatureViewProps
 * @returns 提交列表与详情
 */
export function GitHistory({ t, services }: FeatureViewProps): React.ReactElement {
  const [commits, setCommits] = useState<GitCommit[]>([])
  const [detail, setDetail] = useState<GitCommitDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')

  /** 下一页的起始下标；同时防止重复请求。 */
  const skipRef = useRef(0)
  const loadingRef = useRef(false)
  const root = services.root

  /**
   * 加载下一页。
   * @param reset 是否从第一页重新开始
   */
  const load = useCallback(
    async (reset: boolean): Promise<void> => {
      if (root === '' || loadingRef.current) return

      loadingRef.current = true
      setLoading(true)

      const skip = reset ? 0 : skipRef.current
      const result = await readLog(root, skip, PAGE_SIZE, filter)

      loadingRef.current = false
      setLoading(false)

      if (!result.ok) {
        // 不是仓库时不报错，界面显示空态即可
        if (result.error.code !== 'GIT_NOT_REPOSITORY') setError(result.error.message)
        if (reset) setCommits([])

        return
      }

      setError('')
      skipRef.current = skip + result.value.commits.length
      setCommits((previous) => (reset ? result.value.commits : [...previous, ...result.value.commits]))
    },
    [filter, root],
  )

  useEffect(() => {
    skipRef.current = 0
    void load(true)
  }, [load])

  /**
   * 滚动到底时加载下一页。
   * @param event 滚动事件
   */
  const handleScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>): void => {
      const element = event.currentTarget
      // 距离底部不足 80px 就预取，滚动不会出现空档
      if (element.scrollHeight - element.scrollTop - element.clientHeight > 80) return

      void load(false)
    },
    [load],
  )

  /**
   * 打开一条提交的详情。
   * @param commit 提交
   */
  const openCommit = useCallback(
    async (commit: GitCommit): Promise<void> => {
      const result = await readCommit(root, commit.hash)

      if (!result.ok) {
        setError(result.error.message)

        return
      }

      setDetail(result.value)
    },
    [root],
  )

  if (detail !== null) {
    return (
      <div className="flex min-h-full flex-col">
        {/* 详情标题栏：返回列表 */}
        <div className="sticky top-0 z-10 flex h-9 shrink-0 items-center gap-2 border-b border-line1 bg-layer1 px-3">
          <button
            type="button"
            onClick={() => setDetail(null)}
            className="rounded px-1.5 text-xs text-info hover:bg-layer2"
          >
            ← {t('backToHistory')}
          </button>

          <span className="min-w-0 flex-1 truncate text-xs text-secondary">{detail.commit.shortHash}</span>
        </div>

        <div className="border-b border-line1 px-3 py-2 text-xs">
          {/* 提交标题 */}
          <div className="mb-1 text-primary">{detail.commit.subject}</div>

          {/* 作者与时间 */}
          <div className="text-secondary">
            {detail.commit.author} · {detail.commit.date}
          </div>

          {/* 提交正文 */}
          {detail.commit.body !== undefined && detail.commit.body.trim() !== '' && (
            <pre className="mt-1 whitespace-pre-wrap text-secondary">{detail.commit.body}</pre>
          )}
        </div>

        <div className="flex-1 px-1 py-1">
          {detail.files.map((file) => (
            <button
              key={file.path}
              type="button"
              onClick={() =>
                services.openDiff({
                  kind: 'commits',
                  from: `${detail.commit.hash}~1`,
                  to: detail.commit.hash,
                  path: file.path,
                })
              }
              className="flex w-full items-center gap-1.5 rounded px-2 py-0.5 text-left text-xs hover:bg-layer2"
            >
              {/* 改名或新增文件在这里只有路径，统计在右侧 */}
              <span className="min-w-0 flex-1 truncate text-primary">{file.path}</span>
              <span className="shrink-0 text-success">+{file.added}</span>
              <span className="shrink-0 text-danger">−{file.removed}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-col">
      {/* 标题栏：面板名与过滤框 */}
      <div className="sticky top-0 z-10 flex h-9 shrink-0 items-center gap-2 border-b border-line1 bg-layer1 px-3">
        {/* 面板名称 */}
        <span className="shrink-0 text-xs font-medium text-primary">{t('title')}</span>

        <input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              skipRef.current = 0
              void load(true)
            }
          }}
          placeholder={t('filterPlaceholder')}
          className="min-w-0 flex-1 rounded border border-line2 bg-base px-1.5 py-0.5 text-xs text-primary outline-none focus:border-line4"
        />

        {/* 重新从第一页加载 */}
        <button
          type="button"
          onClick={() => {
            skipRef.current = 0
            void load(true)
          }}
          className="shrink-0 rounded px-1.5 text-xs text-secondary hover:bg-layer2 hover:text-primary"
        >
          {t('refresh')}
        </button>
      </div>

      {root === '' && <div className="px-3 py-3 text-xs text-secondary">{t('noSession')}</div>}
      {error !== '' && <div className="px-3 py-2 text-xs text-danger">{error}</div>}

      {/* 提交列表：滚动到底自动加载下一页 */}
      <div onScroll={handleScroll} className="min-h-0 flex-1 overflow-auto">
        {commits.map((commit) => (
          <button
            key={commit.hash}
            type="button"
            onClick={() => void openCommit(commit)}
            className="flex w-full items-start gap-2 border-b border-line1 px-2 py-1.5 text-left hover:bg-layer2"
          >
            {/* 短 hash 与日期构成左侧标识 */}
            <span className="w-16 shrink-0 font-mono text-[11px] text-info">{commit.shortHash}</span>

            <span className="min-w-0 flex-1">
              {/* 标题 */}
              <span className="block truncate text-xs text-primary">{commit.subject}</span>

              <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-secondary">
                {/* 作者 */}
                <span>{commit.author}</span>
                <span>·</span>
                {/* 提交时间 */}
                <span>{commit.date.slice(0, 10)}</span>

                {/* 引用徽章：HEAD、分支、标签，最多三个 */}
                {commit.refs.slice(0, 3).map((ref) => (
                  <span key={ref} className={cn('rounded border border-line2 px-1', refTone(ref))}>
                    {ref}
                  </span>
                ))}

                {commit.refs.length > 3 && <span>+{commit.refs.length - 3}</span>}
              </span>
            </span>
          </button>
        ))}

        {commits.length === 0 && !loading && root !== '' && (
          <div className="px-3 py-3 text-xs text-secondary">{t('empty')}</div>
        )}

        {loading && <div className="px-3 py-2 text-xs text-secondary">{t('loading')}</div>}
      </div>
    </div>
  )
}
