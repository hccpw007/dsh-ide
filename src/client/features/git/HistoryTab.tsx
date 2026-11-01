/**
 * 历史页签：单个文件的提交历史与逐提交差异。
 *
 * 布局照 IDEA 的「History for File」：左侧是该文件的提交列表与其上的工具条，
 * 右侧是选中提交相对父提交的差异。两侧宽度可拖动，默认各占一半。
 *
 * 取数只走既有的 `log` 与 `showFileText`：前者带 `path` 过滤，后者按提交取文件
 * 正文，因此不需要为历史另开宿主接口。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { DiffSource } from '../../../common/diff-source'
import { SplitHandle } from '../../../common/split-handle'
import type { Translate } from '../../../types/plugin'
import type { IdeServices } from '../../shell/contract'

import { readLog, readRefs, type GitCommit, type GitRefs } from './api'
import { DiffView } from './DiffView'
import { HistoryCommitList } from './HistoryCommitList'
import { HistoryToolbar } from './HistoryToolbar'
import type { DateFilter } from './LogFilterBar'
import { matchesDate } from './log-filter'
import { filterMenuItems } from './log-menus'
import { ContextMenu, type MenuItem, type MenuState } from './menu'

/** 一次读取的提交数；文件历史通常远短于全仓库历史，一次取够即可。 */
const COMMIT_LIMIT = 200

/** 左侧列表宽度上下限：太窄放不下作者与时间两列，太宽会把差异挤没。 */
const MIN_LIST_WIDTH = 240
const MAX_LIST_WIDTH = 1200

/**
 * 根提交的父提交占位。
 *
 * git 的空树对象 hash 在所有仓库里都一样；拿它当基准去取文件内容必然取不到，
 * 于是差异表现为「整份文件新增」，与 IDEA 对根提交的展示一致。
 */
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

/** 历史页签 props。 */
export interface HistoryTabProps {
  /** 已绑定 git 前缀的翻译函数。 */
  t: Translate
  /** 工作台服务总线。 */
  services: IdeServices
  /** 工作区根；空串表示会话还没绑定工作目录。 */
  root: string
  /** 历史对象：相对工作区根的文件路径。 */
  path: string
  /** 在 Log 页签中定位某个提交。 */
  onShowInLog(commit: GitCommit): void
}

/**
 * 渲染历史页签。
 * @param props 见 HistoryTabProps
 * @returns 左侧提交列表与右侧差异
 */
