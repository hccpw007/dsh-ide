/**
 * Push Commits 对话框。
 *
 * 复刻 IDEA 的推送窗口：左侧是当前分支到上游的提交区间与未推送提交，右侧是这些
 * 提交涉及的文件树，底部是 Push tags 范围、取消与可下拉出 Force Push 的推送按钮。
 * 数据来自宿主的 pushPreview；推送动作走同一个 push 方法，命令行会进 Git 控制台。
 *
 * 与 IDEA 截图的唯一差异是不画 macOS 三个窗口控制点：这里不是真实的原生窗口。
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'

import { cn } from '../../../common/cn'
import type { IdeMenuItem } from '../../../common/context-menu'
import { useDialogResize } from '../../../common/dialog-resize'
import type { Translate } from '../../../types/plugin'
import { Checkbox } from '../../common/Checkbox'
import type { IdeServices } from '../../shell/contract'

import { push, readPushPreview, type GitPushPreview } from './api'
import { buildCommitTree, type CommitFile, type CommitNode } from './commit-model'
import { chevronDownIcon, collapseIcon, expandAllIcon, eyeIcon, listIcon, pencilIcon } from './icons'
import { ContextMenu, type MenuState } from './menu'
import { PushFileTree } from './PushFileTree'

/** 弹窗默认大小：取可用区域的 94%×90%，最多 1100×760，与 IDEA 的大号推送窗比例一致。 */
const INITIAL_SIZE = { widthRatio: 0.94, heightRatio: 0.9, maxWidth: 1100, maxHeight: 760 }

/** 缩放下限：再小左右分栏与底部操作行都放不下。 */
const MIN_SIZE = { width: 640, height: 420 }

/** 弹窗标识：推送窗的尺寸单独记忆。 */
const SIZE_KEY = 'git-push'

/** 帮助按钮指向 IDEA 官方文档的推送一节，与在 IDEA 里点 `?` 的效果一致。 */
const HELP_URL = 'https://www.jetbrains.com/help/idea/pushing-changes.html'

/** 标签范围：推全部标签或只推当前分支可达的标签。 */
type TagsScope = 'all' | 'current'

/** 对话框 props。 */
export interface PushDialogProps {
  /** 已绑定 git 前缀的翻译函数。 */
  t: Translate
  /** 工作台服务总线。 */
  services: IdeServices
  /** 工作区根。 */
  root: string
  /** 关闭对话框，不做任何推送。 */
  onClose(): void
}

/**
 * 收集树里所有目录路径，供「折叠全部」一次性收起。
 * @param node 节点
 * @returns 目录路径列表
 */
function directoryPaths(node: CommitNode): string[] {
  if (!node.directory) return []

  return [node.path, ...node.children.flatMap((child) => directoryPaths(child))]
}

/**
 * 把待推送文件转成变更树使用的文件结构。
 *
 * 这些变更都已经在提交里，统一按「已暂存」处理：差异取上游与 HEAD 的两侧文本。
 * @param files 宿主返回的文件与状态
 * @returns 变更树文件
 */
function toCommitFiles(files: GitPushPreview['files']): CommitFile[] {
  return files.map((file) => ({
    path: file.path,
    change: { path: file.path, indexStatus: file.status, worktreeStatus: '' },
    staged: true,
    untracked: false,
    conflicted: false,
  }))
}

/**
 * 渲染 Push Commits 对话框。
 * @param props 见 PushDialogProps
 * @returns 遮罩 + 对话框
 */
