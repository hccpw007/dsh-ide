/**
 * Git 面板的 Log 页签。
 *
 * 布局与 IDEA 一致：最左是竖向工具栏，其右是分支树，中间提交列表，右侧文件树与
 * 提交详情；过滤栏横跨列表与右侧区域。所有分支操作、提交操作都通过右键菜单触发，并写入控制台。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { ApiResult } from '../../../common/api'
import type { Translate } from '../../../types/plugin'
import type { IdeServices } from '../../shell/contract'

import {
  checkout,
  cherryPick,
  createBranch,
  deleteBranch,
  fetchAll,
  merge,
  pull,
  push,
  rebase,
  readCommit,
  readLog,
  readRefs,
  renameBranch,
  resetBranch,
  revertCommit,
  type GitCommit,
  type GitCommitDetail,
  type GitRefs,
  type GitRunOutput,
} from './api'
import { BranchTree } from './BranchTree'
import { CommitList } from './CommitList'
import { CommitSidebar } from './CommitSidebar'
import { recordGitConsole } from './console-store'
import { PromptDialog, ResetDialog } from './LogDialogs'
import { compileTextMatcher, matchesDate } from './log-filter'
import { branchMenuItems, commitMenuItems, filterMenuItems, type FilterKind } from './log-menus'
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
}

/**
 * 渲染 Log 页签。
 * @param props 见 LogTabProps
 * @returns 分支树、过滤栏、提交列表与提交侧栏
 */
