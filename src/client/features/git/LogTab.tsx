/**
 * Git 面板的 Log 页签。
 *
 * 布局与 IDEA 一致：最左是竖向工具栏，其右是分支树，中间提交列表，右侧文件树与
 * 提交详情；过滤栏横跨列表与右侧区域。取数、动作与浮层分别放在 use-log-data、
 * use-log-actions 与 LogOverlays 里，本文件只负责状态与布局。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { usePersistedLayout } from '../../../common/persisted-layout'
import { SplitHandle } from '../../../common/split-handle'
import type { Translate } from '../../../types/plugin'
import type { IdeServices } from '../../shell/contract'

import { amendCommitMessage, readCommit, resetBranch, type GitCommit, type GitCommitDetail } from './api'
import { BranchTree } from './BranchTree'
import { CommitList } from './CommitList'
import { CommitSidebar } from './CommitSidebar'
import { readFavorites } from './favorites'
import { compileTextMatcher, matchesDate } from './log-filter'
import { branchFilterMenuItems, filterMenuItems, type FilterKind } from './log-menus'
import { LogFilterBar, type DateFilter } from './LogFilterBar'
import { LogOverlays } from './LogOverlays'
import type { CompareState, PromptState } from './log-state'
import { LogToolbar } from './LogToolbar'
import type { MenuItem, MenuState } from './menu'
import { useLogActions } from './use-log-actions'
import { useLogData } from './use-log-data'
import type { ResetMode } from './LogDialogs'

/** 左侧分支树宽度上下限：太窄放不下分支名，太宽会把提交列表挤没。 */
const MIN_BRANCH_WIDTH = 150
const MAX_BRANCH_WIDTH = 520

/** 首次打开时的分支树宽度，与 IDEA 的左树默认宽度一致。 */
const DEFAULT_BRANCH_WIDTH = 250

/** 右侧提交侧栏宽度上下限：太窄放不下提交信息，太宽会把提交列表挤没。 */
const MIN_SIDEBAR_WIDTH = 240
const MAX_SIDEBAR_WIDTH = 760

/** 首次打开时的侧栏宽度；IDEA 里提交侧栏比列表窄，留出列表的宽度。 */
const DEFAULT_SIDEBAR_WIDTH = 400

/** 布局标识：分支树与侧栏宽度全局共用，下次打开沿用上次拖出的位置。 */
const BRANCH_WIDTH_KEY = 'git.log.branchWidth'
const SIDEBAR_WIDTH_KEY = 'git.log.sidebarWidth'

/** 从历史页签定位提交时，首页之后最多再往后翻的页数。 */
const REVEAL_MAX_PAGES = 10

/** Log 页签 props。 */
export interface LogTabProps {
  /** 已绑定 git 前缀的翻译函数。 */
  t: Translate
  /** 工作台服务总线。 */
  services: IdeServices
  /** 工作区根。 */
  root: string
  /** 待定位的提交 hash；从历史页签跳过来时写入，空串表示没有待办。 */
  revealCommit?: string
  /** 定位成功或放弃后通知外层清空待办。 */
  onRevealed?(): void
}

/**
 * 渲染 Log 页签。
 * @param props 见 LogTabProps
 * @returns 分支树、过滤栏、提交列表与提交侧栏
 */