export function HistoryTab({ t, services, root, path, onShowInLog }: HistoryTabProps): React.ReactElement {
  const [commits, setCommits] = useState<GitCommit[]>([])
  const [error, setError] = useState('')
  const [selectedHash, setSelectedHash] = useState('')
  const [branch, setBranch] = useState('')
  const [allBranches, setAllBranches] = useState(false)
  const [authorFilter, setAuthorFilter] = useState('')
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [showDates, setShowDates] = useState(true)
  const [refs, setRefs] = useState<GitRefs | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  /** 左侧列表宽度；null 表示按容器一半宽度铺开，拖动后固定成像素值。 */
  const [listWidth, setListWidth] = useState<number | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  /** 读取该文件的提交历史。 */
  const loadCommits = useCallback(async (): Promise<void> => {
    if (root === '') return

    try {
      const result = await readLog(root, { branch, all: allBranches, path, limit: COMMIT_LIMIT })

      if (!result.ok) {
        // 不是仓库属于正常状态，列表留空即可
        if (result.error.code !== 'GIT_NOT_REPOSITORY') setError(result.error.message)
        setCommits([])

        return
      }

      setError('')
      setCommits(result.value.commits)
    } catch (requestError) {
      console.error('[dsh-ide] 读取文件提交历史失败:', requestError)
      setError(requestError instanceof Error ? requestError.message : String(requestError))
      setCommits([])
    }
  }, [allBranches, branch, path, root])

  /** 读取分支：分支过滤菜单依赖它。 */
  const loadRefs = useCallback(async (): Promise<void> => {
    if (root === '') return

    try {
      const result = await readRefs(root)

      setRefs(result.ok ? result.value : null)
    } catch (requestError) { // 分支只影响菜单内容，取不到时维持现状
      console.error('[dsh-ide] 读取分支失败:', requestError)
    }
  }, [root])

  useEffect(() => {
    void loadCommits()
  }, [loadCommits])

  useEffect(() => {
    void loadRefs()
  }, [loadRefs])

  // 工作区有任何改动都可能带进新提交：收到广播就重新读取，历史列表不会停在旧状态
  useEffect(() => services.subscribeInvalidate(() => void loadCommits()), [loadCommits, services])

  /** 可选作者：来自已加载提交，避免额外请求。 */
  const authors = useMemo(() => [...new Set(commits.map((commit) => commit.author))].sort(), [commits])

  /** 应用作者与日期过滤后的提交。 */
  const visibleCommits = useMemo(
    () =>
      commits.filter(
        (commit) => (authorFilter === '' || commit.author === authorFilter) && matchesDate(commit, dateFilter),
      ),
    [authorFilter, commits, dateFilter],
  )

  // 可选的提交变化后保证总有一条选中：选中的那条被过滤掉时回到最新一条，
  // 右侧差异因此不会停在空态
  useEffect(() => {
    if (visibleCommits.length === 0) {
      setSelectedHash('')

      return
    }

    if (visibleCommits.some((commit) => commit.hash === selectedHash)) return

    const first = visibleCommits[0]
    if (first !== undefined) setSelectedHash(first.hash)
  }, [selectedHash, visibleCommits])

  /** 当前选中的提交。 */
  const selected = useMemo(
    () => visibleCommits.find((commit) => commit.hash === selectedHash) ?? null,
    [selectedHash, visibleCommits],
  )

  /** 右侧差异来源：选中提交与它的父提交。 */
  const source = useMemo<DiffSource | null>(() => {
    if (selected === null) return null

    return { kind: 'commits', from: selected.parents[0] ?? EMPTY_TREE, to: selected.hash, path }
  }, [path, selected])

  /**
   * 打开分支过滤菜单。
   * @param event 鼠标事件
   */
  const openBranchMenu = useCallback(
    (event: React.MouseEvent): void => {
      const items: MenuItem[] = [
        {
          id: 'head',
          label: `${!allBranches && branch === '' ? '✓ ' : ''}${t('headCurrent')}`,
          run: () => {
            setAllBranches(false)
            setBranch('')
          },
        },
        {
          id: 'all',
          label: `${allBranches ? '✓ ' : ''}${t('showAllBranches')}`,
          run: () => setAllBranches(true),
        },
        ...(refs?.local ?? []).map((item, index) => ({
          id: `branch:${item.name}`,
          label: `${!allBranches && branch === item.name ? '✓ ' : ''}${item.name}`,
          separatorBefore: index === 0,
          run: () => {
            setAllBranches(false)
            setBranch(item.name)
          },
        })),
      ]

      setMenu({ x: event.clientX, y: event.clientY + 18, items, minWidth: 220 })
    },
    [allBranches, branch, refs, t],
  )

  /**
   * 打开提交过滤菜单：作者与日期两组。
   * @param event 鼠标事件
   */
  const openFilterMenu = useCallback(
    (event: React.MouseEvent): void => {
      const state = {
        allBranches,
        branch,
        userFilter: authorFilter,
        authors,
        dateFilter,
        pathFilter: '',
        activeFile: null,
      }
      const actions = {
        setAllBranches,
        setUserFilter: setAuthorFilter,
        setDateFilter,
        setPathFilter: () => undefined,
      }

      const items: MenuItem[] = [
        ...filterMenuItems(t, 'user', state, actions).map((item) => ({ ...item, id: `user:${item.id}` })),
        ...filterMenuItems(t, 'date', state, actions).map((item, index) => ({
          ...item,
          id: `date:${item.id}`,
          separatorBefore: index === 0,
        })),
      ]

      setMenu({ x: event.clientX, y: event.clientY + 18, items, minWidth: 200 })
    },
    [allBranches, authorFilter, authors, branch, dateFilter, t],
  )

  /**
   * 打开视图选项菜单（眼睛按钮右下角）。
   * @param event 鼠标事件
   */
  const openViewMenu = useCallback(
    (event: React.MouseEvent): void => {
      const items: MenuItem[] = [
        {
          id: 'dates',
          label: `${showDates ? '✓ ' : ''}${t('showTimestamps')}`,
          run: () => setShowDates((previous) => !previous),
        },
        {
          id: 'clear',
          label: t('clearFilters'),
          separatorBefore: true,
          run: () => {
            setAuthorFilter('')
            setDateFilter('all')
            setAllBranches(false)
            setBranch('')
          },
        },
      ]

      setMenu({ x: event.clientX - 150, y: event.clientY + 14, items })
    },
    [showDates, t],
  )

  /**
   * 把拖动得到的列表宽度收进合法区间。
   * @param next 新宽度
   */
  const resizeList = useCallback((next: number): void => {
    setListWidth(Math.min(Math.max(next, MIN_LIST_WIDTH), MAX_LIST_WIDTH))
  }, [])

  return (
    <div className="flex h-full min-h-0">
      <div ref={listRef} className="flex min-w-0 shrink-0 flex-col" style={{ width: listWidth ?? '50%' }}>
        <HistoryToolbar
          t={t}
          branch={branch}
          allBranches={allBranches}
          showDates={showDates}
          onBranchMenu={openBranchMenu}
          onClearBranch={() => {
            setAllBranches(false)
            setBranch('')
          }}
          onShowInLog={() => {
            if (selected !== null) onShowInLog(selected)
          }}
          onFilterMenu={openFilterMenu}
          onToggleDates={() => setShowDates((previous) => !previous)}
          onViewMenu={openViewMenu}
        />

        {root === '' && <div className="px-3 py-2 text-xs text-secondary">{t('noSession')}</div>}
        {error !== '' && <div className="border-b border-line1 px-2 py-1.5 text-xs text-danger">{error}</div>}

        <HistoryCommitList
          t={t}
          commits={visibleCommits}
          selectedHash={selectedHash}
          showDates={showDates}
          onSelect={(commit) => setSelectedHash(commit.hash)}
        />
      </div>

      {/* 列表与差异之间的分隔条：拖动改变左侧列表宽度 */}
      <SplitHandle
        orientation="vertical"
        anchor="front"
        current={() => listRef.current?.getBoundingClientRect().width ?? 0}
        onResize={resizeList}
      />

      <div className="min-w-0 flex-1">
        <DiffView
          t={t}
          services={services}
          root={root}
          source={source}
          files={source === null ? [] : [source]}
          variant="history"
        />
      </div>

      {menu !== null && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </div>
  )
}
