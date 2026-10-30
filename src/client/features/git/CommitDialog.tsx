/**
 * Commit 弹窗。
 *
 * 复刻 IDEA 的 Commit Changes 对话框：上方是按目录分组的变更树（勾选结果决定
 * 本次提交路径），中部填写提交信息，下方内嵌差异视图，底部是取消与提交。
 *
 * 按产品要求，右侧的 Git 面板（Author / Amend / Commit Checks）与提交信息右上角
 * 的两个快捷入口不实现，其余区域占满弹窗宽度；文案固定英文。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

import { useDialogFrame } from '../../../common/dialog-frame'
import type { DiffSource } from '../../../common/diff-source'
import { SplitHandle } from '../../../common/split-handle'
import type { Translate } from '../../../types/plugin'
import type { IdeServices } from '../../shell/contract'

import { commitFiles, push, readStatus, type GitStatus } from './api'
import {
  buildCommitTree,
  flattenFiles,
  splitFiles,
  summarize,
  type CommitFile,
  type CommitSummary,
} from './commit-model'
import { CommitTree, UNTRACKED_KEY } from './CommitTree'
import { DiffView } from './DiffView'
import type { SelectedChange } from './diff-model'
import {
  arrowDownIcon,
  arrowUpIcon,
  chevronDownIcon,
  chevronRightIcon,
  refreshIcon,
  rollbackIcon,
} from './icons'
import { ContextMenu, type MenuItem, type MenuState } from './menu'
import { RollbackDialog } from './RollbackDialog'

/** 变更树高度上下限（px）：太矮看不到一层目录，太高会把差异区挤没。 */
const MIN_TREE_HEIGHT = 96
const MAX_TREE_HEIGHT = 380

/** 提交信息区高度上下限（px）：默认恰好容纳 3 行，最矮保留 2 行。 */
const MIN_MESSAGE_HEIGHT = 84
const MAX_MESSAGE_HEIGHT = 320

/** 弹窗默认大小：取可用区域的 88%×92%，最多 1040×820，与原来一致。 */
const INITIAL_SIZE = { widthRatio: 0.88, heightRatio: 0.92, maxWidth: 1040, maxHeight: 820 }

/** 缩放下限：再小变更树与差异区就没法并排看了。 */
const MIN_SIZE = { width: 640, height: 480 }

/** 弹窗标识：提交框的尺寸单独记忆。 */
const SIZE_KEY = 'commit'

/** 提交统计的文案 key。 */
const SUMMARY_KEYS: Record<CommitSummary['key'], string> = {
  modified: 'statModified',
  added: 'statAdded',
  deleted: 'statDeleted',
  unversioned: 'statUnversioned',
}

/** Commit 弹窗 props。 */
export interface CommitDialogProps {
  /** 已绑定 git 前缀的翻译函数。 */
  t: Translate
  /** 工作台服务总线。 */
  services: IdeServices
  /** 关闭弹窗。 */
  onClose(): void
}

/**
 * 渲染 Commit 弹窗。
 * @param props 见 CommitDialogProps
 * @returns 模态弹窗
 */
