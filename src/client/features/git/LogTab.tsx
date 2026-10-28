/**
 * Git 面板的 Log 页签。
 *
 * 布局与 IDEA 一致：左侧分支树，中间提交列表，右侧文件树与提交详情；过滤栏横跨
 * 列表与右侧区域。所有分支操作、提交操作都通过右键菜单触发，并写入控制台。
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'

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
import { LogFilterBar, type DateFilter } from './LogFilterBar'
import { ContextMenu, type MenuItem, type MenuState } from './menu'

/** 一次加载的提交数；足够覆盖面板滚动范围，不做无限分页。 */
const COMMIT_LIMIT = 300

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
 * 判断提交是否命中文本搜索。
 * @param commit 提交
 * @param query 搜索文本
 * @param regex 是否按正则解析
 * @param caseSensitive 是否区分大小写
 * @returns 命中时返回 true
 */
function matchesText(commit: GitCommit, query: string, regex: boolean, caseSensitive: boolean): boolean {
  if (query === '') return true

  const haystack = `${commit.subject}\n${commit.author}\n${commit.hash}\n${commit.shortHash}`

  if (regex) {
    try {
      return new RegExp(query, caseSensitive ? '' : 'i').test(haystack)
    } catch (error) { // 用户正在输入合法正则时按字面量兜底，避免输入过程闪错
      console.error('[dsh-ide] Invalid Git log regex, falling back to literal search:', error)
    }
  }

  return caseSensitive ? haystack.includes(query) : haystack.toLowerCase().includes(query.toLowerCase())
}

/**
 * 判断提交是否落在日期范围内。
 * @param commit 提交
 * @param filter 日期选项
 * @returns 命中时返回 true
 */
function matchesDate(commit: GitCommit, filter: DateFilter): boolean {
  if (filter === 'all') return true

  const time = new Date(commit.date).getTime()
  if (Number.isNaN(time)) return true

  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const days = filter === 'today' ? 1 : filter === 'week' ? 7 : 30

  return time >= start - (days - 1) * 24 * 60 * 60 * 1000
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

  /** 读取提交列表。 */
  const loadCommits = useCallback(async (): Promise<void> => {
    if (root === '') return

    setLoading(true)

    const result = await readLog(root, {
      branch,
      all: allBranches,
      path: pathFilter,
      limit: COMMIT_LIMIT,
    })

    setLoading(false)

    if (!result.ok) {
      if (result.error.code !== 'GIT_NOT_REPOSITORY') setError(result.error.message)
      setCommits([])

      return
    }

    setError('')
    setCommits(result.value.commits)
  }, [allBranches, branch, pathFilter, root])

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
      if (id === 'fetch') void run('git fetch --all --prune', () => fetchAll(root))
      if (id === 'pull') void run('git pull --no-edit', () => pull(root))
      if (id === 'push') void run('git push origin HEAD', () => push(root))
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
    [openNewBranch, refs, root, run, services, t],
  )

  /**
   * 打开分支右键菜单。
   * @param event 鼠标事件
   * @param target 分支短名
   */
  const openBranchMenu = useCallback(
    (event: React.MouseEvent, target: string): void => {
      const isRemote = (refs?.remote ?? []).some((item) => item.name === target)
      const items: MenuItem[] = [
        { id: 'checkout', label: t('checkout'), run: () => runBranchAction('checkout', target) },
        { id: 'newBranch', label: t('newBranchFrom'), run: () => runBranchAction('newBranch', target) },
        { id: 'rename', label: t('renameBranch'), disabled: isRemote, run: () => runBranchAction('rename', target) },
        { id: 'merge', label: t('mergeIntoCurrent'), separatorBefore: true, run: () => runBranchAction('merge', target) },
        { id: 'rebase', label: t('rebaseCurrent'), run: () => runBranchAction('rebase', target) },
        { id: 'fetch', label: t('fetch'), separatorBefore: true, run: () => runBranchAction('fetch', target) },
        { id: 'pull', label: t('pull'), run: () => runBranchAction('pull', target) },
        { id: 'push', label: t('push'), run: () => runBranchAction('push', target) },
        { id: 'copy', label: t('copyBranchName'), separatorBefore: true, run: () => runBranchAction('copy', target) },
        {
          id: 'delete',
          label: t('deleteBranch'),
          danger: true,
          disabled: isRemote,
          run: () => runBranchAction('delete', target),
        },
      ]

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

      const items: MenuItem[] = [
        { id: 'checkout', label: t('checkoutRevision'), run: () => runCommitAction('checkout', commit) },
        { id: 'newBranch', label: t('newBranchHere'), run: () => runCommitAction('newBranch', commit) },
        { id: 'cherryPick', label: t('cherryPick'), separatorBefore: true, run: () => runCommitAction('cherryPick', commit) },
        { id: 'revert', label: t('revertCommit'), run: () => runCommitAction('revert', commit) },
        { id: 'reset', label: t('resetHere'), danger: true, run: () => runCommitAction('reset', commit) },
        { id: 'copyHash', label: t('copyHash'), separatorBefore: true, run: () => runCommitAction('copyHash', commit) },
        { id: 'copySubject', label: t('copySubject'), run: () => runCommitAction('copySubject', commit) },
      ]

      setMenu({ x: event.clientX, y: event.clientY, items })
    },
    [runCommitAction, t],
  )

  /** 可选作者列表：来自已加载提交，避免额外请求。 */
  const authors = useMemo(() => [...new Set(commits.map((commit) => commit.author))].sort(), [commits])

  /** 按搜索、作者、日期过滤后的提交。 */
  const visibleCommits = useMemo(() => {
    const filtered = commits.filter(
      (commit) =>
        matchesText(commit, textSearch, useRegex, caseSensitive) &&
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
    (event: React.MouseEvent, kind: 'branch' | 'user' | 'date' | 'paths'): void => {
      const items: MenuItem[] = []

      if (kind === 'branch') {
        items.push(
          { id: 'all', label: `${allBranches ? '✓ ' : ''}${t('all')}`, run: () => setAllBranches(true) },
          {
            id: 'current',
            label: `${allBranches ? '' : '✓ '}${branch === '' ? t('headCurrent') : branch}`,
            run: () => setAllBranches(false),
          },
        )
      }

      if (kind === 'user') {
        items.push(
          { id: 'all', label: `${userFilter === '' ? '✓ ' : ''}${t('all')}`, run: () => setUserFilter('') },
          ...authors.map((author) => ({
            id: `user:${author}`,
            label: `${userFilter === author ? '✓ ' : ''}${author}`,
            run: () => setUserFilter(author),
          })),
        )
      }

      if (kind === 'date') {
        const options: { id: DateFilter; label: string }[] = [
          { id: 'all', label: t('all') },
          { id: 'today', label: t('today') },
          { id: 'week', label: t('lastWeek') },
          { id: 'month', label: t('lastMonth') },
        ]

        items.push(
          ...options.map((option) => ({
            id: option.id,
            label: `${dateFilter === option.id ? '✓ ' : ''}${option.label}`,
            run: () => setDateFilter(option.id),
          })),
        )
      }

      if (kind === 'paths') {
        const active = services.activeFile()

        items.push(
          { id: 'all', label: `${pathFilter === '' ? '✓ ' : ''}${t('all')}`, run: () => setPathFilter('') },
          ...(active === null
            ? []
            : [
                {
                  id: 'active',
                  label: `${pathFilter === active ? '✓ ' : ''}${active}`,
                  run: () => setPathFilter(active),
                },
              ]),
        )
      }

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
