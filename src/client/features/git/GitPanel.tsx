/**
 * 版本控制状态工具窗口。
 *
 * 四组变更（冲突 / 已暂存 / 更改 / 未跟踪），行内可暂存、取消暂存、丢弃，
 * 分组可批量操作；点击文件打开工作区差异；顶部是提交信息输入框。
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'

import { cn } from '../../../common/cn'
import type { FeatureViewProps } from '../../shell/contract'

import {
  checkout,
  commit,
  createBranch,
  deleteBranch,
  discard,
  fetchAll,
  merge,
  pull,
  push,
  readOperationState,
  readRefs,
  readStashes,
  readStatus,
  stage,
  stash,
  stashApply,
  unstage,
  type GitChange,
  type GitOperationState,
  type GitRefs,
  type GitStatus,
} from './api'

/** 变更分组。 */
interface Group {
  /** 分组键。 */
  key: 'conflicted' | 'staged' | 'unstaged' | 'untracked'
  /** 分组标题（语言 key）。 */
  label: string
  /** 该组的变更。 */
  items: GitChange[]
}

/**
 * 状态字母到颜色的映射。
 * @param letter 状态字母
 * @returns Tailwind 文本色类名
 */
function letterTone(letter: string): string {
  if (letter === '?') return 'text-secondary'
  if (letter === 'A') return 'text-success'
  if (letter === 'D') return 'text-danger'
  if (letter === 'U') return 'text-warn'
  if (letter === 'R' || letter === 'C') return 'text-info'

  return 'text-warn'
}

/**
 * 渲染 Git 工具窗口。
 * @param props 见 FeatureViewProps
 * @returns 变更列表、提交框与分支操作
 */