export function CommitDialog({ t, services, onClose }: CommitDialogProps): React.ReactElement {
  const root = useSyncExternalStore(
    (listener) => services.subscribeRoot(listener),
    () => services.root,
    () => services.root,
  )

  const [status, setStatus] = useState<GitStatus | null>(null)
  const [errorText, setErrorText] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  /** 已勾选的路径。 */
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set())
  /** 已折叠的目录路径与未跟踪分组。 */
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set([UNTRACKED_KEY]))
  const [selected, setSelected] = useState<SelectedChange | null>(null)
  const [diffOpen, setDiffOpen] = useState(true)
  /** 回滚、刷新等操作后递增，让差异视图重新取数。 */
  const [revision, setRevision] = useState(0)
  /** 变更树高度（px），由上方分隔条拖动调整。 */
  const [treeHeight, setTreeHeight] = useState(200)
  /** 提交信息区高度（px）：默认容纳 3 行，由下方分隔条拖动调整。 */
  const [messageHeight, setMessageHeight] = useState(92)
  const [menu, setMenu] = useState<MenuState | null>(null)
  /** 是否打开 Rollback Changes 对话框。 */
  const [rollbackOpen, setRollbackOpen] = useState(false)
  /** 遮罩容器：弹窗挂在 IDE 面板里，尺寸上限要按它算而不是整页视口。 */
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const { style, rootRef, dragProps, handle } = useDialogFrame(services.dialogSizes, {
    key: SIZE_KEY,
    initial: INITIAL_SIZE,
    min: MIN_SIZE,
    bounds: overlayRef,
  })

  /**
   * 读取工作区状态。
   */
  const refresh = useCallback(async (): Promise<void> => {
    if (root === '') return

    const result = await readStatus(root)

    if (!result.ok) {
      // 不是仓库属于正常状态，不当作错误弹提示
      setStatus(null)
      setErrorText(result.error.code === 'GIT_NOT_REPOSITORY' ? '' : result.error.message)

      return
    }

    setStatus(result.value)
    setErrorText('')
  }, [root])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const groups = useMemo(
    (): { tracked: CommitFile[]; untracked: CommitFile[] } =>
      status === null ? { tracked: [], untracked: [] } : splitFiles(status),
    [status],
  )
  const tree = useMemo(() => buildCommitTree(groups.tracked), [groups.tracked])
  /** 树内文件与未跟踪文件的合并顺序，与界面显示一致。 */
  const allFiles = useMemo(() => [...flattenFiles(tree), ...groups.untracked], [groups.untracked, tree])
  const checkedFiles = useMemo(() => allFiles.filter((file) => checked.has(file.path)), [allFiles, checked])
  const summary = useMemo(() => summarize(allFiles), [allFiles])

  /** 勾选文件对应的差异来源，供下方差异视图的文件导航使用。 */
  const checkedSources = useMemo<DiffSource[]>(
    () => checkedFiles.map((file) => ({ kind: 'worktree', path: file.path, staged: file.staged })),
    [checkedFiles],
  )

  /** 选中项对应的差异来源；与 Git 面板一样固定为工作区来源。 */
  const selectedSource = useMemo<DiffSource | null>(
    () => (selected === null ? null : { kind: 'worktree', path: selected.path, staged: selected.staged }),
    [selected],
  )

  /** 差异视图切换文件：工作区来源直接映射回树的选中项。 */
  const selectSource = useCallback((next: DiffSource): void => {
    if (next.kind !== 'worktree') return

    setSelected({ path: next.path, staged: next.staged })
  }, [])

  // 状态到位后默认勾选全部已跟踪文件；未跟踪文件需要用户主动勾选，与 IDEA 一致
  useEffect(() => {
    if (status === null) return

    setChecked(new Set(groups.tracked.map((file) => file.path)))

    const first = flattenFiles(tree)[0]
    setSelected(first === undefined ? null : { path: first.path, staged: first.staged })
  }, [groups.tracked, status, tree])

  /**
   * 切换一组文件的勾选状态。
   * @param files 目标文件
   * @param next 是否勾选
   */
  const toggleFiles = useCallback((files: CommitFile[], next: boolean): void => {
    setChecked((previous) => {
      const updated = new Set(previous)

      for (const file of files) {
        if (next) updated.add(file.path)
        else updated.delete(file.path)
      }

      return updated
    })
  }, [])

  /** 切换目录或分组的折叠状态。 */
  function toggleCollapse(key: string): void {
    setCollapsed((previous) => {
      const updated = new Set(previous)

      if (updated.has(key)) updated.delete(key)
      else updated.add(key)

      return updated
    })
  }

  /**
   * 调整变更树高度并收窄到合法区间。
   * @param next 分隔条给出的新高度
   */
  const resizeTree = useCallback((next: number): void => {
    setTreeHeight(Math.min(Math.max(next, MIN_TREE_HEIGHT), MAX_TREE_HEIGHT))
  }, [])

  /**
   * 调整提交信息区高度并收窄到合法区间。
   * @param next 分隔条给出的新高度
   */
  const resizeMessage = useCallback((next: number): void => {
    setMessageHeight(Math.min(Math.max(next, MIN_MESSAGE_HEIGHT), MAX_MESSAGE_HEIGHT))
  }, [])

  /** 重新读取工作区状态，并让差异视图重新取数。 */
  const reloadStatus = useCallback((): void => {
    void refresh()
      .then(() => setRevision((previous) => previous + 1))
      .catch((error: unknown) => {
        console.error('[dsh-ide] Commit 弹窗刷新工作区状态失败:', error)
      })
  }, [refresh])

  /**
   * 提交勾选的文件。
   * @param andPush 提交成功后是否继续推送
   */
  const submit = useCallback(
    async (andPush: boolean): Promise<void> => {
      if (root === '') return

      const paths = checkedFiles.map((file) => file.path)

      if (message.trim() === '') {
        setErrorText(t('commitMessageRequired'))

        return
      }

      if (paths.length === 0) {
        setErrorText(t('nothingSelected'))

        return
      }

      setBusy(true)

      try {
        const result = await commitFiles(root, message, paths)

        if (!result.ok) {
          setErrorText(result.error.message)

          return
        }

        services.refreshGitStatus()
        services.invalidate()
        services.toast('success', t('commitSucceeded'))
        onClose()

        if (!andPush) return

        const pushed = await push(root)

        if (!pushed.ok) {
          services.toast('error', pushed.error.message)

          return
        }

        services.toast('success', t('pushSucceeded'))
      } finally {
        setBusy(false)
      }
    },
    [checkedFiles, message, onClose, root, services, t],
  )

  /**
   * 打开提交下拉菜单（提交 / 提交并推送）。
   * @param event 鼠标事件
   */
  const openCommitMenu = useCallback(
    (event: React.MouseEvent): void => {
      const rect = event.currentTarget.getBoundingClientRect()
      const items: MenuItem[] = [
        // 只提交，不推送到远端
        { id: 'commit', label: t('commitAction'), run: () => void submit(false) },
        // 提交后接着推送当前分支
        { id: 'commitAndPush', label: t('commitAndPush'), run: () => void submit(true) },
      ]

      setMenu({ x: rect.left - 90, y: rect.top - 62, items })
    },
    [submit, t],
  )

  // Esc 先关菜单、再关弹窗，避免一次按键连关两层；Rollback 对话框打开时由它自己处理
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return

      if (menu !== null) {
        setMenu(null)

        return
      }

      if (rollbackOpen) return

      onClose()
    }

    window.addEventListener('keydown', onKeyDown)

    return () => window.removeEventListener('keydown', onKeyDown)
  }, [menu, onClose, rollbackOpen])

  /** changelist 名称取仓库目录名，与 IDEA 默认用项目名一致。 */
  const changelistName = root.slice(root.lastIndexOf('/') + 1)

  return (
    <div ref={overlayRef} className="absolute inset-0 z-[9995] flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('commitDialogTitle')}
        className="relative flex flex-col overflow-hidden rounded-md border border-line2 bg-code shadow-2xl"
        style={style}
        ref={rootRef}
      >
        {/* 标题栏：按住可拖动弹窗位置 */}
        <div
          className="flex h-7 shrink-0 cursor-move select-none items-center border-b border-line1 bg-tabbar px-3"
          {...dragProps}
        >
          <span className="text-xs font-semibold text-primary">{t('commitDialogTitle')}</span>
        </div>

        {/* 工具条：回滚选中文件、刷新工作区状态；右侧是 changelist 上下切换 */}
        <div className="flex h-8 shrink-0 items-center gap-0.5 px-2">
          {/* 回滚：撤销选中文件在工作区的改动 */}
          <ToolbarButton title={t('rollback')} disabled={busy} onClick={() => setRollbackOpen(true)}>
            {rollbackIcon()}
          </ToolbarButton>

          {/* 刷新：重新读取工作区状态并刷新差异内容 */}
          <ToolbarButton title={t('refresh')} disabled={busy} onClick={reloadStatus}>
            {refreshIcon()}
          </ToolbarButton>

          <span className="flex-1" />

          {/* 只有一个 changelist 时，上下切换保持禁用，与 IDEA 的置灰状态一致 */}
          <ToolbarButton title={t('previousChangeList')} disabled onClick={() => undefined}>
            {arrowUpIcon()}
          </ToolbarButton>

          <ToolbarButton title={t('nextChangeList')} disabled onClick={() => undefined}>
            {arrowDownIcon()}
          </ToolbarButton>
        </div>

        {/* 变更树：高度由下方分隔条拖动调整 */}
        <div
          className="min-h-0 shrink overflow-auto py-0.5 [scrollbar-gutter:stable]"
          style={{ height: treeHeight }}
        >
          {root === '' && <div className="px-3 py-2 text-xs text-secondary">{t('noSession')}</div>}

          {root !== '' && status === null && (
            <div className="px-3 py-2 text-xs text-secondary">{errorText === '' ? t('notRepository') : errorText}</div>
          )}

          {status !== null && allFiles.length === 0 && (
            <div className="px-3 py-2 text-xs text-secondary">{t('clean')}</div>
          )}

          {/* 变更树：勾选决定本次提交范围，未跟踪文件单独成组 */}
          <CommitTree
            t={t}
            changelist={changelistName}
            tree={tree}
            untracked={groups.untracked}
            checked={checked}
            collapsed={collapsed}
            selectedPath={selected?.path ?? null}
            onToggleCheck={toggleFiles}
            onToggleCollapse={toggleCollapse}
            onSelect={(file) => setSelected({ path: file.path, staged: file.staged })}
          />
        </div>

        {/* 变更统计：如「4 modified」 */}
        {summary.length > 0 && (
          <div className="shrink-0 px-3 py-1 text-[11px] text-secondary">
            {summary.map((item) => `${String(item.count)} ${t(SUMMARY_KEYS[item.key])}`).join(', ')}
          </div>
        )}

        {errorText !== '' && status !== null && (
          <div className="shrink-0 px-3 py-1 text-[11px] text-danger">{errorText}</div>
        )}

        {/* 树区与提交信息之间的分隔条：拖动改变树高，尺寸属于上方区域 */}
        <SplitHandle orientation="horizontal" anchor="front" current={() => treeHeight} onResize={resizeTree} />

        {/* 提交信息：高度由下方分隔条拖动调整 */}
        <div
          className="flex min-h-0 shrink flex-col px-3 pb-2 pt-1.5"
          style={{ height: messageHeight }}
        >
          {/* 提交信息分组标题 */}
          <div className="mb-1 shrink-0 text-[11px] text-secondary">{t('commitMessage')}</div>

          {/* 提交信息输入框；默认 3 行，自动聚焦，打开弹窗即可输入 */}
          <textarea
            autoFocus
            rows={3}
            value={message}
            spellCheck={false}
            onChange={(event) => setMessage(event.target.value)}
            className="min-h-0 w-full flex-1 resize-none rounded border border-inputborder bg-inputbg px-2 py-1 font-mono text-xs text-primary outline-none focus:border-actionblue"
          />
        </div>

        {/* 提交信息与差异区之间的分隔条：拖动改变提交信息高度，尺寸属于上方区域 */}
        <SplitHandle orientation="horizontal" anchor="front" current={() => messageHeight} onResize={resizeMessage} />

        {/* 差异区：占满剩余高度；折叠时只留标题，不占弹性空间 */}
        <div className={diffOpen ? 'flex min-h-[120px] flex-1 flex-col' : 'flex shrink-0 flex-col'}>
          <button
            type="button"
            onClick={() => setDiffOpen((previous) => !previous)}
            className="flex h-6 shrink-0 items-center gap-1 px-2 text-[11px] font-semibold text-primary"
          >
            {diffOpen ? chevronDownIcon() : chevronRightIcon()}
            {/* 差异区域标题 */}
            {t('diffSection')}
          </button>

          {diffOpen && (
            <div className="min-h-0 flex-1">
              <DiffView
                t={t}
                services={services}
                root={root}
                source={selectedSource}
                files={checkedSources}
                onSelect={selectSource}
                onClose={() => setSelected(null)}
                revision={revision}
                headShort={status?.headShort ?? ''}
              />
            </div>
          )}
        </div>

        {/* 底栏：帮助、取消与提交 */}
        <div className="flex h-11 shrink-0 items-center gap-2 border-t border-line1 px-3">
          <button
            type="button"
            title={t('help')}
            aria-label={t('help')}
            className="flex h-5 w-5 items-center justify-center rounded-full border border-line4 text-[11px] text-secondary transition-colors hover:text-primary"
          >
            ?
          </button>

          <span className="flex-1" />

          {/* 取消：关闭弹窗，不做任何提交 */}
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-line2 bg-surface2 px-3 py-1 text-xs text-primary transition-colors hover:bg-surface3"
          >
            {t('cancel')}
          </button>

          <div className="flex items-center overflow-hidden rounded bg-actionblue">
            {/* 提交按钮：只提交，不推送 */}
            <button
              type="button"
              disabled={busy || allFiles.length === 0}
              onClick={() => void submit(false)}
              className="px-3 py-1 text-xs font-medium text-onAccent transition-colors hover:bg-actionbluehover disabled:cursor-default disabled:opacity-60"
            >
              {busy ? t('loading') : t('commitAction')}
            </button>

            <span className="h-4 w-px bg-onAccent/40" />

            {/* 提交流程下拉：提交或提交并推送 */}
            <button
              type="button"
              title={t('commitAction')}
              aria-label={t('commitAction')}
              disabled={busy}
              onClick={openCommitMenu}
              className="px-1 py-1 text-onAccent transition-colors hover:bg-actionbluehover disabled:cursor-default disabled:opacity-60"
            >
              {chevronDownIcon()}
            </button>
          </div>
        </div>

        {handle}
      </div>

      {menu !== null && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}

      {/* Rollback Changes 对话框：回滚完成后重读状态，让树与差异一起更新 */}
      {rollbackOpen && (
        <RollbackDialog
          t={t}
          services={services}
          root={root}
          onClose={() => setRollbackOpen(false)}
          onRolledBack={() => {
            void refresh()
            setRevision((previous) => previous + 1)
          }}
        />
      )}
    </div>
  )
}

/** 弹窗工具条按钮。 */
function ToolbarButton({
  title,
  disabled = false,
  onClick,
  children,
}: {
  title: string
  disabled?: boolean
  onClick(event: React.MouseEvent): void
  children: React.ReactNode
}): React.ReactElement {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className="flex h-6 w-6 items-center justify-center rounded text-primary transition-colors hover:bg-surface2 disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}

