/**
 * Git 面板的 Log 页签。
 *
 * 布局与 IDEA 一致：最左是竖向工具栏，其右是分支树，中间提交列表，右侧文件树与
 * 提交详情；过滤栏横跨列表与右侧区域。所有分支操作、提交操作都通过右键菜单触发，并写入控制台。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { ApiResult } from '../../../common/api'
import { SplitHandle } from '../../../common/split-handle'
import type { Translate } from '../../../types/plugin'
import type { IdeServices } from '../../shell/contract'

import {
  amendCommitMessage,
  checkout,
  cherryPick,
  compareWorktree,
  createBranch,
  dropCommit,
  pushUpToHere,
  readCommit,
  readLog,
  readRefs,
  renameBranch,
  resetBranch,
  revertCommit,
  tagCommit,
  type GitCommit,
  type GitCommitDetail,
  type GitCompareFile,
  type GitRefs,
  type GitRunOutput,
} from './api'
import { createWorktree, defaultWorktreePath, runBranchAction, type BranchActionDeps } from './branch-actions'
import { branchMenuItems, type BranchKind, type BranchMenuContext } from './branch-menus'
import { BranchDiffDialog } from './BranchDiffDialog'
import { BranchTree } from './BranchTree'
import { commitMenuContext, neighbourCommit, writePatch } from './commit-actions'
import { CommitList } from './CommitList'
import { CommitSidebar } from './CommitSidebar'
import { readFavorites, toggleFavorite } from './favorites'
import { EditMessageDialog, PromptDialog, ResetDialog, type ResetMode } from './LogDialogs'
import { compileTextMatcher, matchesDate } from './log-filter'
import { branchFilterMenuItems, commitMenuItems, filterMenuItems, type FilterKind } from './log-menus'
import { LogFilterBar, type DateFilter } from './LogFilterBar'
import { LogToolbar } from './LogToolbar'
import { ContextMenu, type MenuState } from './menu'

/**
 * 每次加载的提交数。
 *
 * 与 IDEA 一致分批加载：一次拉几百条会把「同时活跃的分支」全算进分支图，列宽随
 * 最深一行的分叉数量暴涨，而首屏其实只有两三条线。分批加载让列宽跟着实际看到的
 * 历史增长。
 */
const COMMIT_LIMIT = 100

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

/** 从历史页签定位提交时，首页之后最多再往后翻的页数。 */
const REVEAL_MAX_PAGES = 10