export function GitPanel({ t, services }: FeatureViewProps): React.ReactElement {
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [refs, setRefs] = useState<GitRefs | null>(null)
  const [operation, setOperation] = useState<GitOperationState | null>(null)
  const [stashes, setStashes] = useState<{ ref: string; subject: string }[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [branchName, setBranchName] = useState('')
  const [showBranches, setShowBranches] = useState(false)

  const root = services.root

  /**
   * 重新读取状态、分支与操作状态。
   */
  const refresh = useCallback(async (): Promise<void> => {
    if (root === '') return

    const [statusResult, refsResult, operationResult, stashResult] = await Promise.all([
      readStatus(root),
      readRefs(root),
      readOperationState(root),
      readStashes(root),
    ])

    if (!statusResult.ok) {
      // 不是仓库属于正常状态，只清空数据不报错
      setStatus(null)
      setError(statusResult.error.code === 'GIT_NOT_REPOSITORY' ? '' : statusResult.error.message)

      return
    }

    setStatus(statusResult.value)
    setError('')
    if (refsResult.ok) setRefs(refsResult.value)
    if (operationResult.ok) setOperation(operationResult.value)
    if (stashResult.ok) setStashes(stashResult.value.entries)
  }, [root])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const groups: Group[] = useMemo(() => {
    if (status === null) return []

    return [
      { key: 'conflicted', label: 'groupConflicted', items: status.conflicted },
      { key: 'staged', label: 'groupStaged', items: status.staged },
      { key: 'unstaged', label: 'groupUnstaged', items: status.unstaged },
      { key: 'untracked', label: 'groupUntracked', items: status.untracked },
    ].filter((group) => group.items.length > 0) as Group[]
  }, [status])

  /**
   * 执行一次写操作并刷新。
   * @param action 动作
   * @returns 成功时返回 true
   */
  const run = useCallback(
    async (action: () => Promise<{ ok: boolean; error?: { message: string } }>): Promise<boolean> => {
      setBusy(true)

      try {
        const result = await action()

        if (!result.ok) {
          setError(result.error?.message ?? t('actionFailed'))

          return false
        }

        await refresh()
        services.refreshGitStatus()
        services.invalidate()

        return true
      } finally {
        setBusy(false)
      }
    },
    [refresh, services, t],
  )

  /**
   * 暂存一组全部文件。
   * @param paths 路径
   */
  const stageAll = useCallback(
    (paths: string[]) => {
      if (paths.length === 0) return
      void run(() => stage(root, paths))
    },
    [root, run],
  )

  /**
   * 丢弃一个文件的改动（二次确认由对话框负责）。
   * @param change 变更
   * @param untracked 是否未跟踪
   */
  const discardOne = useCallback(
    (change: GitChange, untracked: boolean) => {
      void run(() => discard(root, [change.path], untracked))
    },
    [root, run],
  )

  /**
   * 提交。
   */
  const submit = useCallback(async (): Promise<void> => {
    if (message.trim() === '') {
      setError(t('messageRequired'))

      return
    }

    const ok = await run(() => commit(root, message))

    if (ok) setMessage('')
  }, [message, root, run, t])

  const blocked = busy || root === ''
  // 存在未结束的多步操作时，变基与 cherry-pick 会破坏仓库状态，界面上直接置灰
  const operationBusy = operation !== null && (operation.merging || operation.rebasing || operation.cherryPicking)

  return (
    <div className="flex min-h-full flex-col">
      {/* 标题栏：分支名与刷新 */}
      <div className="sticky top-0 z-10 flex h-9 shrink-0 items-center justify-between gap-2 border-b border-line1 bg-layer1 px-3">
        {/* 面板名称与当前分支 */}
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-primary">
          {t('title')}
          {status !== null && status.branch !== '' && (
            <span className="ml-1 font-normal text-secondary">· {status.branch}</span>
          )}
        </span>

        {/* 刷新状态 */}
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={busy}
          className="rounded px-1.5 text-xs text-secondary hover:bg-layer2 hover:text-primary disabled:opacity-40"
        >
          {t('refresh')}
        </button>
      </div>

      {root === '' && <div className="px-3 py-3 text-xs text-secondary">{t('noSession')}</div>}

      {root !== '' && error !== '' && (
        <div className="border-b border-line1 px-3 py-2 text-xs text-danger">{error}</div>
      )}

      {/* 多步操作提示：合并 / 变基进行中，部分动作不可用 */}
      {operationBusy && operation !== null && (
        <div className="border-b border-line1 px-3 py-2 text-xs text-warn">
          {operation.merging ? t('mergingHint') : operation.rebasing ? t('rebasingHint') : t('cherryPickingHint')}
        </div>
      )}

      {/* 分支与远程操作 */}
      <div className="flex shrink-0 flex-wrap gap-1 border-b border-line1 px-2 py-1.5">
        {/* 展开 / 收起分支列表 */}
        <button
          type="button"
          onClick={() => setShowBranches((previous) => !previous)}
          className="rounded border border-line2 px-1.5 py-0.5 text-xs text-primary hover:bg-layer2"
        >
          {t('branches')}
        </button>

        {/* 拉取并合并 */}
        <button
          type="button"
          disabled={blocked}
          onClick={() => void run(() => pull(root))}
          className="rounded border border-line2 px-1.5 py-0.5 text-xs text-primary hover:bg-layer2 disabled:opacity-40"
        >
          {t('pull')}
        </button>

        {/* 仅拉取远端引用 */}
        <button
          type="button"
          disabled={blocked}
          onClick={() => void run(() => fetchAll(root))}
          className="rounded border border-line2 px-1.5 py-0.5 text-xs text-primary hover:bg-layer2 disabled:opacity-40"
        >
          {t('fetch')}
        </button>

        {/* 推送当前分支 */}
        <button
          type="button"
          disabled={blocked}
          onClick={() => void run(() => push(root))}
          className="rounded border border-line2 px-1.5 py-0.5 text-xs text-primary hover:bg-layer2 disabled:opacity-40"
        >
          {t('push')}
        </button>

        {/* 暂存全部改动 */}
        <button
          type="button"
          disabled={blocked}
          onClick={() => void run(() => stash(root, message))}
          className="rounded border border-line2 px-1.5 py-0.5 text-xs text-primary hover:bg-layer2 disabled:opacity-40"
        >
          {t('stash')}
        </button>
      </div>

      {showBranches && refs !== null && (
        <div className="max-h-48 shrink-0 overflow-auto border-b border-line1 px-2 py-1">
          {refs.local.map((branch) => (
            <div key={branch.name} className="flex items-center gap-1 py-0.5 text-xs">
              {/* 分支名前缀：当前分支用圆点标记 */}
              <span className={cn('w-3 shrink-0 text-center', branch.isHead ? 'text-success' : 'text-secondary')}>
                {branch.isHead ? '●' : ''}
              </span>

              {/* 签出该分支 */}
              <button
                type="button"
                disabled={blocked || branch.isHead}
                onClick={() =>
                  void run(() => checkout(root, branch.name)).then((ok) => {
                    if (ok) services.notify('success', `${t('checkedOut')} ${branch.name}`)
                  })
                }
                className="min-w-0 flex-1 truncate bg-transparent text-left text-primary hover:underline disabled:no-underline"
              >
                {branch.name}
              </button>

              {/* ahead / behind 角标 */}
              {(branch.ahead > 0 || branch.behind > 0) && (
                <span className="shrink-0 text-secondary">
                  {branch.ahead > 0 ? `↑${branch.ahead}` : ''}
                  {branch.behind > 0 ? `↓${branch.behind}` : ''}
                </span>
              )}

              {/* 合并到当前分支 */}
              {!branch.isHead && (
                <button
                  type="button"
                  disabled={blocked || operationBusy}
                  onClick={() => void run(() => merge(root, branch.name))}
                  className="shrink-0 rounded px-1 text-info hover:bg-layer2 disabled:opacity-40"
                >
                  {t('mergeInto')}
                </button>
              )}

              {/* 删除分支 */}
              {!branch.isHead && (
                <button
                  type="button"
                  disabled={blocked || operationBusy}
                  onClick={() => void run(() => deleteBranch(root, branch.name, false))}
                  className="shrink-0 rounded px-1 text-danger hover:bg-layer2 disabled:opacity-40"
                >
                  {t('delete')}
                </button>
              )}
            </div>
          ))}

          {stashes.length > 0 && (
            <div className="mt-1 border-t border-line1 pt-1">
              {stashes.map((entry) => (
                <div key={entry.ref} className="flex items-center gap-1 py-0.5 text-xs">
                  <span className="min-w-0 flex-1 truncate text-primary">{entry.subject}</span>

                  {/* 应用并删除该 stash */}
                  <button
                    type="button"
                    disabled={blocked}
                    onClick={() => void run(() => stashApply(root, entry.ref, 'pop'))}
                    className="shrink-0 rounded px-1 text-info hover:bg-layer2 disabled:opacity-40"
                  >
                    {t('stashPop')}
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-1 flex gap-1 border-t border-line1 pt-1">
            <input
              value={branchName}
              onChange={(event) => setBranchName(event.target.value)}
              placeholder={t('newBranchPlaceholder')}
              className="min-w-0 flex-1 rounded border border-line2 bg-base px-1.5 py-0.5 text-xs text-primary outline-none focus:border-line4"
            />

            {/* 从当前提交新建并切出分支 */}
            <button
              type="button"
              disabled={blocked || branchName.trim() === ''}
              onClick={() =>
                void run(() => createBranch(root, branchName.trim())).then((ok) => {
                  if (ok) setBranchName('')
                })
              }
              className="shrink-0 rounded border border-line2 px-1.5 py-0.5 text-xs text-primary hover:bg-layer2 disabled:opacity-40"
            >
              {t('createBranch')}
            </button>
          </div>
        </div>
      )}

      {/* 变更分组 */}
      <div className="flex-1 px-1 py-1">
        {groups.length === 0 && root !== '' && (
          <div className="px-2 py-3 text-xs text-secondary">{status === null ? t('notRepository') : t('clean')}</div>
        )}

        {groups.map((group) => (
          <div key={group.key} className="mb-1">
            <div className="flex items-center gap-1 px-1 py-0.5">
              {/* 分组标题与文件数 */}
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-secondary">
                {t(group.label)} ({group.items.length})
              </span>

              {/* 分组批量操作 */}
              {group.key === 'staged' && (
                <button
                  type="button"
                  disabled={blocked}
                  onClick={() => void run(() => unstage(root, group.items.map((item) => item.path)))}
                  className="shrink-0 rounded px-1 text-xs text-info hover:bg-layer2 disabled:opacity-40"
                >
                  {t('unstageAll')}
                </button>
              )}

              {group.key !== 'staged' && group.key !== 'conflicted' && (
                <button
                  type="button"
                  disabled={blocked}
                  onClick={() => stageAll(group.items.map((item) => item.path))}
                  className="shrink-0 rounded px-1 text-xs text-info hover:bg-layer2 disabled:opacity-40"
                >
                  {t('stageAll')}
                </button>
              )}
            </div>

            {group.items.map((change) => (
              <div key={`${group.key}:${change.path}`} className="group flex items-center gap-1 rounded px-1 py-0.5 hover:bg-layer2">
                {/* 状态字母 */}
                <span className={cn('w-3 shrink-0 font-mono text-[11px]', letterTone(change.indexStatus === ' ' ? change.worktreeStatus : change.indexStatus))}>
                  {change.indexStatus === ' ' ? change.worktreeStatus : change.indexStatus}
                </span>

                {/* 文件名：点击打开差异 */}
                <button
                  type="button"
                  onClick={() =>
                    services.openDiff({ kind: 'worktree', path: change.path, staged: group.key === 'staged' })
                  }
                  title={change.path}
                  className="min-w-0 flex-1 truncate bg-transparent text-left text-xs text-primary hover:underline"
                >
                  {change.path}
                </button>

                {/* 行内操作：暂存 / 取消暂存 / 丢弃 */}
                {group.key === 'staged' ? (
                  <button
                    type="button"
                    disabled={blocked}
                    onClick={() => void run(() => unstage(root, [change.path]))}
                    className="shrink-0 rounded px-1 text-[11px] text-info opacity-0 hover:bg-layer1 group-hover:opacity-100 disabled:opacity-40"
                  >
                    {t('unstage')}
                  </button>
                ) : group.key === 'conflicted' ? (
                  <button
                    type="button"
                    onClick={() => services.openConflict(change.path)}
                    className="shrink-0 rounded px-1 text-[11px] text-warn opacity-0 hover:bg-layer1 group-hover:opacity-100"
                  >
                    {t('resolve')}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={blocked}
                      onClick={() => void run(() => stage(root, [change.path]))}
                      className="shrink-0 rounded px-1 text-[11px] text-info opacity-0 hover:bg-layer1 group-hover:opacity-100 disabled:opacity-40"
                    >
                      {t('stage')}
                    </button>

                    {/* 丢弃改动；未跟踪文件走删除 */}
                    <button
                      type="button"
                      disabled={blocked}
                      onClick={() => discardOne(change, group.key === 'untracked')}
                      className="shrink-0 rounded px-1 text-[11px] text-danger opacity-0 hover:bg-layer1 group-hover:opacity-100 disabled:opacity-40"
                    >
                      {t('discard')}
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* 提交区 */}
      <div className="shrink-0 border-t border-line1 p-2">
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={t('commitPlaceholder')}
          rows={3}
          className="mb-1 w-full resize-none rounded border border-line2 bg-base px-2 py-1 text-xs text-primary outline-none focus:border-line4"
        />

        <button
          type="button"
          disabled={blocked || message.trim() === ''}
          onClick={() => void submit()}
          className="w-full rounded border border-line2 bg-layer2 px-2 py-1 text-xs text-primary hover:bg-layer1 disabled:opacity-40"
        >
          {t('commit')}
        </button>
      </div>
    </div>
  )
}
