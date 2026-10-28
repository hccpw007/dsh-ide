/**
 * Git 面板的「本地变更」页签。
 *
 * 左侧是变更列表与提交框，右侧内嵌差异，对应 IDEA 的 Local Changes：
 * 点文件在右侧看差异，差异工具栏可暂存、还原或转到编辑器；分组标题负责批量操作。
 */
import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'

import { cn } from '../../../common/cn'
import type { ApiResult } from '../../../common/api'
import type { DiffSource, FeatureViewProps } from '../../shell/contract'

import { DiffPane, type DiffPaneAction } from './DiffPane'
import { recordGitConsole } from './console-store'
import {
  commit,
  discard,
  fetchAll,
  gitOutputOf,
  pull,
  push,
  readOperationState,
  readStatus,
  stage,
  stash,
  unstage,
  type GitChange,
  type GitOperationState,
  type GitStatus,
} from './api'

/** 一个可展示的变更分组。 */
interface ChangeGroup {
  /** 分组键，同时决定行内可用的操作。 */
  key: 'conflicted' | 'staged' | 'unstaged' | 'untracked'
  /** 分组标题的语言 key。 */
  label: string
  /** 该组的变更。 */
  items: GitChange[]
}

/** 左侧列表宽度：够放文件名与目录尾部，同时把剩余宽度留给差异。 */
const LIST_WIDTH = 320

/**
 * 取变更的状态字母。
 * @param change 变更
 * @returns 单字符状态
 */
