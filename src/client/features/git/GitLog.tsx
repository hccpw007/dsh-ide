/**
 * Git 面板的「日志」页签。
 *
 * 与 IDEA 的 Log 一致：左侧分支树决定看哪条分支，中间是提交列表，选中提交后
 * 下方显示提交详情与文件列表；点文件把右侧切成交付差异，返回后回到列表。
 */
import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'

import { cn } from '../../../common/cn'
import type { ApiResult } from '../../../common/api'
import type { DiffSource, FeatureViewProps } from '../../shell/contract'

import { BranchTree } from './BranchTree'
import { DiffPane } from './DiffPane'
import { recordGitConsole } from './console-store'
import {
  checkout,
  createBranch,
  deleteBranch,
  fetchAll,
  gitOutputOf,
  merge,
  pull,
  push,
  readCommit,
  readLog,
  readRefs,
  rebase,
  renameBranch,
  type GitCommit,
  type GitCommitDetail,
  type GitRefs,
} from './api'

/** 一次加载的提交数；足够覆盖面板滚动范围，不做无限分页。 */
const COMMIT_LIMIT = 200

/** 右键菜单项。 */
const MENU_ITEMS: ReadonlyArray<{ id: string; danger?: boolean }> = [
  { id: 'checkout' },
  { id: 'newBranch' },
  { id: 'rename' },
  { id: 'merge' },
  { id: 'rebase' },
  { id: 'fetch' },
  { id: 'pull' },
  { id: 'push' },
  { id: 'delete', danger: true },
]

/** 正在等待输入的操作。 */
type Prompt = { kind: 'create'; start: string } | { kind: 'rename'; from: string }

/**
 * 渲染日志页签。
 * @param props 见 FeatureViewProps
 * @returns 分支树、提交列表与提交详情
 */