/** 输入对话框状态。 */
type PromptState = {
  /** 标题。 */
  title: string
  /** 说明文字。 */
  hint: string
  /** 确认回调。 */
  submit(value: string): void
}

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
  const [refs, setRefs] = useState<GitRefs | null>(null)
  /** 分支过滤；空串表示所有分支，HEAD 表示只看 HEAD，其余是引用名。 */
  const [branch, setBranch] = useState('')
  /** 左侧树高亮的引用；null 表示没有选中行，空串表示 HEAD 节点。单击只改它，双击才切换范围。 */
  const [treeSelected, setTreeSelected] = useState<string | null>(null)
  const [pathFilter, setPathFilter] = useState('')
  const [commits, setCommits] = useState<GitCommit[]>([])
  const [loading, setLoading] = useState(false)
  /** 首屏是否已经读过一次；定位提交要等它完成才判断「列表里有没有」。 */
  const [loadedOnce, setLoadedOnce] = useState(false)

  /** 追加请求是否在飞行中；滚动事件可能连发，用它挡住重复请求。 */
  const loadingMoreRef = useRef(false)
  const [hasMoreCommits, setHasMoreCommits] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
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
  const [compare, setCompare] = useState<{
    /** 窗口标题。 */
    title: string
    /** 比较基准。 */
    left: string
    /** 被比较的引用；null 表示右侧取工作区。 */
    right: string | null
    /** 差异文件列表。 */
    files: GitCompareFile[]
  } | null>(null)

  /** 折叠/展开全部分组的信号：每次点击递增，树据此重置折叠集合。 */
  const [collapseSignal, setCollapseSignal] = useState(0)
  const [expandSignal, setExpandSignal] = useState(0)

  /** 左侧分支树宽度（px），由树与提交列表之间的分隔条拖动改变。 */
  const [branchWidth, setBranchWidth] = useState(DEFAULT_BRANCH_WIDTH)
  /** 右侧提交侧栏宽度（px），由提交列表与侧栏之间的分隔条拖动改变。 */
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH)

  /** 把拖拽得到的分支树宽度收进合法区间。 */
  const resizeBranch = useCallback((next: number): void => {
    setBranchWidth(Math.min(Math.max(next, MIN_BRANCH_WIDTH), MAX_BRANCH_WIDTH))
  }, [])

  /** 把拖拽得到的侧栏宽度收进合法区间。 */
  const resizeSidebar = useCallback((next: number): void => {
    setSidebarWidth(Math.min(Math.max(next, MIN_SIDEBAR_WIDTH), MAX_SIDEBAR_WIDTH))
  }, [])

  /** 读取分支与标签。 */
  const loadRefs = useCallback(async (): Promise<void> => {
    if (root === '') return

    const result = await readRefs(root)

    if (!result.ok) {
      // 不是仓库属于正常状态，树留空即可
      if (result.error.code !== 'GIT_NOT_REPOSITORY') setError(result.error.message)
      setRefs(null)

      return
    }

    setRefs(result.value)
  }, [root])

  /**
   * 读取提交列表。
   * @param append 是否追加到已加载的提交之后（滚动到底部时）
   * @param skip 跳过多少条；追加时等于已加载条数
   */
  const loadCommits = useCallback(
    async (append = false, skip = 0): Promise<void> => {
      if (root === '') return

      if (!append) setLoading(true)

      const result = await readLog(root, {
        // 分支过滤为空就代表所有分支：与 IDEA 一致，此时按 --all 列出全部历史
        all: branch === '',
        branch,
        path: pathFilter,
        skip,
        limit: COMMIT_LIMIT,
      })

      if (!append) {
        setLoading(false)
        setLoadedOnce(true)
      }

      if (!result.ok) {
        if (result.error.code !== 'GIT_NOT_REPOSITORY') setError(result.error.message)
        if (!append) setCommits([])
        setHasMoreCommits(false)

        return
      }

      setError('')
      setHasMoreCommits(result.value.commits.length >= COMMIT_LIMIT)
      if (append) setCommits((previous) => [...previous, ...result.value.commits])
      else setCommits(result.value.commits)
    },
    [branch, pathFilter, root],
  )

  /** 滚动到底部时继续加载更旧的提交。 */
  const loadMoreCommits = useCallback((): void => {
    // 滚动事件可能在同一帧里连发多次，用 ref 挡住重复请求，避免同一段历史被追加两遍
    if (loadingMoreRef.current || !hasMoreCommits) return

    loadingMoreRef.current = true
    void loadCommits(true, commits.length).finally(() => {
      loadingMoreRef.current = false
    })
  }, [commits.length, hasMoreCommits, loadCommits])

  /** 定位提交时已追加的页数；找得到或放弃后清零。 */
  const revealPagesRef = useRef(0)
  /** 定位翻页是否在飞行中：避免同一条提交触发两次追加。 */
  const revealBusyRef = useRef(false)
  /** 是否已经为定位放开到全部分支重试过。 */
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
      // 当前分支历史里找不到时再放开到全部分支试一次，之后仍找不到就放弃
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

  useEffect(() => {
    void loadRefs()
  }, [loadRefs])

  useEffect(() => {
    void loadCommits()
  }, [loadCommits])

  // 切换分支/路径后旧详情不再对应当前列表，直接清空
  useEffect(() => {
    setSelected(null)
    setDetail(null)
  }, [branch, pathFilter])

  // Show Repository at Revision 会先清过滤并切到全部分支，列表要重读一轮。这个 effect
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
  }, [root, selected])

  /**
   * 执行一次写操作并刷新列表；命令与控制台记录由 api 层统一处理。
   * @param action 实际调用
   */
  const run = useCallback(
    async (action: () => Promise<ApiResult<GitRunOutput>>): Promise<boolean> => {
      setBusy(true)

      try {
        const result = await action()

        if (!result.ok) {
          setError(result.error.message)

          return false
        }

        setError('')
        await Promise.all([loadRefs(), loadCommits()])
        services.refreshGitStatus()
        services.invalidate()

        return true
      } finally {
        setBusy(false)
      }
    },
    [loadCommits, loadRefs, root, services],
  )

  /** 打开新建分支对话框。 */
  const openNewBranch = useCallback(
    (start: string): void => {
      setPromptValue('')
      setPrompt({
        title: t('newBranchTitle'),
        hint: `${t('newBranchFromHint')} ${start === '' ? 'HEAD' : start}`,
        submit: (name) => {
          if (name.trim() === '') {
            setError(t('branchNameRequired'))

            return
          }

          void run(() => createBranch(root, name, start))
        },
      })
    },
    [root, run, t],
  )

  /** 打开重命名分支对话框。 */
  const openRename = useCallback(
    (branch: string): void => {
      setPromptValue(branch)
      setPrompt({
        title: t('renameBranchTitle'),
        hint: branch,
        submit: (name) => {
          if (name.trim() === '') {
            setError(t('branchNameRequired'))

            return
          }

          void run(() => renameBranch(root, branch, name))
        },
      })
    },
    [root, run, t],
  )

  /** 打开新建工作树对话框；目录默认放在仓库的兄弟目录，与 IDEA 一致。 */
  const openWorktree = useCallback(
    (ref: string): void => {
      setPromptValue(defaultWorktreePath(root, ref))
      setPrompt({
        title: t('newWorktreeTitle'),
        hint: `${t('newWorktreeHint')} ${ref}`,
        submit: (path) => {
          if (path.trim() === '') {
            setError(t('worktreePathRequired'))

            return
          }

          void createWorktree(ref, path.trim(), { refs, root, run, services, t })
        },
      })
    },
    [refs, root, run, services, t],
  )

  /**
   * 由引用短名推出右键菜单需要的上下文。
   * @param target 引用短名；空串代表 HEAD 入口，换算成当前检出分支
   * @returns 上下文；游离 HEAD 上没有可操作的本地分支时返回 null
   */
  const branchContext = useCallback(
    (target: string): BranchMenuContext | null => {
      const currentBranch = (refs?.local ?? []).find((item) => item.isHead)?.name ?? ''
      // HEAD 入口等价于当前检出分支，两者右键弹出的是同一套菜单
      const name = target === '' ? currentBranch : target

      if (name === '') return null

      const local = (refs?.local ?? []).find((item) => item.name === name)
      const kind: BranchKind = (refs?.remote ?? []).some((item) => item.name === name)
        ? 'remote'
        : (refs?.tags ?? []).some((item) => item.name === name)
          ? 'tag'
          : 'local'

      return {
        target: name,
        kind,
        current: local?.isHead === true,
        currentBranch,
        upstream: local?.upstream ?? '',
      }
    },
    [refs],
  )

  /** 分支菜单动作需要的能力；动作本身由 branch-actions 按 id 分发。 */
  const branchActionDeps: BranchActionDeps = useMemo(
    () => ({
      t,
      services,
      root,
      refs,
      run,
      refresh: async (): Promise<void> => {
        await Promise.all([loadRefs(), loadCommits()])
      },
      newBranch: openNewBranch,
      rename: openRename,
      worktree: openWorktree,
      compare: (left, right, files) => {
        setCompare({
          title: t('compareTitle').replace('{left}', left).replace('{right}', right),
          left,
          right,
          files,
        })
      },
      diffWorktree: (ref, files) => {
        setCompare({ title: t('changesWithWorkingTree').replace('{branch}', ref), left: ref, right: null, files })
      },
    }),
    [loadCommits, loadRefs, openNewBranch, openRename, openWorktree, refs, root, run, services, t],
  )

  /**
   * 打开分支右键菜单。
   * @param event 鼠标事件
   * @param target 引用短名；空串代表 HEAD 入口
   */
  const openBranchMenu = useCallback(
    (event: React.MouseEvent, target: string): void => {
      const context = branchContext(target)

      // 游离 HEAD 上没有本地分支可操作，右键 HEAD 入口不弹菜单
      if (context === null) return

      const items = branchMenuItems(t, context, (id) => void runBranchAction(id, context, branchActionDeps))

      setMenu({ x: event.clientX, y: event.clientY, items })
    },
    [branchActionDeps, branchContext, t],
  )

  /** 当前检出提交的短 hash；分支列表里 isHead 的那条就是它。 */
  const headHash = useMemo(
    () => (refs === null ? '' : (refs.local.find((item) => item.isHead)?.hash ?? '')),
    [refs],
  )

  /** 可选作者列表：来自已加载提交，避免额外请求。 */
  const authors = useMemo(() => [...new Set(commits.map((commit) => commit.author))].sort(), [commits])

  /** 按搜索、作者、日期过滤后的提交。 */
  const visibleCommits = useMemo(() => {
    // 正则只编译一次：逐条编译在几千条提交时会把主线程占满
    const matches = compileTextMatcher(textSearch, useRegex, caseSensitive)
    const filtered = commits.filter(
      (commit) =>
        matches(commit) &&
        (userFilter === '' || commit.author === userFilter) &&
        matchesDate(commit, dateFilter),
    )

    return ascending ? [...filtered].reverse() : filtered
  }, [ascending, caseSensitive, commits, dateFilter, textSearch, useRegex, userFilter])

  /** 复制文本到剪贴板；失败时提示，异常不静默丢弃。 */
  const copyText = useCallback(
    (text: string): void => {
      void navigator.clipboard.writeText(text).then(
        () => services.toast('success', t('copied')),
        (copyError: unknown) => {
          console.error('[dsh-ide] Failed to copy text:', copyError)
          services.toast('error', t('copyFailed'))
        },
      )
    },
    [services, t],
  )

  /** 生成补丁文件并写进工作区根目录，路径提示在右下角。 */
  const savePatch = useCallback(
    async (commit: GitCommit): Promise<void> => {
      const written = await writePatch(root, commit)

      if (!written.ok) {
        setError(written.error.message)

        return
      }

      services.invalidate()
      services.toast('success', t('patchCreated').replace('{path}', written.value.path))
    },
    [root, services, t],
  )

  /** 打开提交信息编辑框；正文随详情一起加载，没读到详情时退回标题。 */
  const openEditMessage = useCallback(
    (commit: GitCommit): void => {
      const body = detail !== null && detail.commit.hash === commit.hash ? (detail.commit.body ?? '') : ''

      setMessageTarget(commit)
      setMessageValue(body === '' ? commit.subject : body)
    },
    [detail],
  )

  /** 打开新建标签对话框；提示里用短 hash，完整 hash 会把说明撑成一行。 */
  const openNewTag = useCallback(
    (commit: GitCommit): void => {
      setPromptValue('')
      setPrompt({
        title: t('newTagTitle'),
        hint: `${t('newTagAtHint')} ${commit.shortHash}`,
        submit: (name) => {
          if (name.trim() === '') {
            setError(t('tagNameRequired'))

            return
          }

          void run(() => tagCommit(root, name, commit.hash))
        },
      })
    },
    [root, run, t],
  )

  /**
   * 在 Log 里展示该提交所在的仓库历史。
   *
   * 插件只有一个 Log 视图，不像 IDEA 那样另开仓库窗口：清掉全部过滤、切回全部分支，
   * 再把焦点落到该提交上，等价于在仓库历史中定位这个版本。
   */
  const showRepositoryAt = useCallback((commit: GitCommit): void => {
    setTextSearch('')
    setUserFilter('')
    setDateFilter('all')
    setPathFilter('')
    setBranch('')
    setTreeSelected(null)
    setPendingReveal(commit.hash)
  }, [])

  /** 与工作区比较：打开比较窗口，右侧取工作区。 */
  const compareWithLocal = useCallback(
    async (commit: GitCommit): Promise<void> => {
      const result = await compareWorktree(root, commit.hash)

      if (!result.ok) {
        setError(result.error.message)

        return
      }

      setCompare({
        title: t('commitCompareTitle').replace('{hash}', commit.shortHash),
        left: commit.hash,
        right: null,
        files: result.value.files,
      })
    },
    [root, t],
  )

  /** 跳到子提交或父提交；目标不在已加载的列表里时提示。 */
  const goToCommit = useCallback(
    (commit: GitCommit, direction: 'child' | 'parent'): void => {
      const target = neighbourCommit(commit, visibleCommits, direction)

      if (target === undefined) {
        services.toast('info', t('commitNotLoaded'))

        return
      }

      setSelected(target)
    },
    [services, t, visibleCommits],
  )

  /** 执行提交右键菜单项。 */
  const runCommitAction = useCallback(
    (id: string, commit: GitCommit): void => {
      // 置灰项（Undo Commit / Fixup / Squash Into / 交互式变基）不会触发，故无分支
      if (id === 'copyRevision') copyText(commit.hash)
      if (id === 'createPatch') void savePatch(commit)
      if (id === 'cherryPick') void run(() => cherryPick(root, commit.hash))
      if (id === 'checkout') void run(() => checkout(root, commit.hash))
      if (id === 'showRepository') showRepositoryAt(commit)
      if (id === 'compareWithLocal') void compareWithLocal(commit)
      if (id === 'reset') setResetTarget(commit)
      if (id === 'revert') void run(() => revertCommit(root, commit.hash))
      if (id === 'editMessage') openEditMessage(commit)
      if (id === 'drop') void run(() => dropCommit(root, commit.hash))
      if (id === 'pushUpToHere') void run(() => pushUpToHere(root, commit.hash))
      if (id === 'newBranch') openNewBranch(commit.hash)
      if (id === 'newTag') openNewTag(commit)
      if (id === 'goChild') goToCommit(commit, 'child')
      if (id === 'goParent') goToCommit(commit, 'parent')
    },
    [
      compareWithLocal,
      copyText,
      goToCommit,
      openEditMessage,
      openNewBranch,
      openNewTag,
      root,
      run,
      savePatch,
      showRepositoryAt,
    ],
  )

  /**
   * 打开提交右键菜单。
   * @param event 鼠标事件
   * @param commit 提交
   */
  const openCommitMenu = useCallback(
    (event: React.MouseEvent, commit: GitCommit): void => {
      event.preventDefault()

      // 与 IDEA 一致：右键某行先把它设为当前选中，右侧详情随之切换
      setSelected(commit)

      const items = commitMenuItems(t, commitMenuContext(commit, visibleCommits, headHash), (id: string) =>
        runCommitAction(id, commit),
      )

      setMenu({ x: event.clientX, y: event.clientY, items })
    },
    [headHash, runCommitAction, t, visibleCommits],
  )

  // 换了仓库就换一份收藏：收藏按仓库根分开存储，直接读当前仓库的那份
  useEffect(() => {
    setFavorites(readFavorites(root))
  }, [root])

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
  }, [applyBranchFilter, branch, t])

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
  }, [t, userFilter])

  /** 打开过滤下拉菜单。 */
  const openFilterMenu = useCallback(
    (event: React.MouseEvent, kind: FilterKind): void => {
      // 分支过滤要列出分支与收藏，取值和其他三组不同，单独构建
      const items =
        kind === 'branch'
          ? branchFilterMenuItems(
              t,
              { branch, refs, favorites },
              { applyBranch: applyBranchFilter, selectBranch: selectBranchFilter },
            )
          : filterMenuItems(
              t,
              kind,
              { userFilter, authors, dateFilter, pathFilter, activeFile: services.activeFile() },
              { selectUser: selectUserFilter, setUserFilter, setDateFilter, setPathFilter },
            )

      setMenu({ x: event.clientX, y: event.clientY + 18, items })
    },
    [
      applyBranchFilter,
      authors,
      branch,
      dateFilter,
      favorites,
      pathFilter,
      refs,
      selectBranchFilter,
      selectUserFilter,
      services,
      t,
      userFilter,
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
          { id: 'dates', label: `${showDates ? '✓ ' : ''}${t('showTimestamps')}`, run: () => setShowDates((previous) => !previous) },
          { id: 'sort', label: t('sortByDate'), run: () => setAscending((previous) => !previous) },
          { id: 'clear', label: t('clearFilters'), separatorBefore: true, run: clearFilters },
        ],
      })
    },
    [branch, clearFilters, showDates, t, toggleAllBranches],
  )

  /** 工具栏与树的动作都作用在当前查看的分支上；所有分支与 HEAD 都按当前检出分支处理。 */
  const toolbarBranch = branch === 'HEAD' ? '' : branch

  /** 切换当前查看分支的收藏。 */
  const handleToggleFavorite = useCallback((): void => {
    if (toolbarBranch === '') return

    setFavorites(toggleFavorite(root, toolbarBranch))
  }, [root, toolbarBranch])

  /** 对当前查看的分支执行菜单动作；工具栏与右键菜单走同一条执行路径。 */
  const runOnSelectedBranch = useCallback(
    (id: string): void => {
      const context = branchContext(toolbarBranch)
      if (context === null) return

      void runBranchAction(id, context, branchActionDeps)
    },
    [branchActionDeps, branchContext, toolbarBranch],
  )

  return (
    <div className="flex h-full min-h-0">
      <LogToolbar
        t={t}
        branch={toolbarBranch}
        favorite={toolbarBranch !== '' && favorites.has(toolbarBranch)}
        onNewBranch={() => openNewBranch(toolbarBranch)}
        onCheckout={() => runOnSelectedBranch('checkout')}
        onDelete={() => runOnSelectedBranch('delete')}
        onShowDiff={() => runOnSelectedBranch('diffWorktree')}
        onSearch={() => searchRef.current?.focus()}
        onToggleFavorite={handleToggleFavorite}
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
        onContextMenu={openBranchMenu}
      />

      {/* 分支树与提交列表之间的分隔条：拖动改变左侧树的宽度 */}
      <SplitHandle orientation="vertical" anchor="front" current={() => branchWidth} onResize={resizeBranch} />

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
            onRefresh={() => void Promise.all([loadRefs(), loadCommits()])}
            onMore={openMoreMenu}
            onToggleAllBranches={toggleAllBranches}
          />

          {root === '' && <div className="p-3 text-xs text-secondary">{t('noSession')}</div>}
          {error !== '' && <div className="border-b border-line1 px-2 py-1.5 text-xs text-danger">{error}</div>}
          {loading && <div className="border-b border-line1 px-2 py-1 text-[11px] text-secondary">{t('loadingCommits')}</div>}
          {busy && <div className="border-b border-line1 px-2 py-1 text-[11px] text-secondary">{t('loading')}</div>}

          <CommitList
            t={t}
            commits={visibleCommits}
            selectedHash={selected?.hash ?? ''}
            onSelect={setSelected}
            onContextMenu={openCommitMenu}
            showDates={showDates}
            ascending={ascending}
            headHash={headHash}
            knownRefs={refs}
            onLoadMore={loadMoreCommits}
          />
        </div>

        {/* 提交列表与提交侧栏之间的分隔条：拖动改变右侧侧栏的宽度 */}
        <SplitHandle orientation="vertical" anchor="back" current={() => sidebarWidth} onResize={resizeSidebar} />

        <div className="flex shrink-0 flex-col border-l border-line1" style={{ width: sidebarWidth }}>
          <CommitSidebar t={t} services={services} detail={detail} root={root} />
        </div>
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

      {resetTarget !== null && (
        <ResetDialog
          t={t}
          target={resetTarget}
          branch={refs?.head ?? ''}
          dialogSizes={services.dialogSizes}
          onCancel={() => setResetTarget(null)}
          onReset={(mode: ResetMode) => {
            const target = resetTarget
            setResetTarget(null)
            void run(() => resetBranch(root, target.hash, mode))
          }}
        />
      )}

      {messageTarget !== null && (
        <EditMessageDialog
          t={t}
          commit={messageTarget}
          value={messageValue}
          onChange={setMessageValue}
          dialogSizes={services.dialogSizes}
          onCancel={() => setMessageTarget(null)}
          onConfirm={() => {
            const message = messageValue.trim()

            // 空消息会被 git 拒绝，提前在界面上拦住，避免一次必然失败的命令
            if (message === '') {
              setError(t('messageRequired'))

              return
            }

            setMessageTarget(null)
            void run(() => amendCommitMessage(root, message))
          }}
        />
      )}

      {/* 分支比较窗口：Compare with 与 Show Diff with Working Tree 共用 */}
      {compare !== null && (
        <BranchDiffDialog
          t={t}
          services={services}
          root={root}
          title={compare.title}
          left={compare.left}
          right={compare.right}
          files={compare.files}
          onClose={() => setCompare(null)}
        />
      )}
    </div>
  )
}