function statusLetter(change: GitChange): string {
  // 未跟踪与未暂存都以工作区状态为准，已暂存才看索引区
  return change.indexStatus === ' ' || change.indexStatus === '?' ? change.worktreeStatus : change.indexStatus
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
 * 把路径拆成文件名与目录，目录以灰色显示在文件名右侧。
 * @param path 相对路径
 * @returns 文件名与目录
 */
function splitPath(path: string): { name: string; directory: string } {
  const index = path.lastIndexOf('/')

  return index < 0 ? { name: path, directory: '' } : { name: path.slice(index + 1), directory: path.slice(0, index) }
}

/**
 * 渲染本地变更页签。
 * @param props 见 FeatureViewProps
 * @returns 变更列表、提交框与内嵌差异
 */
export function LocalChanges({ t, services }: FeatureViewProps): React.ReactElement {
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [operation, setOperation] = useState<GitOperationState | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  /** 当前选中的变更；staged 决定右侧差异取 HEAD 还是索引区。 */
  const [selected, setSelected] = useState<{ path: string; staged: boolean; untracked: boolean } | null>(null)
  /** 外部写操作后递增，让内嵌差异重新取数。 */
  const [revision, setRevision] = useState(0)

  // 会话在首条消息之后才绑定 cwd，订阅后工作区变化会重读状态
  const root = useSyncExternalStore(
    (listener) => services.subscribeRoot(listener),
    () => services.root,
    () => services.root,
  )

  /** 重新读取状态与多步操作状态。 */
  const refresh = useCallback(async (): Promise<void> => {
    if (root === '') return

    const [statusResult, operationResult] = await Promise.all([readStatus(root), readOperationState(root)])

    if (!statusResult.ok) {
      // 不是仓库属于正常状态，只清空数据不报错
      setStatus(null)
      setError(statusResult.error.code === 'GIT_NOT_REPOSITORY' ? '' : statusResult.error.message)

      return
    }

    setStatus(statusResult.value)
    setError('')
    if (operationResult.ok) setOperation(operationResult.value)
    setRevision((previous) => previous + 1)
  }, [root])

  useEffect(() => {
    void refresh()
  }, [refresh])

  /**
   * 执行一次写操作，把命令与输出记到控制台，成功后刷新状态。
   * @param command 等价的 git 命令行
   * @param action 实际操作
   * @returns 成功时返回 true
   */
  const run = useCallback(
    async (command: string, action: () => Promise<ApiResult<unknown>>): Promise<boolean> => {
      setBusy(true)

      try {
        const result = await action()
        recordGitConsole(command, result.ok, gitOutputOf(result))

        if (!result.ok) {
          setError(result.error.message)

          return false
        }

        setError('')
        await refresh()
        services.refreshGitStatus()
        services.invalidate()

        return true
      } finally {
        setBusy(false)
      }
    },
    [refresh, services],
  )

  const groups: ChangeGroup[] = useMemo(() => {
    if (status === null) return []

    return [
      { key: 'conflicted', label: 'groupConflicted', items: status.conflicted },
      { key: 'staged', label: 'groupStaged', items: status.staged },
      { key: 'unstaged', label: 'groupUnstaged', items: status.unstaged },
      { key: 'untracked', label: 'groupUntracked', items: status.untracked },
    ].filter((group) => group.items.length > 0) as ChangeGroup[]
  }, [status])

  /** 提交。 */
  const submit = useCallback(async (): Promise<void> => {
    if (message.trim() === '') {
      setError(t('messageRequired'))

      return
    }

    const text = message
    const ok = await run(`git commit -m "${text}"`, () => commit(root, text))

    if (ok) setMessage('')
  }, [message, root, run, t])

  const blocked = busy || root === ''
  // 存在未结束的多步操作时，推送等动作可能破坏仓库状态，界面上直接置灰
  const operationBusy = operation !== null && (operation.merging || operation.rebasing || operation.cherryPicking)

  /** 右侧差异来源；选中项变化时引用保持稳定，避免 DiffPane 反复取数。 */
  const diffSource = useMemo<DiffSource | null>(
    () => (selected === null ? null : { kind: 'worktree', path: selected.path, staged: selected.staged }),
    [selected],
  )

  const diffActions = useMemo<DiffPaneAction[]>(() => {
    if (selected === null) return []

    const path = selected.path
    const actions: DiffPaneAction[] = []

    if (selected.staged) {
      actions.push({
        label: t('unstage'),
        disabled: blocked,
        run: () => void run(`git reset HEAD -- ${path}`, () => unstage(root, [path])),
      })
    } else {
      actions.push({
        label: t('stage'),
        disabled: blocked,
        run: () => void run(`git add -- ${path}`, () => stage(root, [path])),
      })
      actions.push({
        label: t('discard'),
        danger: true,
        disabled: blocked,
        run: () =>
          void run(selected.untracked ? `git clean -fd -- ${path}` : `git restore -- ${path}`, () =>
            discard(root, [path], selected.untracked),
          ),
      })
    }

    // 冲突文件走专用的三选一解决视图，二进制文件同样适用
    if (selected.path !== '' && status?.conflicted.some((item) => item.path === path) === true) {
      actions.push({ label: t('resolve'), run: () => services.openConflict(path) })
    }

    actions.push({
      label: t('openInEditor'),
      run: () => services.openFile(path),
      disabled: selected.untracked,
    })

    return actions
  }, [blocked, root, run, selected, services, status, t])

  return (
    <div className="flex h-full min-h-0">
      {/* 左侧：变更列表与提交框 */}
      <div className="flex shrink-0 flex-col border-r border-line1" style={{ width: LIST_WIDTH }}>
        {/* 工具栏：刷新与远程操作 */}
        <div className="flex h-8 shrink-0 items-center gap-0.5 border-b border-line1 px-1">
          {/* 重新读取工作区状态 */}
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={busy}
            className="rounded px-1.5 py-0.5 text-xs text-secondary hover:bg-layer2 hover:text-primary disabled:opacity-40"
          >
            {t('refresh')}
          </button>

          {/* 获取远端引用 */}
          <button
            type="button"
            disabled={blocked}
            onClick={() => void run('git fetch --all --prune', () => fetchAll(root))}
            className="rounded px-1.5 py-0.5 text-xs text-secondary hover:bg-layer2 hover:text-primary disabled:opacity-40"
          >
            {t('fetch')}
          </button>

          {/* 拉取并合并 */}
          <button
            type="button"
            disabled={blocked || operationBusy}
            onClick={() => void run('git pull --no-edit', () => pull(root))}
            className="rounded px-1.5 py-0.5 text-xs text-secondary hover:bg-layer2 hover:text-primary disabled:opacity-40"
          >
            {t('pull')}
          </button>

          {/* 推送当前分支 */}
          <button
            type="button"
            disabled={blocked}
            onClick={() => void run('git push origin HEAD', () => push(root))}
            className="rounded px-1.5 py-0.5 text-xs text-secondary hover:bg-layer2 hover:text-primary disabled:opacity-40"
          >
            {t('push')}
          </button>

          {/* 贮藏当前全部改动 */}
          <button
            type="button"
            disabled={blocked}
            onClick={() => void run('git stash push', () => stash(root, message))}
            className="rounded px-1.5 py-0.5 text-xs text-secondary hover:bg-layer2 hover:text-primary disabled:opacity-40"
          >
            {t('stash')}
          </button>
        </div>

        {root === '' && <div className="px-3 py-3 text-xs text-secondary">{t('noSession')}</div>}

        {error !== '' && <div className="border-b border-line1 px-2 py-1.5 text-xs text-danger">{error}</div>}

        {/* 多步操作提示：合并 / 变基进行中，部分动作不可用 */}
        {operationBusy && operation !== null && (
          <div className="border-b border-line1 px-2 py-1.5 text-xs text-warn">
            {operation.merging ? t('mergingHint') : operation.rebasing ? t('rebasingHint') : t('cherryPickingHint')}
          </div>
        )}

        {/* 变更分组 */}
        <div className="min-h-0 flex-1 overflow-auto py-1">
          {groups.length === 0 && root !== '' && (
            <div className="px-2 py-3 text-xs text-secondary">{status === null ? t('notRepository') : t('clean')}</div>
          )}

          {groups.map((group) => (
            <div key={group.key} className="mb-1">
              <div className="flex items-center gap-1 px-2 py-0.5">
                {/* 分组标题与文件数 */}
                <span className="min-w-0 flex-1 truncate text-xs text-secondary">
                  {t(group.label)} {group.items.length}
                </span>

                {/* 分组批量操作 */}
                {group.key === 'staged' && (
                  <button
                    type="button"
                    disabled={blocked}
                    onClick={() =>
                      void run(
                        `git reset HEAD -- ${group.items.map((item) => item.path).join(' ')}`,
                        () => unstage(root, group.items.map((item) => item.path)),
                      )
                    }
                    className="shrink-0 rounded px-1 text-[11px] text-info hover:bg-layer2 disabled:opacity-40"
                  >
                    {t('unstageAll')}
                  </button>
                )}

                {(group.key === 'unstaged' || group.key === 'untracked') && (
                  <button
                    type="button"
                    disabled={blocked}
                    onClick={() =>
                      void run(
                        `git add -- ${group.items.map((item) => item.path).join(' ')}`,
                        () => stage(root, group.items.map((item) => item.path)),
                      )
                    }
                    className="shrink-0 rounded px-1 text-[11px] text-info hover:bg-layer2 disabled:opacity-40"
                  >
                    {t('stageAll')}
                  </button>
                )}
              </div>

              {group.items.map((change) => {
                const { name, directory } = splitPath(change.path)
                const isSelected =
                  selected !== null &&
                  selected.path === change.path &&
                  selected.staged === (group.key === 'staged')

                return (
                  <button
                    key={`${group.key}:${change.path}`}
                    type="button"
                    title={change.path}
                    onClick={() =>
                      setSelected({
                        path: change.path,
                        staged: group.key === 'staged',
                        untracked: group.key === 'untracked',
                      })
                    }
                    className={cn(
                      'flex w-full items-center gap-1.5 px-2 py-0.5 text-left text-xs',
                      isSelected ? 'bg-layer2 text-primary' : 'text-primary hover:bg-layer2',
                    )}
                  >
                    {/* 状态字母 */}
                    <span className={cn('w-3 shrink-0 font-mono text-[11px]', letterTone(statusLetter(change)))}>
                      {statusLetter(change)}
                    </span>

                    {/* 文件名与灰色目录 */}
                    <span className="min-w-0 flex-1 truncate">{name}</span>
                    {directory !== '' && (
                      <span className="max-w-[45%] shrink-0 truncate text-[11px] text-secondary">{directory}</span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        {/* 提交区 */}
        <div className="shrink-0 border-t border-line1 p-2">
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={t('commitPlaceholder')}
            rows={2}
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

      {/* 右侧：内嵌差异 */}
      <div className="min-w-0 flex-1">
        {diffSource === null ? (
          <div className="p-3 text-xs text-secondary">{t('selectFile')}</div>
        ) : (
          <DiffPane t={t} services={services} source={diffSource} actions={diffActions} revision={revision} />
        )}
      </div>
    </div>
  )
}
