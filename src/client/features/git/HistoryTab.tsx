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

import { readAuthors, readGitUser, readLog, readRefs, type GitCommit, type GitRefs } from './api'
import { DiffView } from './DiffView'
import { HistoryCommitList } from './HistoryCommitList'
import { HistoryToolbar } from './HistoryToolbar'
import type { DateFilter } from './LogFilterBar'
import { PromptDialog } from './LogDialogs'
import { matchesDate } from './log-filter'
import { filterMenuItems } from './log-menus'
import type { PromptState } from './log-state'
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
  /** 分支过滤；空串表示所有分支，HEAD 表示只看 HEAD，其余是引用名。 */
  const [branch, setBranch] = useState('')
  const [authorFilter, setAuthorFilter] = useState('')
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [showDates, setShowDates] = useState(true)
  const [refs, setRefs] = useState<GitRefs | null>(null)
  /** 当前提交身份；User 过滤菜单的 me 项用它。 */
  const [currentUser, setCurrentUser] = useState('')
  /** 仓库全部作者；User 过滤菜单的候选来源，避免近期没提交的人搜不到。 */
  const [allAuthors, setAllAuthors] = useState<string[]>([])
  const [menu, setMenu] = useState<MenuState | null>(null)
  /** 输入对话框状态：User 过滤的 Select... 用它直接填作者名。 */
  const [prompt, setPrompt] = useState<PromptState | null>(null)
  const [promptValue, setPromptValue] = useState('')
  /** 左侧列表宽度；null 表示按容器一半宽度铺开，拖动后固定成像素值。 */
  const [listWidth, setListWidth] = useState<number | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  /** 读取该文件的提交历史。 */
  const loadCommits = useCallback(async (): Promise<void> => {
    if (root === '') return

    try {
      const result = await readLog(root, {
        branch,
        all: branch === '',
        path,
        // 作者过滤下推到 git，分页之外的提交同样会被筛到
        author: authorFilter,
        limit: COMMIT_LIMIT,
      })

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
  }, [authorFilter, branch, path, root])

  /** 读取分支与当前提交身份：分支过滤菜单与 User 菜单的 me 项依赖它们。 */
  const loadRefs = useCallback(async (): Promise<void> => {
    if (root === '') return

    try {
      const [refsResult, userResult] = await Promise.all([readRefs(root), readGitUser(root)])

      setRefs(refsResult.ok ? refsResult.value : null)
      setCurrentUser(userResult.ok ? userResult.value.name : '')
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

  // 全量作者只随仓库变化读一次：提交是分页加载的，只看已加载提交会漏掉近期没提交的人
  useEffect(() => {
    if (root === '') return

    let alive = true

    void readAuthors(root)
      .then((result) => {
        if (alive) setAllAuthors(result.ok ? result.value.authors : [])
      })
      .catch((requestError: unknown) => {
        console.error('[dsh-ide] 读取提交作者失败:', requestError)
      })

    return () => {
      alive = false
    }
  }, [root])

  // 工作区有任何改动都可能带进新提交：收到广播就重新读取，历史列表不会停在旧状态。
  // 引用（分支/标签）也要一起刷新：切分支、后台 fetch 后引用栏同样会过期。
  useEffect(
    () =>
      services.subscribeInvalidate(() => {
        void loadCommits()
        void loadRefs()
      }),
    [loadCommits, loadRefs, services],
  )

  /** 可选作者列表：优先用仓库全量作者，近期没提交的人也能在菜单里搜到；读不到时退回已加载提交。 */
  const authors = useMemo(
    () => (allAuthors.length > 0 ? allAuthors : [...new Set(commits.map((commit) => commit.author))].sort()),
    [allAuthors, commits],
  )

  /** 应用日期过滤后的提交；作者过滤已由 git 完成，这里不再重复。 */
  const visibleCommits = useMemo(
    () => commits.filter((commit) => matchesDate(commit, dateFilter)),
    [commits, dateFilter],
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
        // HEAD 项显式只看 HEAD 的提交历史；「所有分支」由分支过滤为空表达
        {
          id: 'head',
          label: `${branch === 'HEAD' ? '✓ ' : ''}${t('headCurrent')}`,
          run: () => setBranch('HEAD'),
        },
        {
          id: 'all',
          label: `${branch === '' ? '✓ ' : ''}${t('showAllBranches')}`,
          run: () => setBranch(''),
        },
        ...(refs?.local ?? []).map((item, index) => ({
          id: `branch:${item.name}`,
          label: `${branch === item.name ? '✓ ' : ''}${item.name}`,
          separatorBefore: index === 0,
          run: () => setBranch(item.name),
        })),
      ]

      setMenu({ x: event.clientX, y: event.clientY + 18, items, minWidth: 220 })
    },
    [branch, refs, t],
  )

  /**
   * 构建提交过滤菜单：用户组带搜索框，日期组跟在后面。
   * @param keyword 用户搜索框内容
   * @param onSearch 搜索框输入回调
   * @returns 菜单项
   */
  const buildFilterMenu = useCallback(
    (keyword: string, onSearch: (value: string) => void): MenuItem[] => {
      const lowered = keyword.trim().toLowerCase()
      const state = {
        userFilter: authorFilter,
        currentUser,
        authors: lowered === '' ? authors : authors.filter((author) => author.toLowerCase().includes(lowered)),
        dateFilter,
        pathFilter: '',
        activeFile: null,
      }
      const actions = {
        // Select... 打开输入框：作者名不一定在 Recent 里出现过，需要能直接填
        selectUser: () => {
          setPromptValue(authorFilter)
          setPrompt({
            title: t('selectUserTitle'),
            hint: t('selectUserHint'),
            submit: (name) => {
              const value = name.trim()

              // 空输入表示放弃这次过滤，保留当前列表
              if (value === '') return

              setAuthorFilter(value)
            },
          })
        },
        searchUser: onSearch,
        setUserFilter: setAuthorFilter,
        setDateFilter,
        setPathFilter: () => undefined,
      }

      return [
        ...filterMenuItems(t, 'user', state, actions).map((item) => ({ ...item, id: `user:${item.id}` })),
        ...filterMenuItems(t, 'date', state, actions).map((item, index) => ({
          ...item,
          id: `date:${item.id}`,
          separatorBefore: index === 0,
        })),
      ]
    },
    [authorFilter, authors, currentUser, dateFilter, setPrompt, setPromptValue, t],
  )

  /** 用户搜索框输入变化：按新关键词重建菜单里的作者列表。 */
  const onUserSearch = useCallback(
    (value: string): void => {
      setMenu((previous) =>
        previous === null ? null : { ...previous, items: buildFilterMenu(value, onUserSearch) },
      )
    },
    [buildFilterMenu],
  )

  /**
   * 打开提交过滤菜单：作者与日期两组。
   * @param event 鼠标事件
   */
  const openFilterMenu = useCallback(
    (event: React.MouseEvent): void => {
      setMenu({ x: event.clientX, y: event.clientY + 18, items: buildFilterMenu('', onUserSearch), minWidth: 200 })
    },
    [buildFilterMenu, onUserSearch],
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
          showDates={showDates}
          onBranchMenu={openBranchMenu}
          onClearBranch={() => setBranch('')}
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
          knownRefs={refs}
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

      {prompt !== null && (
        <PromptDialog
          t={t}
          title={prompt.title}
          hint={prompt.hint}
          value={promptValue}
          onChange={setPromptValue}
          dialogSizes={services.dialogSizes}
          onCancel={() => setPrompt(null)}
          onConfirm={() => {
            const value = promptValue.trim()
            const submit = prompt.submit
            setPrompt(null)
            submit(value)
          }}
        />
      )}
    </div>
  )
}