export function PushDialog({ t, services, root, onClose }: PushDialogProps): React.ReactElement {
  const [preview, setPreview] = useState<GitPushPreview | null>(null)
  const [errorText, setErrorText] = useState('')
  /** 推送进行中：底部按钮与关闭动作暂时失效，避免重复推送。 */
  const [busy, setBusy] = useState(false)
  /** 当前选中的提交短 hash；null 表示没有可推送的提交。 */
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  /** 是否同时推送标签。 */
  const [pushTags, setPushTags] = useState(false)
  /** 标签范围，默认 All，与 IDEA 的初始选择一致。 */
  const [tagsScope, setTagsScope] = useState<TagsScope>('all')
  /** 推送按钮的下拉菜单；null 表示未展开。 */
  const [pushMenu, setPushMenu] = useState<MenuState | null>(null)
  /** Push tags 范围的下拉菜单；null 表示未展开。 */
  const [tagsMenu, setTagsMenu] = useState<MenuState | null>(null)
  const { size, handle } = useDialogResize(services.dialogSizes, {
    key: SIZE_KEY,
    initial: INITIAL_SIZE,
    min: MIN_SIZE,
  })

  /** 仓库目录名：标题与文件树根节点都用它，与 IDEA 显示项目名一致。 */
  const repository = root.slice(root.lastIndexOf('/') + 1)

  /** 读取待推送内容；打开时与推送成功后各读一次。 */
  const reload = useCallback(async (): Promise<void> => {
    if (root === '') return

    const result = await readPushPreview(root)

    if (!result.ok) {
      // 不是仓库属于正常状态，不当作错误弹提示
      setPreview(null)
      setErrorText(result.error.code === 'GIT_NOT_REPOSITORY' ? '' : result.error.message)

      return
    }

    setPreview(result.value)
    setErrorText('')
    // 已经有选中的提交时保留，避免重读后选中位置跳回第一条
    setSelectedCommit((previous) => previous ?? result.value.commits[0]?.hash ?? null)
  }, [root])

  useEffect(() => {
    void reload()
  }, [reload])

  const commits = preview?.commits ?? []
  /** 上游短名拆成远程与分支，显示成 `origin : main`。 */
  const upstreamRemote = preview !== null && preview.upstream.includes('/')
    ? preview.upstream.slice(0, preview.upstream.indexOf('/'))
    : ''
  const upstreamBranch = preview === null
    ? ''
    : preview.upstream.includes('/')
      ? preview.upstream.slice(preview.upstream.indexOf('/') + 1)
      : preview.upstream
  const files = useMemo(() => toCommitFiles(preview?.files ?? []), [preview])
  const tree = useMemo(() => buildCommitTree(files), [files])
  /** 选中文件对应的变更；删除的文件没有工作区副本，不能直接打开。 */
  const selectedStatus = files.find((file) => file.path === selectedPath)?.change.indexStatus ?? ''
  const canOpenFile = selectedPath !== null && selectedStatus !== 'D' && selectedStatus !== ''

  /**
   * 执行推送。
   * @param force 是否使用强制推送
   */
  const runPush = useCallback(
    async (force: boolean): Promise<void> => {
      if (root === '' || busy) return

      setBusy(true)

      try {
        const result = await push(root, { force, ...(pushTags ? { tags: tagsScope } : {}) })

        if (!result.ok) {
          console.error('[dsh-ide] 推送失败:', result.error)
          setErrorText(result.error.message)
          services.toast('error', result.error.message)

          return
        }

        services.refreshGitStatus()
        services.toast('success', t('pushSucceeded'))
        onClose()
      } catch (error) { // 网络层异常不会带 ApiResult，留痕后让用户重试
        console.error('[dsh-ide] 推送失败:', error)
        setErrorText(String(error))
      } finally {
        setBusy(false)
      }
    },
    [busy, onClose, pushTags, root, services, t, tagsScope],
  )

  /** 展开推送按钮的下拉：只含 Force Push，与截图一致。 */
  const openPushMenu = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>): void => {
      const rect = event.currentTarget.getBoundingClientRect()
      const items: IdeMenuItem[] = [
        // 强制推送：用 force-with-lease 覆盖远端，保留他人新提交的保护
        { id: 'force', label: t('pushForce'), run: () => void runPush(true) },
      ]

      setPushMenu({ x: rect.right - 150, y: rect.bottom + 4, items, minWidth: 150 })
    },
    [runPush, t],
  )

  /** 展开 Push tags 的范围下拉：All 与 Current Branch 两项。 */
  const openTagsMenu = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>): void => {
      const rect = event.currentTarget.getBoundingClientRect()
      const items: IdeMenuItem[] = [
        // 推送全部标签
        { id: 'all', label: t('pushTagsAll'), selected: tagsScope === 'all', run: () => setTagsScope('all') },
        // 只推送当前分支可达的标签
        { id: 'current', label: t('pushTagsCurrentBranch'), selected: tagsScope === 'current', run: () => setTagsScope('current') },
      ]

      setTagsMenu({ x: rect.left, y: rect.bottom + 4, items, minWidth: rect.width })
    },
    [t, tagsScope],
  )

  // Esc 关闭、Enter 推送：与桌面 IDE 的对话框习惯一致；下拉展开时交给菜单自己处理
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (busy || pushMenu !== null || tagsMenu !== null) return

      if (event.key === 'Escape') onClose()

      if (event.key === 'Enter') {
        event.preventDefault()
        void runPush(false)
      }
    }

    window.addEventListener('keydown', onKeyDown, true)

    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [busy, onClose, pushMenu, runPush, tagsMenu])

  return (
    <div className="fixed inset-0 z-[9995] flex items-center justify-center bg-black/30 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('pushDialogTitle').replace('{repo}', repository)}
        className="relative flex flex-col overflow-hidden rounded-[12px] border border-[color:var(--ide-dialog-border)] bg-[var(--ide-dialog-bg)] shadow-2xl"
        style={size}
      >
        {/* 标题行：只保留标题，不画 macOS 的三个窗口控制点 */}
        <div className="flex shrink-0 items-center px-5 pb-2 pt-3.5">
          {/* 对话框标题：Push Commits to <仓库名> */}
          <span className="whitespace-nowrap text-[13px] font-bold text-[color:var(--ide-dialog-fg)]">
            {t('pushDialogTitle').replace('{repo}', repository)}
          </span>
        </div>

        {/* 主体：左列提交、右列文件树，中间一条分栏线 */}
        <div className="flex min-h-0 flex-1">
          {/* 左侧：上游区间与未推送提交 */}
          <div className="flex min-h-0 w-[61%] shrink-0 flex-col overflow-auto py-0.5 [scrollbar-gutter:stable]">
            {root === '' && (
              <div className="px-3 py-2 text-xs text-[color:var(--ide-dialog-fg)]">{t('noSession')}</div>
            )}

            {root !== '' && preview === null && (
              <div className="px-3 py-2 text-xs text-[color:var(--ide-dialog-fg)]">
                {errorText === '' ? t('notRepository') : errorText}
              </div>
            )}

            {preview !== null && (
              <>
                {/* 分支行：当前分支 → 远程 : 上游分支；始终以 IDEA 的选中蓝呈现 */}
                {preview.branch !== '' && (
                  <div className="flex h-[25px] shrink-0 items-center gap-1.5 bg-treeselected px-3 text-xs">
                    <span className="min-w-0 truncate font-medium text-white">{preview.branch}</span>

                    {preview.upstream === '' ? (
                      // 没有跟踪远端时无法确定推送目标，用提示文案替代箭头
                      <span className="min-w-0 truncate text-[11px] text-white/70">{t('pushDialogNoUpstream')}</span>
                    ) : (
                      <>
                        <span className="shrink-0 text-[color:var(--ide-ic-blue)]">→</span>
                        <span className="min-w-0 truncate text-[color:var(--ide-ic-blue)]">
                          {upstreamRemote} : {upstreamBranch}
                        </span>
                      </>
                    )}
                  </div>
                )}

                {/* 未推送的提交；点击切换选中，只影响文件树的范围 */}
                {commits.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-[color:var(--ide-dialog-fg)]">{t('pushDialogNoCommits')}</div>
                ) : (
                  commits.map((commit) => (
                    <button
                      key={commit.hash}
                      type="button"
                      title={commit.subject}
                      onClick={() => setSelectedCommit(commit.hash)}
                      className={cn(
                        'flex h-[25px] w-full shrink-0 items-center px-6 text-left text-xs',
                        selectedCommit === commit.hash
                          ? 'bg-treeselected text-white'
                          : 'text-[color:var(--ide-dialog-fg)] hover:bg-[var(--ide-dialog-hover-bg)]',
                      )}
                    >
                      <span className="min-w-0 truncate">{commit.subject}</span>
                    </button>
                  ))
                )}
              </>
            )}
          </div>

          <div className="w-px shrink-0 bg-[color:var(--ide-dialog-border)]" />

          {/* 右侧：待推送文件树与它的工具条 */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-9 shrink-0 items-center gap-0.5 px-2">
              {/* 展开全部目录 */}
              <ToolbarButton title={t('expandAll')} onClick={() => setCollapsed(new Set())}>
                {expandAllIcon()}
              </ToolbarButton>

              {/* 折叠全部目录 */}
              <ToolbarButton title={t('collapseAll')} onClick={() => setCollapsed(new Set(directoryPaths(tree)))}>
                {collapseIcon()}
              </ToolbarButton>

              {/* 在编辑器中打开选中文件 */}
              <ToolbarButton
                title={t('pushOpenFile')}
                disabled={!canOpenFile}
                onClick={() => {
                  if (selectedPath !== null) services.openFile(selectedPath)
                }}
              >
                {eyeIcon()}
              </ToolbarButton>

              {/* 查看选中文件在「上游 → HEAD」之间的差异 */}
              <ToolbarButton
                title={t('pushShowDiff')}
                disabled={selectedPath === null || (preview?.upstream ?? '') === ''}
                onClick={() => {
                  if (selectedPath !== null && preview !== null) {
                    services.openDiff({ kind: 'commits', from: preview.upstream, to: 'HEAD', path: selectedPath })
                  }
                }}
              >
                {pencilIcon()}
              </ToolbarButton>

              {/* 打开 Git 面板查看选中提交的详情；弹窗随之关闭，后续操作在面板里继续 */}
              <ToolbarButton
                title={t('pushShowDetails')}
                disabled={selectedCommit === null}
                onClick={() => {
                  onClose()
                  services.openBottomPanel('git')
                }}
              >
                {listIcon()}
              </ToolbarButton>
            </div>

            <div className="min-h-0 flex-1 overflow-auto px-1 pb-1 [scrollbar-gutter:stable]">
              {preview !== null && files.length === 0 && (
                <div className="px-2 py-2 text-xs text-[color:var(--ide-dialog-fg)]">{t('pushDialogNoFiles')}</div>
              )}

              <PushFileTree
                t={t}
                repository={repository}
                tree={tree}
                collapsed={collapsed}
                selectedPath={selectedPath}
                onToggleCollapse={(path) =>
                  setCollapsed((previous) => {
                    const updated = new Set(previous)

                    if (updated.has(path)) updated.delete(path)
                    else updated.add(path)

                    return updated
                  })
                }
                onSelect={(file) => setSelectedPath(file.path)}
              />
            </div>
          </div>
        </div>

        {errorText !== '' && preview !== null && (
          <div className="shrink-0 px-5 pt-1 text-[12px] text-danger">{errorText}</div>
        )}

        {/* 底部操作行：帮助、Push tags 范围、取消与可下拉出 Force Push 的推送按钮 */}
        <div className="flex shrink-0 items-center gap-2.5 px-4 pb-4 pt-2">
          {/* 帮助按钮：打开 IDEA 官方文档中推送一节 */}
          <a
            href={HELP_URL}
            target="_blank"
            rel="noreferrer noopener"
            title={t('pushDialogHelp')}
            aria-label={t('pushDialogHelp')}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[color:var(--ide-dialog-control-border)] bg-[var(--ide-dialog-control-bg)] text-[12px] font-semibold text-[color:var(--ide-dialog-fg)] hover:bg-[var(--ide-dialog-hover-bg)]"
          >
            ?
          </a>

          {/* 勾选后推送时连同标签一起推 */}
          <Checkbox
            checked={pushTags}
            onChange={setPushTags}
            label={t('pushTags')}
            className="whitespace-nowrap text-[13px] text-[color:var(--ide-dialog-fg)]"
          />

          {/* 标签范围下拉：All / Current Branch，未勾选 Push tags 时置灰 */}
          <button
            type="button"
            disabled={!pushTags}
            title={t('pushTagsScope')}
            onClick={openTagsMenu}
            className="flex h-7 w-[170px] shrink-0 items-center justify-between rounded-[4px] border border-[color:var(--ide-dialog-control-border)] bg-[var(--ide-dialog-control-bg)] px-2 text-[13px] text-[color:var(--ide-dialog-fg)] hover:bg-[var(--ide-dialog-hover-bg)] disabled:cursor-default disabled:opacity-50 disabled:hover:bg-[var(--ide-dialog-control-bg)]"
          >
            <span className="min-w-0 truncate">{tagsScope === 'all' ? t('pushTagsAll') : t('pushTagsCurrentBranch')}</span>
            {chevronDownIcon()}
          </button>

          <span className="flex-1" />

          {/* 取消：不执行任何推送 */}
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="h-7 shrink-0 whitespace-nowrap rounded-[4px] border border-[color:var(--ide-dialog-control-border)] bg-[var(--ide-dialog-control-bg)] px-4 text-[13px] text-[color:var(--ide-dialog-fg)] hover:bg-[var(--ide-dialog-hover-bg)] disabled:cursor-default disabled:opacity-60"
          >
            {t('cancel')}
          </button>

          {/* 推送：主按钮直接推送，右侧箭头展开 Force Push */}
          <div
            className={cn(
              'flex h-[30px] shrink-0 items-stretch overflow-hidden rounded-[6px]',
              busy && 'opacity-60',
            )}
          >
            <button
              type="button"
              disabled={busy}
              onClick={() => void runPush(false)}
              className="bg-[var(--ide-dialog-accent)] px-4 text-[13px] font-medium text-white hover:bg-[var(--ide-dialog-accent-hover)] disabled:cursor-default"
            >
              {t('push')}
            </button>

            <span className="my-1.5 w-px shrink-0 bg-white/30" />

            <button
              type="button"
              disabled={busy}
              title={t('pushMore')}
              aria-label={t('pushMore')}
              onClick={openPushMenu}
              className="bg-[var(--ide-dialog-accent)] px-1.5 text-white hover:bg-[var(--ide-dialog-accent-hover)] disabled:cursor-default"
            >
              {chevronDownIcon()}
            </button>
          </div>
        </div>

        {handle}

        {/* 两个下拉菜单都按触发按钮定位，外观与其他右键菜单共用一套 */}
        {pushMenu !== null && <ContextMenu menu={pushMenu} onClose={() => setPushMenu(null)} />}
        {tagsMenu !== null && <ContextMenu menu={tagsMenu} onClose={() => setTagsMenu(null)} />}
      </div>
    </div>
  )
}

/** 文件树工具条按钮。 */
function ToolbarButton({
  title,
  disabled = false,
  onClick,
  children,
}: {
  title: string
  disabled?: boolean
  onClick(): void
  children: React.ReactNode
}): React.ReactElement {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className="flex h-6 w-6 items-center justify-center rounded text-[color:var(--ide-dialog-fg)] transition-colors hover:bg-[var(--ide-dialog-hover-bg)] disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}
