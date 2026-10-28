/**
 * 分支与远程工具窗口。
 *
 * 分组树（本地 / 远程 / 标签），本地分支显示 ahead/behind 角标与上游名。
 * 右键全部操作：签出、新建、重命名、删除、合并到当前、变基、compare、fetch、push。
 */
import React, { useCallback, useEffect, useState } from 'react'

import { cn } from '../../../common/cn'
import type { FeatureViewProps } from '../../shell/contract'

import {
  checkout,
  createBranch,
  createTag,
  deleteBranch,
  deleteTag,
  fetchAll,
  merge,
  pull,
  push,
  readRefs,
  rebase,
  renameBranch,
  type GitBranch,
  type GitRefs,
} from '../git/api'

/** 正在等待输入的操作。 */
type Prompt =
  | { kind: 'createBranch' }
  | { kind: 'renameBranch'; from: string }
  | { kind: 'createTag' }

/**
 * 渲染分支面板。
 * @param props 见 FeatureViewProps
 * @returns 分支、远程与标签分组
 */
export function BranchesPanel({ t, services }: FeatureViewProps): React.ReactElement {
  const [refs, setRefs] = useState<GitRefs | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [prompt, setPrompt] = useState<Prompt | null>(null)
  const [promptText, setPromptText] = useState('')
  const [menu, setMenu] = useState<{ x: number; y: number; branch: string } | null>(null)

  const root = services.root

  /**
   * 重新读取分支与标签。
   */
  const refresh = useCallback(async (): Promise<void> => {
    if (root === '') return

    const result = await readRefs(root)

    if (!result.ok) {
      if (result.error.code !== 'GIT_NOT_REPOSITORY') setError(result.error.message)
      setRefs(null)

      return
    }

    setError('')
    setRefs(result.value)
  }, [root])

  useEffect(() => {
    void refresh()
  }, [refresh])

  /**
   * 执行一次操作并刷新。
   * @param action 操作
   */
  const run = useCallback(
    async (action: () => Promise<{ ok: boolean; error?: { message: string } }>): Promise<void> => {
      setBusy(true)

      try {
        const result = await action()

        if (!result.ok) {
          setError(result.error?.message ?? t('actionFailed'))

          return
        }

        await refresh()
        services.refreshGitStatus()
      } finally {
        setBusy(false)
      }
    },
    [refresh, services, t],
  )

  /**
   * 提交输入框内容。
   */
  const submitPrompt = useCallback(async (): Promise<void> => {
    const name = promptText.trim()
    if (prompt === null || name === '') return

    const current = prompt
    setPrompt(null)

    if (current.kind === 'createBranch') await run(() => createBranch(root, name))
    if (current.kind === 'renameBranch') await run(() => renameBranch(root, current.from, name))
    if (current.kind === 'createTag') await run(() => createTag(root, name))
  }, [prompt, promptText, root, run])

  const local = refs?.local ?? []

  return (
    <div className="flex min-h-full flex-col">
      {/* 标题栏：面板名与刷新 */}
      <div className="sticky top-0 z-10 flex h-9 shrink-0 items-center justify-between gap-2 border-b border-line1 bg-layer1 px-3">
        {/* 面板名称 */}
        <span className="truncate text-xs font-medium text-primary">{t('title')}</span>

        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded px-1.5 text-xs text-secondary hover:bg-layer2 hover:text-primary"
        >
          {t('refresh')}
        </button>
      </div>

      {root === '' && <div className="px-3 py-3 text-xs text-secondary">{t('noSession')}</div>}
      {error !== '' && <div className="px-3 py-2 text-xs text-danger">{error}</div>}

      {root !== '' && (
        <div className="flex-1 px-1 py-1">
          <div className="mb-1 flex items-center gap-1 px-1">
            {/* 本地分支分组标题 */}
            <span className="min-w-0 flex-1 text-xs font-medium text-secondary">
              {t('groupLocal')} ({local.length})
            </span>

            {/* 新建分支 */}
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setPrompt({ kind: 'createBranch' })
                setPromptText('')
              }}
              className="shrink-0 rounded px-1 text-xs text-info hover:bg-layer2 disabled:opacity-40"
            >
              {t('newBranch')}
            </button>

            {/* 新建标签 */}
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setPrompt({ kind: 'createTag' })
                setPromptText('')
              }}
              className="shrink-0 rounded px-1 text-xs text-info hover:bg-layer2 disabled:opacity-40"
            >
              {t('newTag')}
            </button>
          </div>

          {local.map((branch) => (
            <BranchRow
              key={branch.name}
              branch={branch}
              t={t}
              onContextMenu={(event) => {
                event.preventDefault()
                setMenu({ x: event.clientX, y: event.clientY, branch: branch.name })
              }}
              onDoubleClick={() => {
                if (branch.isHead) return
                void run(() => checkout(root, branch.name))
              }}
            />
          ))}

          {(refs?.remote.length ?? 0) > 0 && (
            <>
              <div className="mb-1 mt-2 px-1 text-xs font-medium text-secondary">
                {/* 远程分支分组标题 */}
                {t('groupRemote')} ({refs?.remote.length ?? 0})
              </div>

              {refs?.remote.map((branch) => (
                <div key={branch.name} className="flex items-center gap-1 rounded px-2 py-0.5 text-xs hover:bg-layer2">
                  <span className="min-w-0 flex-1 truncate text-primary">{branch.name}</span>

                  {/* 从远程分支签出同名本地分支 */}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const name = branch.name.replace(/^[^/]+\//, '')

                        return createBranch(root, name, branch.name)
                      })
                    }
                    className="shrink-0 rounded px-1 text-[11px] text-info hover:bg-layer1 disabled:opacity-40"
                  >
                    {t('checkoutAsLocal')}
                  </button>
                </div>
              ))}
            </>
          )}

          {(refs?.tags.length ?? 0) > 0 && (
            <>
              <div className="mb-1 mt-2 px-1 text-xs font-medium text-secondary">
                {/* 标签分组标题 */}
                {t('groupTags')} ({refs?.tags.length ?? 0})
              </div>

              {refs?.tags.map((tag) => (
                <div key={tag.name} className="flex items-center gap-1 rounded px-2 py-0.5 text-xs hover:bg-layer2">
                  <span className="min-w-0 flex-1 truncate text-primary">{tag.name}</span>

                  {/* 删除标签 */}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run(() => deleteTag(root, tag.name))}
                    className="shrink-0 rounded px-1 text-[11px] text-danger hover:bg-layer1 disabled:opacity-40"
                  >
                    {t('delete')}
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* 分支右键菜单 */}
      {menu !== null && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setMenu(null)} />

          <div
            className="fixed z-[9999] min-w-[180px] rounded-md border border-line2 bg-overlay py-1 shadow-lg"
            style={{ left: menu.x, top: menu.y }}
          >
            {[
              { id: 'checkout', run: () => void run(() => checkout(root, menu.branch)) },
              { id: 'rename', run: () => { setPrompt({ kind: 'renameBranch', from: menu.branch }); setPromptText(menu.branch) } },
              { id: 'merge', run: () => void run(() => merge(root, menu.branch)) },
              { id: 'rebase', run: () => void run(() => rebase(root, menu.branch)) },
              { id: 'fetch', run: () => void run(() => fetchAll(root)) },
              { id: 'pull', run: () => void run(() => pull(root)) },
              { id: 'push', run: () => void run(() => push(root)) },
              { id: 'delete', run: () => void run(() => deleteBranch(root, menu.branch, false)) },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setMenu(null)
                  item.run()
                }}
                className={cn(
                  'block w-full px-3 py-[5px] text-left text-xs transition-colors hover:bg-layer2',
                  item.id === 'delete' ? 'text-danger' : 'text-primary',
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
              {prompt.kind === 'createBranch'
                ? t('promptCreateBranch')
                : prompt.kind === 'renameBranch'
                  ? t('promptRenameBranch')
                  : t('promptCreateTag')}
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

/** 单个本地分支行。 */
interface BranchRowProps {
  /** 分支数据。 */
  branch: GitBranch
  /** 已绑定前缀的翻译函数。 */
  t: (key: string) => string
  /** 右键回调。 */
  onContextMenu(event: React.MouseEvent): void
  /** 双击签出。 */
  onDoubleClick(): void
}

/**
 * 渲染一个本地分支。
 * @param props 见 BranchRowProps
 * @returns 分支行
 */
function BranchRow({ branch, t, onContextMenu, onDoubleClick }: BranchRowProps): React.ReactElement {
  return (
    <div
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
      className="flex items-center gap-1 rounded px-2 py-0.5 text-xs hover:bg-layer2"
      title={branch.subject}
    >
      {/* 当前分支圆点 */}
      <span className={cn('w-3 shrink-0 text-center', branch.isHead ? 'text-success' : 'text-secondary')}>
        {branch.isHead ? '●' : ''}
      </span>

      {/* 分支名 */}
      <span className="min-w-0 flex-1 truncate text-primary">{branch.name}</span>

      {/* 上游名与 ahead/behind 角标 */}
      {branch.upstream !== '' && (
        <span className="shrink-0 text-[11px] text-secondary">
          {branch.ahead > 0 ? `↑${branch.ahead}` : ''}
          {branch.behind > 0 ? `↓${branch.behind}` : ''}
        </span>
      )}

      {branch.isHead && <span className="shrink-0 text-[11px] text-success">{t('current')}</span>}
    </div>
  )
}