export function LogTab({ t, services, root, revealCommit = '', onRevealed }: LogTabProps): React.ReactElement {
  /** 分支过滤；空串表示所有分支，HEAD 表示只看 HEAD，其余是引用名。 */
  const [branch, setBranch] = useState('')
  /** 左侧树高亮的引用；null 表示没有选中行，空串表示 HEAD 节点。单击只改它，双击才切换范围。 */
  const [treeSelected, setTreeSelected] = useState<string | null>(null)
  const [pathFilter, setPathFilter] = useState('')
  const [selected, setSelected] = useState<GitCommit | null>(null)
  const [detail, setDetail] = useState<GitCommitDetail | null>(null)

  const [branchSearch, setBranchSearch] = useState('')
  const [textSearch, setTextSearch] = useState('')
  const [useRegex, setUseRegex] = useState(false)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [userFilter, setUserFilter] = useState('')
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [showDates, setShowDates] = useState(true)
  const [ascending, setAscending] = useState(false)

  /** 提交搜索框引用，供左侧工具栏的搜索按钮聚焦。 */
  const searchRef = useRef<HTMLInputElement>(null)

  const [menu, setMenu] = useState<MenuState | null>(null)
  const [prompt, setPrompt] = useState<PromptState | null>(null)
  const [promptValue, setPromptValue] = useState('')
  const [resetTarget, setResetTarget] = useState<GitCommit | null>(null)
  /** 提交信息编辑的目标提交；null 表示对话框未打开。 */
  const [messageTarget, setMessageTarget] = useState<GitCommit | null>(null)
  /** 提交信息编辑框里的文本。 */
  const [messageValue, setMessageValue] = useState('')
  /** Show Repository at Revision 切换视图后要落到的提交 hash；空串表示没有待定位。 */
  const [pendingReveal, setPendingReveal] = useState('')

  /** 收藏的分支短名；与工作区一样按仓库区分。 */
  const [favorites, setFavorites] = useState<ReadonlySet<string>>(() => readFavorites(root))

  /** 分支差异窗口：既用于 Compare with，也用于 Show Diff with Working Tree。 */
  const [compare, setCompare] = useState<CompareState | null>(null)

  /** 折叠/展开全部分组的信号：每次点击递增，树据此重置折叠集合。 */
  const [collapseSignal, setCollapseSignal] = useState(0)
  const [expandSignal, setExpandSignal] = useState(0)

  /** 左侧分支树宽度（px），由树与提交列表之间的分隔条拖动改变；拖过之后跨打开记忆。 */
  const [branchWidth, setBranchWidth] = usePersistedLayout(
    BRANCH_WIDTH_KEY,
    DEFAULT_BRANCH_WIDTH,
    MIN_BRANCH_WIDTH,
    MAX_BRANCH_WIDTH,
  )
  /** 右侧提交侧栏宽度（px），由提交列表与侧栏之间的分隔条拖动改变；拖过之后跨打开记忆。 */
  const [sidebarWidth, setSidebarWidth] = usePersistedLayout(
    SIDEBAR_WIDTH_KEY,
    DEFAULT_SIDEBAR_WIDTH,
    MIN_SIDEBAR_WIDTH,
    MAX_SIDEBAR_WIDTH,
  )

  /** 分支、提交身份与分页取数。 */
  const {
    refs,
    currentUser,
    allAuthors,
    commits,
    loading,
    loadedOnce,
    hasMoreCommits,
    error,
    setError,
    loadRefs,
    loadCommits,
    loadMoreCommits,
  } = useLogData(root, branch, pathFilter, userFilter)

  /** 写操作完成后重新读取分支与提交列表。 */
  const refresh = useCallback(async (): Promise<void> => {
    await Promise.all([loadRefs(), loadCommits()])
  }, [loadCommits, loadRefs])

  // Git 状态或文件失效时重载分支树与提交列表：提交、切分支、取消合并、后台 fetch
  // 都要跟着变。一次操作常连发两条广播（提交会同时刷新状态与目录），合并成一次重载。
  const refreshTimer = useRef<number | null>(null)
  const scheduleRefresh = useCallback((): void => {
    if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current)

    refreshTimer.current = window.setTimeout(() => {
      refreshTimer.current = null
      void refresh()
    }, 300)
  }, [refresh])

  useEffect(() => {
    const offStatus = services.subscribeGitStatus(scheduleRefresh)
    const offInvalidate = services.subscribeInvalidate(scheduleRefresh)

    return () => {
      offStatus()
      offInvalidate()
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current)
    }
  }, [scheduleRefresh, services])

  /** 清空过滤条件并定位到某提交（Show Repository at Revision）。 */
  const revealAtCommit = useCallback((commit: GitCommit): void => {
    setTextSearch('')
    setUserFilter('')
    setDateFilter('all')
    setPathFilter('')
    setBranch('')
    setTreeSelected(null)
    setPendingReveal(commit.hash)
  }, [])

  /** 工具栏与树的动作都作用在当前查看的分支上；所有分支与 HEAD 都按当前检出分支处理。 */
  const toolbarBranch = branch === 'HEAD' ? '' : branch

  /** 当前检出提交的短 hash；分支列表里 isHead 的那条就是它。 */
  const headHash = useMemo(
    () => (refs === null ? '' : (refs.local.find((item) => item.isHead)?.hash ?? '')),
    [refs],
  )

  /** 可选作者列表：优先用仓库全量作者，近期没提交的人也能在菜单里搜到；读不到时退回已加载提交。 */
  const authors = useMemo(
    () => (allAuthors.length > 0 ? allAuthors : [...new Set(commits.map((commit) => commit.author))].sort()),
    [allAuthors, commits],
  )

  /** 按搜索与日期过滤后的提交；作者过滤已由 git 完成，这里不再重复。 */
  const visibleCommits = useMemo(() => {
    // 正则只编译一次：逐条编译在几千条提交时会把主线程占满
    const matches = compileTextMatcher(textSearch, useRegex, caseSensitive)
    const filtered = commits.filter((commit) => matches(commit) && matchesDate(commit, dateFilter))

    return ascending ? [...filtered].reverse() : filtered
  }, [ascending, caseSensitive, commits, dateFilter, textSearch, useRegex])

  /** 分支与提交动作。 */
  const actions = useLogActions({
    root,
    services,
    t,
    refs,
    toolbarBranch,
    favorites,
    setFavorites,
    visibleCommits,
    headHash,
    detail,
    selectCommit: setSelected,
    revealAtCommit,
    setPrompt,
    setPromptValue,
    setResetTarget,
    setMessageTarget,
    setMessageValue,
    setCompare,
    setMenu,
    setError,
    refresh,
  })

  /** 定位提交时已追加的页数；找得到或放弃后清零。 */
  const revealPagesRef = useRef(0)
  /** 定位翻页是否在飞行中：避免同一条提交触发两次追加。 */
  const revealBusyRef = useRef(false)
  /** 是否已经为定位放开到所有分支重试过。 */
  const revealAllBranchesRef = useRef(false)

  // 从历史页签跳过来时定位提交：当前列表里没有就继续往后翻页，找到即选中
  useEffect(() => {
    // 首屏或一次重读还在进行时列表不完整，等这一轮结束再判断
    if (revealCommit === '' || !loadedOnce || loading) return

    const found = commits.find((commit) => commit.hash === revealCommit)

    if (found !== undefined) {
      // 带着过滤条件跳过来会看不见选中的行，定位时清掉文本/作者/日期过滤
      setTextSearch('')
      setUserFilter('')
      setDateFilter('all')
      setSelected(found)
      revealPagesRef.current = 0
      revealAllBranchesRef.current = false
      onRevealed?.()

      return
    }

    // 提交可能比已加载的页更旧；翻到上限仍没有就放弃，避免为了定位把整部历史拉进来
    if (!hasMoreCommits || revealPagesRef.current >= REVEAL_MAX_PAGES) {
      // 当前分支历史里找不到时再放开到所有分支试一次，之后仍找不到就放弃
      if (!revealAllBranchesRef.current) {
        revealAllBranchesRef.current = true
        revealPagesRef.current = 0
        setBranch('')
        setTreeSelected(null)
        setPathFilter('')

        return
      }

      revealPagesRef.current = 0
      revealAllBranchesRef.current = false
      onRevealed?.()

      return
    }

    if (revealBusyRef.current) return

    revealBusyRef.current = true
    revealPagesRef.current += 1
    void loadCommits(true, commits.length).finally(() => {
      revealBusyRef.current = false
    })
  }, [commits, hasMoreCommits, loadCommits, loadedOnce, loading, onRevealed, revealCommit])

  // 选中提交后读取详情；异步返回时若已切换提交就丢弃结果
  useEffect(() => {
    if (selected === null) {
      setDetail(null)

      return
    }

    let alive = true

    // 先清空旧详情，避免切换提交时右侧短暂显示上一个提交的内容
    setDetail(null)

    void readCommit(root, selected.hash)
      .then((result) => {
        if (!alive) return

        if (!result.ok) {
          setError(result.error.message)

          return
        }

        setDetail(result.value)
      })
      .catch((requestError: unknown) => {
        console.error('[dsh-ide] Failed to load commit details:', requestError)
        if (alive) setError(String(requestError))
      })

    return () => {
      alive = false
    }
  }, [root, selected, setError])

  // 换了仓库就换一份收藏：收藏按仓库根分开存储，直接读当前仓库的那份
  useEffect(() => {
    setFavorites(readFavorites(root))
  }, [root])

  // 切换分支/路径后旧详情不再对应当前列表，直接清空
  useEffect(() => {
    setSelected(null)
    setDetail(null)
  }, [branch, pathFilter])

  // Show Repository at Revision 会先清过滤并切到所有分支，列表要重读一轮。这个 effect
  // 必须排在「切换分支清空选中」之后：同一轮渲染里两个 effect 都跑，谁在后面谁生效，
  // 定位请求要在清空之后落位才算真正选中
  useEffect(() => {
    if (pendingReveal === '' || !loadedOnce || loading) return

    const found = commits.find((commit) => commit.hash === pendingReveal)

    if (found === undefined) {
      // 重读后仍然找不到就放弃，避免定位请求一直挂着
      if (!hasMoreCommits) setPendingReveal('')

      return
    }

    setSelected(found)
    setPendingReveal('')
  }, [commits, hasMoreCommits, loadedOnce, loading, pendingReveal])

  /** 清空全部过滤条件。 */
  const clearFilters = useCallback((): void => {
    setTextSearch('')
    setUseRegex(false)
    setCaseSensitive(false)
    setUserFilter('')
    setDateFilter('all')
    setPathFilter('')
    setBranch('')
    setTreeSelected(null)
  }, [])

  /**
   * 按引用切换提交范围，并让左侧树高亮对应的行。
   *
   * 切范围时清空路径过滤：否则新选的引用会被旧的路径条件一起收窄，列表看起来是空的。
   * @param ref 引用名；空串表示所有分支，HEAD 表示只看 HEAD
   */
  const applyBranchFilter = useCallback((ref: string): void => {
    setBranch(ref)
    // 所有分支没有对应的树行；HEAD 在树里用空串表示，因此要单独换算
    setTreeSelected(ref === '' ? null : ref === 'HEAD' ? '' : ref)
    setPathFilter('')
  }, [])

  /**
   * 「显示所有分支」开关：正在按引用过滤时切到所有分支，已经是所有分支时回到当前检出分支。
   */
  const toggleAllBranches = useCallback((): void => {
    if (branch !== '') {
      applyBranchFilter('')

      return
    }

    // 关掉「所有分支」就回到当前检出分支；游离 HEAD 没有分支名，直接按 HEAD 处理
    applyBranchFilter(refs?.head === undefined || refs.head === '' ? 'HEAD' : refs.head)
  }, [applyBranchFilter, branch, refs])

  /** 打开输入框，让用户直接填写分支、标签或引用名。 */
  const selectBranchFilter = useCallback((): void => {
    // 预填当前生效的引用：在它上面改比重输一遍快；看所有分支时留空
    setPromptValue(branch)
    setPrompt({
      title: t('selectBranchTitle'),
      hint: t('selectBranchHint'),
      submit: (name) => {
        const value = name.trim()

        // 空输入表示放弃这次过滤，保留当前列表
        if (value === '') return

        applyBranchFilter(value)
      },
    })
  }, [applyBranchFilter, branch, setPrompt, setPromptValue, t])

  /** 打开输入框，让用户直接填写作者名。 */
  const selectUserFilter = useCallback((): void => {
    // 预填当前作者：在它上面改比重输一遍快
    setPromptValue(userFilter)
    setPrompt({
      title: t('selectUserTitle'),
      hint: t('selectUserHint'),
      submit: (name) => {
        const value = name.trim()

        // 空输入表示放弃这次过滤，保留当前列表
        if (value === '') return

        setUserFilter(value)
      },
    })
  }, [setPrompt, setPromptValue, t, userFilter])

  /**
   * 构建用户过滤菜单项：作者列表按搜索框里的关键词模糊筛选。
   * @param keyword 搜索框内容
   * @param onSearch 搜索框输入回调；菜单重建后仍指向同一个处理函数
   * @returns 菜单项
   */
  const userFilterMenuItems = useCallback(
    (keyword: string, onSearch: (value: string) => void): MenuItem[] => {
      const lowered = keyword.trim().toLowerCase()

      return filterMenuItems(
        t,
        'user',
        {
          userFilter,
          currentUser,
          authors: lowered === '' ? authors : authors.filter((author) => author.toLowerCase().includes(lowered)),
          dateFilter,
          pathFilter,
          activeFile: services.activeFile(),
        },
        { selectUser: selectUserFilter, setUserFilter, setDateFilter, setPathFilter, searchUser: onSearch },
      )
    },
    [authors, currentUser, dateFilter, pathFilter, selectUserFilter, services, t, userFilter],
  )

  /** 用户搜索框输入变化：按新关键词重建当前菜单里的作者列表。 */
  const onUserSearch = useCallback(
    (value: string): void => {
      setMenu((previous) =>
        previous === null ? null : { ...previous, items: userFilterMenuItems(value, onUserSearch) },
      )
    },
    [userFilterMenuItems],
  )

  /** 打开过滤下拉菜单。 */
  const openFilterMenu = useCallback(
    (event: React.MouseEvent, kind: FilterKind): void => {
      // 分支过滤要列出分支与收藏，用户过滤带搜索框，两者单独构建
      const items =
        kind === 'branch'
          ? branchFilterMenuItems(
              t,
              { branch, refs, favorites },
              { applyBranch: applyBranchFilter, selectBranch: selectBranchFilter },
            )
          : kind === 'user'
            ? userFilterMenuItems('', onUserSearch)
            : filterMenuItems(
                t,
                kind,
                { userFilter, currentUser, authors, dateFilter, pathFilter, activeFile: services.activeFile() },
                { selectUser: selectUserFilter, setUserFilter, setDateFilter, setPathFilter },
              )

      setMenu({ x: event.clientX, y: event.clientY + 18, items })
    },
    [
      applyBranchFilter,
      authors,
      branch,
      currentUser,
      dateFilter,
      favorites,
      onUserSearch,
      pathFilter,
      refs,
      selectBranchFilter,
      selectUserFilter,
      services,
      t,
      userFilter,
      userFilterMenuItems,
    ],
  )

  /** 打开右上角更多菜单。 */
  const openMoreMenu = useCallback(
    (event: React.MouseEvent): void => {
      setMenu({
        x: event.clientX - 180,
        y: event.clientY + 16,
        items: [
          { id: 'all', label: `${branch === '' ? '✓ ' : ''}${t('showAllBranches')}`, run: toggleAllBranches },
          {
            id: 'dates',
            label: `${showDates ? '✓ ' : ''}${t('showTimestamps')}`,
            run: () => setShowDates((previous) => !previous),
          },
          { id: 'sort', label: t('sortByDate'), run: () => setAscending((previous) => !previous) },
          { id: 'clear', label: t('clearFilters'), separatorBefore: true, run: clearFilters },
        ],
      })
    },
    [branch, clearFilters, setMenu, showDates, t, toggleAllBranches],
  )

  /** 确认输入框：取去除首尾空白的值交给对话框自己的提交回调。 */
  const confirmPrompt = useCallback((): void => {
    if (prompt === null) return

    const value = promptValue.trim()
    setPrompt(null)
    prompt.submit(value)
  }, [prompt, promptValue])

  /** 确认重置：按所选模式把当前分支移到目标提交。 */
  const confirmReset = useCallback(
    (mode: ResetMode): void => {
      if (resetTarget === null) return

      const target = resetTarget
      setResetTarget(null)
      void actions.run(() => resetBranch(root, target.hash, mode))
    },
    [actions, resetTarget, root],
  )

  /** 确认提交信息编辑：空消息会被 git 拒绝，提前在界面上拦住。 */
  const confirmMessage = useCallback((): void => {
    if (messageTarget === null) return

    const message = messageValue.trim()

    // 空消息会被 git 拒绝，提前在界面上拦住，避免一次必然失败的命令
    if (message === '') {
      setError(t('messageRequired'))

      return
    }

    setMessageTarget(null)
    void actions.run(() => amendCommitMessage(root, message))
  }, [actions, messageTarget, messageValue, root, setError, t])

  return (
    <div className="flex h-full min-h-0">
      <LogToolbar
        t={t}
        branch={toolbarBranch}
        favorite={toolbarBranch !== '' && favorites.has(toolbarBranch)}
        onNewBranch={() => actions.openNewBranch(toolbarBranch)}
        onCheckout={() => actions.runOnSelectedBranch('checkout')}
        onDelete={() => actions.runOnSelectedBranch('delete')}
        onShowDiff={() => actions.runOnSelectedBranch('diffWorktree')}
        onSearch={() => searchRef.current?.focus()}
        onToggleFavorite={actions.toggleSelectedFavorite}
        onCollapseAll={() => setCollapseSignal((previous) => previous + 1)}
        onExpandAll={() => setExpandSignal((previous) => previous + 1)}
      />

      <BranchTree
        t={t}
        refs={refs}
        active={treeSelected}
        search={branchSearch}
        onSearchChange={setBranchSearch}
        width={branchWidth}
        favorites={favorites}
        collapseSignal={collapseSignal}
        expandSignal={expandSignal}
        onSelect={setTreeSelected}
        onActivate={(ref) => applyBranchFilter(ref === '' ? 'HEAD' : ref)}
        onContextMenu={actions.openBranchMenu}
      />

      {/* 分支树与提交列表之间的分隔条：拖动改变左侧树的宽度 */}
      <SplitHandle orientation="vertical" anchor="front" current={() => branchWidth} onResize={setBranchWidth} />

      {/* 列表列与提交侧栏并排：过滤栏只横跨提交列表，侧栏从顶端开始，与 IDEA 的 Log 一致 */}
      <div className="flex min-h-0 min-w-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <LogFilterBar
            t={t}
            textSearch={textSearch}
            onTextSearch={setTextSearch}
            searchRef={searchRef}
            useRegex={useRegex}
            onToggleRegex={() => setUseRegex((previous) => !previous)}
            caseSensitive={caseSensitive}
            onToggleCase={() => setCaseSensitive((previous) => !previous)}
            branch={branch}
            onClearBranch={() => {
              // 叉掉分支名后回到「所有分支」：IDEA 里芯片为空就代表不限分支
              setBranch('')
              setTreeSelected(null)
            }}
            userFilter={userFilter}
            onClearUser={() => setUserFilter('')}
            dateFilter={dateFilter}
            onClearDate={() => setDateFilter('all')}
            pathFilter={pathFilter}
            loading={loading}
            onFilterMenu={openFilterMenu}
            onToggleSort={() => setAscending((previous) => !previous)}
            onRefresh={() => void refresh()}
            onMore={openMoreMenu}
            onToggleAllBranches={toggleAllBranches}
          />

          {root === '' && <div className="p-3 text-xs text-secondary">{t('noSession')}</div>}
          {error !== '' && <div className="border-b border-line1 px-2 py-1.5 text-xs text-danger">{error}</div>}
          {loading && <div className="border-b border-line1 px-2 py-1 text-[11px] text-secondary">{t('loadingCommits')}</div>}
          {actions.busy && <div className="border-b border-line1 px-2 py-1 text-[11px] text-secondary">{t('loading')}</div>}

          <CommitList
            t={t}
            commits={visibleCommits}
            selectedHash={selected?.hash ?? ''}
            onSelect={setSelected}
            onContextMenu={actions.openCommitMenu}
            showDates={showDates}
            ascending={ascending}
            headHash={headHash}
            knownRefs={refs}
            onLoadMore={loadMoreCommits}
          />
        </div>

        {/* 提交列表与提交侧栏之间的分隔条：拖动改变右侧侧栏的宽度 */}
        <SplitHandle orientation="vertical" anchor="back" current={() => sidebarWidth} onResize={setSidebarWidth} />

        <div className="flex shrink-0 flex-col border-l border-line1" style={{ width: sidebarWidth }}>
          <CommitSidebar t={t} services={services} detail={detail} root={root} />
        </div>
      </div>

      <LogOverlays
        t={t}
        services={services}
        root={root}
        menu={{ state: menu, onClose: () => setMenu(null) }}
        prompt={{
          state: prompt,
          value: promptValue,
          onChange: setPromptValue,
          onCancel: () => setPrompt(null),
          onConfirm: confirmPrompt,
        }}
        reset={{
          target: resetTarget,
          branch: refs?.head ?? '',
          onCancel: () => setResetTarget(null),
          onConfirm: confirmReset,
        }}
        message={{
          target: messageTarget,
          value: messageValue,
          onChange: setMessageValue,
          onCancel: () => setMessageTarget(null),
          onConfirm: confirmMessage,
        }}
        compare={{ state: compare, onClose: () => setCompare(null) }}
      />
    </div>
  )
}