export function LogTab({ t, services, root }: LogTabProps): React.ReactElement {
  const [refs, setRefs] = useState<GitRefs | null>(null)
  const [branch, setBranch] = useState('')
  const [allBranches, setAllBranches] = useState(false)
  const [pathFilter, setPathFilter] = useState('')
  const [commits, setCommits] = useState<GitCommit[]>([])
  const [loading, setLoading] = useState(false)

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
        branch,
        all: allBranches,
        path: pathFilter,
        skip,
        limit: COMMIT_LIMIT,
      })

      if (!append) setLoading(false)

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
    [allBranches, branch, pathFilter, root],
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
  }, [allBranches, branch, pathFilter])

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
   * 执行一次写操作并记录控制台。
   * @param display 失败时用于回显的命令行
   * @param action 实际调用
   */
  const run = useCallback(
    async (display: string, action: () => Promise<ApiResult<GitRunOutput>>): Promise<boolean> => {
      setBusy(true)

      try {
        const result = await action()

        if (!result.ok) {
          recordGitConsole({ cwd: root, command: display, stdout: '', stderr: result.error.message, ok: false })
          setError(result.error.message)

          return false
        }

        recordGitConsole({
          cwd: root,
          command: result.value.command,
          stdout: result.value.stdout,
          stderr: result.value.stderr,
          ok: true,
        })
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

          void run(`git checkout -b ${name} ${start}`, () => createBranch(root, name, start))
        },
      })
    },
    [root, run, t],
  )

  /**
   * 远端命令成功后弹右下角提示。
   * @param task 命令执行结果；false 表示失败，失败已由 run 报错
   * @param key 提示文案的 key
   */
  const toastOnSuccess = useCallback(
    async (task: Promise<boolean>, key: 'fetchSuccess' | 'pullSuccess' | 'pushSuccess'): Promise<void> => {
      if (await task) services.toast('info', t(key))
    },
    [services, t],
  )

  /** 执行分支右键菜单项。 */
  const runBranchAction = useCallback(
    (id: string, target: string): void => {
      const isRemote = (refs?.remote ?? []).some((item) => item.name === target)
      const short = target.includes('/') ? target.slice(target.indexOf('/') + 1) : target

      if (id === 'checkout') {
        const localExists = (refs?.local ?? []).some((item) => item.name === short)

        if (isRemote && !localExists) {
          void run(`git checkout -b ${short} ${target}`, () => createBranch(root, short, target))
        } else {
          void run(`git checkout ${isRemote ? short : target}`, () => checkout(root, isRemote ? short : target))
        }
      }

      if (id === 'newBranch') openNewBranch(target)
      if (id === 'rename') {
        setPromptValue(target)
        setPrompt({
          title: t('renameBranchTitle'),
          hint: target,
          submit: (name) => {
            if (name.trim() === '') {
              setError(t('branchNameRequired'))

              return
            }

            void run(`git branch -m ${target} ${name}`, () => renameBranch(root, target, name))
          },
        })
      }
      if (id === 'delete') void run(`git branch -d ${target}`, () => deleteBranch(root, target))
      if (id === 'fetch') void toastOnSuccess(run('git fetch --all --prune', () => fetchAll(root)), 'fetchSuccess')
      if (id === 'pull') void toastOnSuccess(run('git pull --no-edit', () => pull(root)), 'pullSuccess')
      if (id === 'push') void toastOnSuccess(run('git push origin HEAD', () => push(root)), 'pushSuccess')
      if (id === 'merge') void run(`git merge --no-edit ${target}`, () => merge(root, target))
      if (id === 'rebase') void run(`git rebase ${target}`, () => rebase(root, target))
      if (id === 'copy') {
        void navigator.clipboard.writeText(target).then(
          () => services.notify('success', t('copied')),
          (copyError: unknown) => {
            console.error('[dsh-ide] Failed to copy branch name:', copyError)
            services.notify('error', t('copyFailed'))
          },
        )
      }
    },
    [openNewBranch, refs, root, run, services, t, toastOnSuccess],
  )

  /**
   * 打开分支右键菜单。
   * @param event 鼠标事件
   * @param target 分支短名
   */
  const openBranchMenu = useCallback(
    (event: React.MouseEvent, target: string): void => {
      const isRemote = (refs?.remote ?? []).some((item) => item.name === target)
      const items = branchMenuItems(t, target, isRemote, runBranchAction)

      setMenu({ x: event.clientX, y: event.clientY, items })
    },
    [refs, runBranchAction, t],
  )

  /** 执行提交右键菜单项。 */
  const runCommitAction = useCallback(
    (id: string, commit: GitCommit): void => {
      if (id === 'checkout') void run(`git checkout ${commit.hash}`, () => checkout(root, commit.hash))
      if (id === 'newBranch') openNewBranch(commit.hash)
      if (id === 'cherryPick') void run(`git cherry-pick ${commit.hash}`, () => cherryPick(root, commit.hash))
      if (id === 'revert') void run(`git revert --no-edit ${commit.hash}`, () => revertCommit(root, commit.hash))
      if (id === 'reset') setResetTarget(commit)
      if (id === 'copyHash') {
        void navigator.clipboard.writeText(commit.hash).then(
          () => services.notify('success', t('copied')),
          (copyError: unknown) => {
            console.error('[dsh-ide] Failed to copy commit hash:', copyError)
            services.notify('error', t('copyFailed'))
          },
        )
      }
      if (id === 'copySubject') {
        void navigator.clipboard.writeText(commit.subject).then(
          () => services.notify('success', t('copied')),
          (copyError: unknown) => {
            console.error('[dsh-ide] Failed to copy commit subject:', copyError)
            services.notify('error', t('copyFailed'))
          },
        )
      }
    },
    [openNewBranch, root, run, services, t],
  )

  /**
   * 打开提交右键菜单。
   * @param event 鼠标事件
   * @param commit 提交
   */
  const openCommitMenu = useCallback(
    (event: React.MouseEvent, commit: GitCommit): void => {
      event.preventDefault()

      const items = commitMenuItems(t, (id: string) => runCommitAction(id, commit))

      setMenu({ x: event.clientX, y: event.clientY, items })
    },
    [runCommitAction, t],
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

  /**
   * 在过滤结果里选中上一条/下一条提交。
   * @param step 方向
   */
  const selectNeighbor = useCallback(
    (step: 1 | -1): void => {
      if (visibleCommits.length === 0) return

      const current = visibleCommits.findIndex((commit) => commit.hash === selected?.hash)
      const next = (current + step + visibleCommits.length) % visibleCommits.length
      const target = visibleCommits[next]
      if (target !== undefined) setSelected(target)
    },
    [selected, visibleCommits],
  )

  /** 清空全部过滤条件。 */
  const clearFilters = useCallback((): void => {
    setTextSearch('')
    setUseRegex(false)
    setCaseSensitive(false)
    setUserFilter('')
    setDateFilter('all')
    setPathFilter('')
    setAllBranches(false)
    setBranch('')
  }, [])

  /** 打开过滤下拉菜单。 */
  const openFilterMenu = useCallback(
    (event: React.MouseEvent, kind: FilterKind): void => {
      const items = filterMenuItems(
        t,
        kind,
        { allBranches, branch, userFilter, authors, dateFilter, pathFilter, activeFile: services.activeFile() },
        { setAllBranches, setUserFilter, setDateFilter, setPathFilter },
      )

      setMenu({ x: event.clientX, y: event.clientY + 18, items })
    },
    [allBranches, authors, branch, dateFilter, pathFilter, services, t, userFilter],
  )

  /** 打开右上角更多菜单。 */
  const openMoreMenu = useCallback(
    (event: React.MouseEvent): void => {
      setMenu({
        x: event.clientX - 180,
        y: event.clientY + 16,
        items: [
          { id: 'all', label: `${allBranches ? '✓ ' : ''}${t('showAllBranches')}`, run: () => setAllBranches((previous) => !previous) },
          { id: 'dates', label: `${showDates ? '✓ ' : ''}${t('showTimestamps')}`, run: () => setShowDates((previous) => !previous) },
          { id: 'sort', label: t('sortByDate'), run: () => setAscending((previous) => !previous) },
          { id: 'clear', label: t('clearFilters'), separatorBefore: true, run: clearFilters },
        ],
      })
    },
    [allBranches, clearFilters, showDates, t],
  )

  return (
    <div className="flex h-full min-h-0">
      <LogToolbar
        t={t}
        branch={branch}
        onNewBranch={() => openNewBranch(branch)}
        onCheckout={() => runBranchAction('checkout', branch)}
        onDelete={() => runBranchAction('delete', branch)}
        onSearch={() => searchRef.current?.focus()}
      />

      <BranchTree
        t={t}
        refs={refs}
        active={branch}
        search={branchSearch}
        onSearchChange={setBranchSearch}
        onSelect={(value) => {
          setAllBranches(false)
          setBranch(value)
          setPathFilter('')
        }}
        onContextMenu={openBranchMenu}
      />

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
          allBranches={allBranches}
          branch={branch}
          userFilter={userFilter}
          dateFilter={dateFilter}
          pathFilter={pathFilter}
          showDates={showDates}
          loading={loading}
          onFilterMenu={openFilterMenu}
          onToggleSort={() => setAscending((previous) => !previous)}
          onRefresh={() => void Promise.all([loadRefs(), loadCommits()])}
          onMore={openMoreMenu}
          onToggleAllBranches={() => setAllBranches((previous) => !previous)}
          onToggleDates={() => setShowDates((previous) => !previous)}
          onPrevious={() => selectNeighbor(-1)}
          onNext={() => selectNeighbor(1)}
          onClear={clearFilters}
        />

        {root === '' && <div className="p-3 text-xs text-secondary">{t('noSession')}</div>}
        {error !== '' && <div className="border-b border-line1 px-2 py-1.5 text-xs text-danger">{error}</div>}
        {loading && <div className="border-b border-line1 px-2 py-1 text-[11px] text-secondary">{t('loadingCommits')}</div>}
        {busy && <div className="border-b border-line1 px-2 py-1 text-[11px] text-secondary">{t('loading')}</div>}

        <div className="flex min-h-0 flex-1">
          <CommitList
            t={t}
            commits={visibleCommits}
            selectedHash={selected?.hash ?? ''}
            onSelect={setSelected}
            onContextMenu={openCommitMenu}
            showDates={showDates}
            ascending={ascending}
            headHash={headHash}
            onLoadMore={loadMoreCommits}
          />

          <div className="flex w-[400px] shrink-0 flex-col border-l border-line1">
            <CommitSidebar
              t={t}
              services={services}
              detail={detail}
              root={root}
              onClose={() => {
                setSelected(null)
                setDetail(null)
              }}
            />
          </div>
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
          onCancel={() => setResetTarget(null)}
          onReset={(mode) => {
            const target = resetTarget
            setResetTarget(null)
            void run(`git reset --${mode} ${target.hash}`, () => resetBranch(root, target.hash, mode))
          }}
        />
      )}
    </div>
  )
}
