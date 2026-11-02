/**
 * Push Commits 对话框。
 *
 * 复刻 IDEA 的推送窗口：左侧是当前分支到上游的提交区间与未推送提交，右侧是这些
 * 提交涉及的文件树，底部是 Push tags 范围、取消与可下拉出 Force Push 的推送按钮。
 * 数据来自宿主的 pushPreview；推送动作走同一个 push 方法，命令行会进 Git 控制台。
 *
 * 左侧只有一个选中行，它同时决定右侧文件树的范围：打开时选中分支行（整段待推送
 * 内容，列出全部变更文件），点中某个提交后选中该提交行、分支行取消选中，右侧换成
 * 这个提交相对父提交的变更文件。
 *
 * 与 IDEA 截图的唯一差异是不画 macOS 三个窗口控制点：这里不是真实的原生窗口。
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'

import { cn } from '../../../common/cn'
import type { IdeMenuItem } from '../../../common/context-menu'
import { useDialogFrame } from '../../../common/dialog-frame'
import type { Translate } from '../../../types/plugin'
import { Checkbox } from '../../common/Checkbox'
import type { IdeServices } from '../../shell/contract'

// 展开/折叠沿用项目树左上角的同一对图标：同一个动作在工作台各处必须长得一样
import { collapseAllIcon, expandAllIcon } from '../project-tree/icons'
import { requestConflicts } from '../conflicts/conflicts-request'

import {
  fetchAll,
  merge,
  push,
  readCommitFiles,
  readConflictInfo,
  readPushPreview,
  readRefs,
  type GitFileStatus,
  type GitPushPreview,
} from './api'
import { buildCommitTree, type CommitFile, type CommitNode } from './commit-model'
import { DefineRemoteDialog } from './DefineRemoteDialog'
import { chevronDownIcon, pencilIcon } from './icons-ui'
import { diffIcon, showInLogIcon } from './icons-vcs'
import { requestLogFocus } from './log-focus'
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

/** 右侧文件树的取数范围：整段待推送区间，或区间里的某一个提交。 */
type PushScope = { kind: 'branch' } | { kind: 'commit'; hash: string }