export function GitLog({ t, services }: FeatureViewProps): React.ReactElement {
  const [refs, setRefs] = useState<GitRefs | null>(null)
  /** 当前查看的分支；空串表示 HEAD（当前分支）。 */
  const [branch, setBranch] = useState('')
  const [search, setSearch] = useState('')
  const [textFilter, setTextFilter] = useState('')
  const [commits, setCommits] = useState<GitCommit[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<GitCommit | null>(null)
  const [detail, setDetail] = useState<GitCommitDetail | null>(null)
  /** 正在查看的提交文件差异；非空时右侧整体显示差异。 */
  const [fileDiff, setFileDiff] = useState<{ hash: string; path: string } | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; branch: string } | null>(null)
  const [prompt, setPrompt] = useState<Prompt | null>(null)
  const [promptText, setPromptText] = useState('')

  // 会话在首条消息之后才绑定 cwd，订阅后工作区变化会重新加载日志
  const root = useSyncExternalStore(
    (listener) => services.subscribeRoot(listener),
    () => services.root,
    () => services.root,
  )

  /** 读取分支、远程与标签。 */
  const refreshRefs = useCallback(async (): Promise<void> => {
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

  /** 读取当前分支的提交列表。 */
  const loadCommits = useCallback(async (): Promise<void> => {
    if (root === '') return

    setLoading(true)

    const result = await readLog(root, 0, COMMIT_LIMIT, branch)

    setLoading(false)

    if (!result.ok) {
      if (result.error.code !== 'GIT_NOT_REPOSITORY') setError(result.error.message)
      setCommits([])

      return
    }

    setError('')
    setCommits(result.value.commits)
  }, [branch, root])

  useEffect(() => {
    void refreshRefs()
  }, [refreshRefs])

  useEffect(() => {
    void loadCommits()
  }, [loadCommits])

  /** 分支或提交过滤变化时清空选中，避免显示与列表不一致的详情。 */
  useEffect(() => {
    setSelected(null)
    setDetail(null)
    setFileDiff(null)
  }, [branch])

  /**
   * 执行一次写操作并记录到控制台。
   * @param command 等价的 git 命令行
   * @param action 实际操作
   */
  const run = useCallback(
    async (command: string, action: () => Promise<ApiResult<unknown>>): Promise<void> => {
      setBusy(true)

      try {
        const result = await action()
        recordGitConsole(command, result.ok, gitOutputOf(result))

        if (!result.ok) {
          setError(result.error.message)

          return
        }

        setError('')
        await Promise.all([refreshRefs(), loadCommits()])
        services.refreshGitStatus()
        services.invalidate()
      } finally {
        setBusy(false)
      }
    },
    [loadCommits, refreshRefs, services],
  )

  /** 选中一条提交并读取详情。 */
  const openCommit = useCallback(
    async (commit: GitCommit): Promise<void> => {
      setSelected(commit)
      setFileDiff(null)

      const result = await readCommit(root, commit.hash)

      if (!result.ok) {
        setError(result.error.message)

        return
      }

      setDetail(result.value)
    },
    [root],
  )

  /** 提交输入框回车或点确定。 */
  const submitPrompt = useCallback(async (): Promise<void> => {
    const name = promptText.trim()
    if (prompt === null || name === '') return

    const current = prompt
    setPrompt(null)

    if (current.kind === 'create') {
      const start = current.start === '' ? '' : current.start
      await run(`git checkout -b ${name}${start === '' ? '' : ` ${start}`}`, () => createBranch(root, name, start))
    } else {
      await run(`git branch -m ${current.from} ${name}`, () => renameBranch(root, current.from, name))
    }
  }, [prompt, promptText, root, run])

  /** 执行右键菜单项。 */
  const runMenu = useCallback(
    (id: string, target: string): void => {
      if (id === 'checkout') void run(`git checkout ${target}`, () => checkout(root, target))
      if (id === 'newBranch') {
        setPrompt({ kind: 'create', start: target })
        setPromptText('')
      }
      if (id === 'rename') {
        setPrompt({ kind: 'rename', from: target })
        setPromptText(target)
      }
      if (id === 'merge') void run(`git merge --no-edit ${target}`, () => merge(root, target))
      if (id === 'rebase') void run(`git rebase ${target}`, () => rebase(root, target))
      if (id === 'fetch') void run('git fetch --all --prune', () => fetchAll(root))
      if (id === 'pull') void run('git pull --no-edit', () => pull(root))
      if (id === 'push') void run('git push origin HEAD', () => push(root))
      if (id === 'delete') void run(`git branch -d ${target}`, () => deleteBranch(root, target, false))
    },
    [root, run],
  )

  /** 按右上角文本过滤已加载的提交。 */
  const visibleCommits = useMemo(() => {
    const keyword = textFilter.trim().toLowerCase()
    if (keyword === '') return commits

    return commits.filter(
      (commit) =>
        commit.subject.toLowerCase().includes(keyword) ||
        commit.author.toLowerCase().includes(keyword) ||
        commit.hash.toLowerCase().includes(keyword),
    )
  }, [commits, textFilter])

  /** 提交文件差异的来源；fileDiff 变化时引用保持稳定。 */
  const diffSource = useMemo<DiffSource | null>(
    () =>
      fileDiff === null
        ? null
        : { kind: 'commits', from: `${fileDiff.hash}~1`, to: fileDiff.hash, path: fileDiff.path },
    [fileDiff],
  )

  return (
    <div className="flex h-full min-h-0">
      <BranchTree
        t={t}
        refs={refs}
        active={branch}
        search={search}
        onSearchChange={setSearch}
        onSelect={setBranch}
        onContextMenu={(event, target) => setMenu({ x: event.clientX, y: event.clientY, branch: target })}
        onCreate={() => {
          setPrompt({ kind: 'create', start: '' })
          setPromptText('')
        }}
        disabled={busy}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* 过滤栏：文本 or 哈希、当前分支、刷新 */}
        <div className="flex h-8 shrink-0 items-center gap-1 border-b border-line1 px-2 text-xs">
          <input
            value={textFilter}
            onChange={(event) => setTextFilter(event.target.value)}
            placeholder={t('textSearchPlaceholder')}
            className="min-w-0 flex-1 rounded border border-line2 bg-base px-1.5 py-0.5 text-xs text-primary outline-none focus:border-line4"
          />

          {/* 当前查看的分支；点 × 回到当前分支 */}
          <button
            type="button"
            onClick={() => setBranch('')}
            title={t('clearBranchFilter')}
            className="shrink-0 rounded border border-line2 px-1.5 py-0.5 text-secondary hover:text-primary"
          >
            {t('branchLabel')} {branch === '' ? t('headShort') : branch}
            {branch !== '' && <span className="ml-1">×</span>}
          </button>

          <button
            type="button"
            onClick={() => {
              void refreshRefs()
              void loadCommits()
            }}
            disabled={loading}
            className="shrink-0 rounded px-1.5 py-0.5 text-info hover:bg-layer2 disabled:opacity-40"
          >
            {t('refresh')}
          </button>
        </div>

        {root === '' && <div className="p-3 text-xs text-secondary">{t('noSession')}</div>}

        {error !== '' && <div className="border-b border-line1 px-2 py-1.5 text-xs text-danger">{error}</div>}

        {root !== '' && diffSource !== null ? (
          <DiffPane
            t={t}
            services={services}
            source={diffSource}
            actions={[{ label: t('backToLog'), run: () => setFileDiff(null) }]}
          />
        ) : (
          <>
            {/* 提交列表 */}
            <div className="min-h-0 flex-1 overflow-auto">
              {visibleCommits.map((commit) => (
                <button
                  key={commit.hash}
                  type="button"
                  onClick={() => void openCommit(commit)}
                  className={cn(
                    'flex w-full items-center gap-2 border-b border-line1 px-2 py-1 text-left text-xs',
                    selected?.hash === commit.hash ? 'bg-layer2' : 'hover:bg-layer2',
                  )}
                >
                  {/* 提交节点：彩色圆点，与 IDEA 的分支图对应 */}
                  <span className="w-3 shrink-0 text-center text-[10px] text-info">●</span>

                  {/* 提交标题 */}
                  <span className="min-w-0 flex-1 truncate text-primary">{commit.subject}</span>

                  {/* 作者 */}
                  <span className="hidden w-24 shrink-0 truncate text-[11px] text-secondary sm:block">{commit.author}</span>

                  {/* 提交日期 */}
                  <span className="w-20 shrink-0 text-[11px] text-secondary">{commit.date.slice(0, 10)}</span>

                  {/* 短哈希 */}
                  <span className="w-16 shrink-0 font-mono text-[11px] text-info">{commit.shortHash}</span>
                </button>
              ))}

              {visibleCommits.length === 0 && !loading && root !== '' && (
                <div className="p-3 text-xs text-secondary">{t('empty')}</div>
              )}

              {loading && <div className="p-3 text-xs text-secondary">{t('loading')}</div>}
            </div>

            {/* 提交详情：未选中时显示占位，选中后显示文件列表 */}
            <div className="flex h-[220px] shrink-0 flex-col border-t border-line1">
              <div className="flex h-7 shrink-0 items-center border-b border-line1 px-2 text-xs text-secondary">
                {/* 详情区标题 */}
                {t('commitDetails')}
              </div>

              <div className="min-h-0 flex-1 overflow-auto">
                {selected === null ? (
                  <div className="p-3 text-xs text-secondary">{t('selectCommit')}</div>
                ) : (
                  <>
                    {/* 提交元信息 */}
                    <div className="border-b border-line1 px-2 py-1.5 text-xs">
                      <div className="mb-1 text-primary">{selected.subject}</div>
                      <div className="text-secondary">
                        {selected.author} · {selected.date} · <span className="font-mono text-info">{selected.shortHash}</span>
                      </div>
                      {selected.body !== undefined && selected.body.trim() !== '' && (
                        <pre className="mt-1 whitespace-pre-wrap text-secondary">{selected.body}</pre>
                      )}
                    </div>

                    {/* 逐文件改动统计；点击打开该提交下的文件差异 */}
                    {(detail?.files ?? []).map((file) => (
                      <button
                        key={file.path}
                        type="button"
                        onClick={() => setFileDiff({ hash: selected.hash, path: file.path })}
                        className="flex w-full items-center gap-2 px-2 py-0.5 text-left text-xs hover:bg-layer2"
                      >
                        <span className="min-w-0 flex-1 truncate text-primary">{file.path}</span>
                        <span className="shrink-0 text-success">+{file.added}</span>
                        <span className="shrink-0 text-danger">−{file.removed}</span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* 分支右键菜单 */}
      {menu !== null && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setMenu(null)} />

          <div
            className="fixed z-[9999] min-w-[180px] rounded-md border border-line2 bg-overlay py-1 shadow-lg"
            style={{ left: menu.x, top: menu.y }}
          >
            {MENU_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setMenu(null)
                  runMenu(item.id, menu.branch)
                }}
                className={cn(
                  'block w-full px-3 py-[5px] text-left text-xs transition-colors hover:bg-layer2',
                  item.danger === true ? 'text-danger' : 'text-primary',
                )}
              >
                {/* 菜单项名称 */}
                {t(`menu.${item.id}`)}
              </button>
            ))}
          </div>
        </>
      )}

      {prompt !== null && (
        <div className="fixed inset-0 z-[9998] flex items-start justify-center bg-black/20 pt-24">
          <div className="w-72 rounded-md border border-line2 bg-overlay p-3 shadow-lg">
            {/* 对话框标题 */}
            <div className="mb-2 text-xs text-primary">
              {prompt.kind === 'create' ? t('promptCreateBranch') : t('promptRenameBranch')}
            </div>

            <input
              autoFocus
              value={promptText}
              onChange={(event) => setPromptText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submitPrompt()
                if (event.key === 'Escape') setPrompt(null)
              }}
              className="mb-2 w-full rounded border border-line2 bg-base px-2 py-1 text-xs text-primary outline-none focus:border-line4"
            />

            <div className="flex justify-end gap-2">
              {/* 取消 */}
              <button
                type="button"
                onClick={() => setPrompt(null)}
                className="rounded border border-line2 px-2 py-1 text-xs text-primary hover:bg-layer2"
              >
                {t('cancel')}
              </button>

              {/* 确认 */}
              <button
                type="button"
                onClick={() => void submitPrompt()}
                className="rounded border border-line2 px-2 py-1 text-xs text-primary hover:bg-layer2"
              >
                {t('confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