/** 打开时的范围：分支行选中，右侧列出整段推送区间的全部变更文件。 */
const BRANCH_SCOPE: PushScope = { kind: 'branch' }

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
function toCommitFiles(files: GitFileStatus[]): CommitFile[] {
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
  /** 左侧唯一的选中行，同时决定右侧文件树的范围；默认选中分支行。 */
  const [scope, setScope] = useState<PushScope>(BRANCH_SCOPE)
  /** 按提交缓存的变更文件；点回已经看过的提交不必再请求一次。 */
  const [commitFiles, setCommitFiles] = useState<ReadonlyMap<string, GitFileStatus[]>>(() => new Map())
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
  /** 点击分支行上的远端名后展开的小菜单；null 表示未展开。 */
  const [remoteMenu, setRemoteMenu] = useState<MenuState | null>(null)
  /** Define Remote 对话框是否打开。 */
  const [defineRemoteOpen, setDefineRemoteOpen] = useState(false)
  /** 用户从远端菜单里选定的推送目标；空串表示按当前分支的跟踪上游推导。 */
  const [preferredRemote, setPreferredRemote] = useState('')
  const { style, rootRef, dragProps, handle } = useDialogFrame(services.dialogSizes, {
    key: SIZE_KEY,
    initial: INITIAL_SIZE,
    min: MIN_SIZE,
  })

  /** 仓库目录名：标题与文件树根节点都用它，与 IDEA 显示项目名一致。 */
  const repository = root.slice(root.lastIndexOf('/') + 1)

  /** 读取待推送内容；打开时、切换推送远端与推送成功后各读一次。 */
  const reload = useCallback(async (): Promise<void> => {
    if (root === '') return

    const result = await readPushPreview(root, preferredRemote)

    if (!result.ok) {
      // 不是仓库属于正常状态，不当作错误弹提示
      setPreview(null)
      setErrorText(result.error.code === 'GIT_NOT_REPOSITORY' ? '' : result.error.message)

      return
    }

    setPreview(result.value)
    setErrorText('')
    // 推送目标换了，区间里的提交与文件都换了一批：选中范围退回分支行，缓存一并失效
    setScope(BRANCH_SCOPE)
    setCommitFiles(new Map())
  }, [preferredRemote, root])

  useEffect(() => {
    void reload()
  }, [reload])

  const commits = preview?.commits ?? []
  /** 选中提交的 hash；分支行选中时为空串。 */
  const activeCommit = scope.kind === 'commit' ? scope.hash : ''
  /** 选中提交的变更文件；undefined 表示还没读完。 */
  const activeCommitFiles = activeCommit === '' ? undefined : commitFiles.get(activeCommit)

  // 提交的文件列表按需读取：打开弹窗时只需要整段区间的文件，不必为每个提交各跑一次 diff
  useEffect(() => {
    if (activeCommit === '' || root === '' || commitFiles.has(activeCommit)) return

    let alive = true

    void readCommitFiles(root, activeCommit)
      .then((result) => {
        if (!alive) return

        if (!result.ok) {
          console.error('[dsh-ide] 读取提交文件失败:', result.error)
          // 失败也写进缓存，避免同一条提交在每次重渲染时反复重试
          setCommitFiles((previous) => new Map(previous).set(activeCommit, []))

          return
        }

        setCommitFiles((previous) => new Map(previous).set(activeCommit, result.value.files))
      })
      .catch((error) => { // 网络层异常不会带 ApiResult，留痕后该提交按空列表显示
        console.error('[dsh-ide] 读取提交文件失败:', error)

        if (alive) setCommitFiles((previous) => new Map(previous).set(activeCommit, []))
      })

    return () => {
      alive = false
    }
  }, [activeCommit, commitFiles, root])

  /** 当前范围对应的文件：分支行是整段推送区间，提交行是那一个提交。 */
  const scopeFiles = useMemo(() => {
    if (scope.kind === 'commit') return activeCommitFiles ?? []

    return preview?.files ?? []
  }, [activeCommitFiles, preview, scope])

  const files = useMemo(() => toCommitFiles(scopeFiles), [scopeFiles])
  const tree = useMemo(() => buildCommitTree(files), [files])
  /** 选中提交的文件还在读取中：先不显示空提示，免得闪一下「没有文件」。 */
  const loadingFiles = scope.kind === 'commit' && activeCommitFiles === undefined
  /** 选中文件对应的变更；删除的文件没有工作区副本，不能直接打开。 */
  const selectedStatus = files.find((file) => file.path === selectedPath)?.change.indexStatus ?? ''
  const canOpenFile = selectedPath !== null && selectedStatus !== 'D' && selectedStatus !== ''

  /**
   * 切换左侧选中行；文件选中项一并清掉，避免停在不在当前列表里的文件上。
   * @param next 新的范围
   */
  const selectScope = useCallback((next: PushScope): void => {
    setScope(next)
    setSelectedPath(null)
  }, [])

  /**
   * 当前范围的差异基准：整段推送取「上游 → HEAD」，单个提交取「父提交 → 该提交」。
   * 根提交没有父提交，与提交详情一样用自身与自己比较，差异为空而不是报错。
   */
  const diffRange = useMemo(() => {
    if (scope.kind === 'commit') {
      const parent = commits.find((commit) => commit.hash === scope.hash)?.parents[0]

      return { from: parent ?? scope.hash, to: scope.hash }
    }

    return { from: preview?.upstream ?? '', to: 'HEAD' }
  }, [commits, preview?.upstream, scope])

  /**
   * 合并上游成功后重试一次推送。
   *
   * 带上与首次推送相同的选项：强制推送不在此列——冲突补救只处理普通推送被拒的场景，
   * 强制推送失败通常意味着远端保护或权限问题，重复一次没有意义。
   */
  const retryPush = useCallback(async (): Promise<void> => {
    const result = await push(root, {
      ...(pushTags ? { tags: tagsScope } : {}),
      ...(preview === null ? {} : { remote: preview.remote }),
    })

    if (!result.ok) {
      console.error('[dsh-ide] 合并后推送失败:', result.error)
      services.toast('error', result.error.message)

      return
    }

    services.refreshGitStatus()
    services.toast('success', t('pushSucceeded'))
  }, [preview, pushTags, root, services, t, tagsScope])

  /**
   * 推送被拒后的自动补救：抓取远端并把上游合入当前分支。
   *
   * 远端比本地新时 git 只会拒绝推送，本身不产生冲突；要真正拿到冲突必须先把上游合并
   * 进来。合并成功就重试推送；合并出冲突则关掉推送窗、弹出冲突窗口，用户在那边解决完
   * 再自动接着推。
   * @returns 是否已接管后续流程；false 表示调用方仍按普通推送失败处理
   */
  const syncWithUpstream = useCallback(async (): Promise<boolean> => {
    const refs = await readRefs(root)
    const upstream = refs.ok ? (refs.value.local.find((branch) => branch.isHead)?.upstream ?? '') : ''

    // 没有跟踪分支就无从合并，按普通失败提示
    if (upstream === '') return false

    const fetched = await fetchAll(root)

    if (!fetched.ok) {
      console.error('[dsh-ide] 推送被拒后抓取远端失败:', fetched.error)
      services.toast('error', fetched.error.message)

      return true
    }

    const merged = await merge(root, upstream)

    if (!merged.ok) {
      const conflicts = await readConflictInfo(root)

      if (conflicts.ok && conflicts.value.files.length > 0) {
        services.refreshGitStatus()
        services.invalidate()
        onClose()
        requestConflicts({ flow: 'push', onFinished: () => void retryPush() })

        return true
      }

      console.error('[dsh-ide] 推送被拒后合并上游失败:', merged.error)
      services.toast('error', `${t('pushMergeFailed')}: ${merged.error.message}`)

      return true
    }

    await retryPush()

    return true
  }, [onClose, retryPush, root, services, t])

  /**
   * 执行推送。
   * @param force 是否使用强制推送
   */
  const runPush = useCallback(
    async (force: boolean): Promise<void> => {
      if (root === '' || busy) return

      setBusy(true)

      try {
        const result = await push(root, {
          force,
          ...(pushTags ? { tags: tagsScope } : {}),
          ...(preview === null ? {} : { remote: preview.remote }),
        })

        if (!result.ok) {
          console.error('[dsh-ide] 推送失败:', result.error)

          // 远端有新提交时自动合入上游；冲突交给冲突窗口，合并成功则重试推送
          if (!force && isRejectedPush(result.error.message) && (await syncWithUpstream())) return

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
    [busy, onClose, preview, pushTags, root, services, syncWithUpstream, t, tagsScope],
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

  /** 展开远端菜单：列出所有已配置远端，下面接 Define remote 入口。 */
  const openRemoteMenu = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>): void => {
      const rect = event.currentTarget.getBoundingClientRect()
      const items: IdeMenuItem[] = [
        // 每个已配置远端都能作为推送目标；点击后按该远端重算待推送内容
        ...(preview?.remotes ?? []).map((name) => ({
          id: `remote:${name}`,
          label: name,
          run: () => setPreferredRemote(name),
        })),
        // 打开 Define Remote 对话框，补齐或改写远端地址
        { id: 'define', label: t('pushDefineRemote'), highlight: true, run: () => setDefineRemoteOpen(true) },
      ]

      setRemoteMenu({ x: rect.left - 8, y: rect.bottom + 4, items, minWidth: 160 })
    },
    [preview?.remotes, t],
  )

  // Esc 关闭、Enter 推送：与桌面 IDE 的对话框习惯一致；下拉展开时交给菜单自己处理
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (busy || pushMenu !== null || tagsMenu !== null || remoteMenu !== null || defineRemoteOpen) return

      if (event.key === 'Escape') onClose()

      if (event.key === 'Enter') {
        event.preventDefault()
        void runPush(false)
      }
    }

    window.addEventListener('keydown', onKeyDown, true)

    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [busy, defineRemoteOpen, onClose, pushMenu, remoteMenu, runPush, tagsMenu])

  return (
    <div
      className="fixed inset-0 z-[9995] flex items-center justify-center bg-black/30 p-4"
      // 点击遮罩关闭；推送进行中不允许关闭
      onClick={() => {
        if (!busy) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('pushDialogTitle').replace('{repo}', repository)}
        className="relative flex flex-col overflow-hidden rounded-[12px] border border-[color:var(--ide-dialog-border)] bg-[var(--ide-dialog-bg)] shadow-2xl"
        style={style}
        ref={rootRef}
        onClick={(event) => event.stopPropagation()}
      >
        {/* 标题行：只保留标题，不画 macOS 的三个窗口控制点；按住可拖动弹窗位置 */}
        <div className="flex shrink-0 cursor-move select-none items-center px-5 pb-2 pt-3.5" {...dragProps}>
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
                {/* 分支行：当前分支 → 远端 : 远端分支；选中时整段区间都是右侧文件树的范围 */}
                {preview.branch !== '' && (
                  <div
                    onClick={() => selectScope(BRANCH_SCOPE)}
                    className={cn(
                      'flex h-[25px] shrink-0 cursor-pointer items-center gap-1 px-3 text-xs',
                      scope.kind === 'branch'
                        ? 'bg-treeselected'
                        : 'hover:bg-[var(--ide-dialog-hover-bg)]',
                    )}
                  >
                    <span
                      className={cn(
                        'min-w-0 truncate font-medium',
                        scope.kind === 'branch' ? 'text-white' : 'text-[color:var(--ide-dialog-fg)]',
                      )}
                    >
                      {preview.branch}
                    </span>

                    <span className="shrink-0 pl-1 text-[color:var(--ide-ic-blue)]">→</span>

                    {/* 远端名可点击：与 IDEA 一样弹出含 Define remote 的小菜单；点了远端名就不再改选中行 */}
                    <button
                      type="button"
                      title={t('pushDefineRemote')}
                      onClick={(event) => {
                        event.stopPropagation()
                        openRemoteMenu(event)
                      }}
                      className="min-w-0 shrink-0 truncate text-[color:var(--ide-ic-blue)] hover:underline"
                    >
                      {preview.remote}
                    </button>

                    <span className="min-w-0 truncate text-[color:var(--ide-ic-blue)]">: {preview.target}</span>

                    {preview.isNewBranch && (
                      // 远端还没有这个分支：首次推送会新建它
                      <span className="ml-1 shrink-0 rounded-[3px] bg-white/15 px-1 text-[10px] leading-[15px] text-white/80">
                        {t('pushDialogNewBranch')}
                      </span>
                    )}
                  </div>
                )}

                {/* 未推送的提交；选中某一行后分支行取消选中，右侧换成该提交的变更文件 */}
                {commits.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-[color:var(--ide-dialog-fg)]">{t('pushDialogNoCommits')}</div>
                ) : (
                  commits.map((commit) => (
                    <button
                      key={commit.hash}
                      type="button"
                      title={commit.subject}
                      onClick={() => selectScope({ kind: 'commit', hash: commit.hash })}
                      className={cn(
                        'flex h-[25px] w-full shrink-0 items-center px-6 text-left text-xs',
                        scope.kind === 'commit' && scope.hash === commit.hash
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
              {/* 展开全部目录：向外扩张的双箭头，与项目树、Local Changes 的展开按钮同一枚 */}
              <ToolbarButton title={t('expandAll')} onClick={() => setCollapsed(new Set())}>
                {expandAllIcon()}
              </ToolbarButton>

              {/* 折叠全部目录：向内收拢的双箭头，与展开按钮互为逆操作 */}
              <ToolbarButton title={t('collapseAll')} onClick={() => setCollapsed(new Set(directoryPaths(tree)))}>
                {collapseAllIcon()}
              </ToolbarButton>

              {/* 在编辑器中打开选中文件：与差异工具条的 Open in Editor 同一枚笔形图标 */}
              <ToolbarButton
                title={t('pushOpenFile')}
                disabled={!canOpenFile}
                onClick={() => {
                  if (selectedPath !== null) services.openFile(selectedPath)
                }}
              >
                {pencilIcon()}
              </ToolbarButton>

              {/* 查看选中文件在当前范围内的差异：整段推送区间或选中的单个提交；双箭头是差异动作的固定图标 */}
              <ToolbarButton
                title={t('pushShowDiff')}
                disabled={selectedPath === null || diffRange.from === ''}
                onClick={() => {
                  if (selectedPath !== null) {
                    services.openDiff({ kind: 'commits', from: diffRange.from, to: diffRange.to, path: selectedPath })
                  }
                }}
              >
                {diffIcon()}
              </ToolbarButton>

              {/* 在 Log 中定位选中提交：与 History 页签的 Show in Log 同一套动作，切到 Log 页签并选中它 */}
              <ToolbarButton
                title={t('showInLog')}
                disabled={scope.kind !== 'commit'}
                onClick={() => {
                  if (scope.kind !== 'commit') return

                  // 先把定位意图交出去再打开面板：面板没挂载时它会留着等面板取走
                  requestLogFocus(scope.hash)
                  onClose()
                  services.openBottomPanel('git')
                }}
              >
                {showInLogIcon()}
              </ToolbarButton>
            </div>

            <div className="min-h-0 flex-1 overflow-auto px-1 pb-1 [scrollbar-gutter:stable]">
              {preview !== null && files.length === 0 && !loadingFiles && (
                <div className="px-2 py-2 text-xs text-[color:var(--ide-dialog-fg)]">
                  {scope.kind === 'commit' ? t('pushDialogNoCommitFiles') : t('pushDialogNoFiles')}
                </div>
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

        {/* 三个下拉菜单都按触发按钮定位，外观与其他右键菜单共用一套 */}
        {pushMenu !== null && <ContextMenu menu={pushMenu} onClose={() => setPushMenu(null)} />}
        {tagsMenu !== null && <ContextMenu menu={tagsMenu} onClose={() => setTagsMenu(null)} />}
        {remoteMenu !== null && <ContextMenu menu={remoteMenu} onClose={() => setRemoteMenu(null)} />}

        {/* 定义远端：保存后重读待推送内容，分支行随之显示新的推送目标 */}
        {defineRemoteOpen && (
          <DefineRemoteDialog
            t={t}
            root={root}
            name={preview?.remote ?? 'origin'}
            dialogSizes={services.dialogSizes}
            onSaved={() => {
              void reload()
              // 远端列表变了：状态栏与分支树也要跟着刷新
              services.refreshGitStatus()
              services.invalidate()
            }}
            onClose={() => setDefineRemoteOpen(false)}
          />
        )}
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

/**
 * 判断推送失败是否因为远端有本地没有的提交。
 *
 * 这类失败走自动合并补救；认证、无权限、远端不存在等错误照旧原样提示，不做补救。
 * @param message git 的错误输出
 * @returns 需要先合入上游时为 true
 */
function isRejectedPush(message: string): boolean {
  return /non-fast-forward|fetch first|Updates were rejected|out of date|\[rejected\]/i.test(message)
}
