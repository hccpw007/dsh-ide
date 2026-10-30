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

import type { Translate } from '../../../types/plugin'
import { ConfirmDialog, type ConfirmRequest } from '../../common/ConfirmDialog'
import type { IdeServices } from '../../shell/contract'

import { commitFiles, discard, push, readStatus, type GitStatus } from './api'
import {
  buildCommitTree,
  flattenFiles,
  splitFiles,
  summarize,
  type CommitFile,
  type CommitSummary,
} from './commit-model'
import { CommitTree, UNTRACKED_KEY } from './CommitTree'
import { recordGitConsole } from './console-store'
import { DiffView, type SelectedChange } from './DiffView'
import {
  arrowDownIcon,
  arrowUpIcon,
  chevronDownIcon,
  chevronRightIcon,
  closeIcon,
  eyeIcon,
  redoIcon,
  rollbackIcon,
  undoIcon,
} from './icons'
import { ContextMenu, type MenuItem, type MenuState } from './menu'

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
  /** 回滚等写操作后递增，让差异视图重新取数。 */
  const [revision, setRevision] = useState(0)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null)
  /** 提交信息的撤销历史：与编辑器一致，逐次编辑可回退重做。 */
  const historyRef = useRef<{ stack: string[]; index: number }>({ stack: [''], index: 0 })

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

  /** 记录一次提交信息编辑；截断重做分支，避免撤销后再输入留下失效历史。 */
  const updateMessage = useCallback((value: string): void => {
    setMessage(value)

    const history = historyRef.current
    history.stack = [...history.stack.slice(0, history.index + 1), value]
    history.index = history.stack.length - 1
  }, [])

  /** 回退到上一条提交信息。 */
  const undoMessage = useCallback((): void => {
    const history = historyRef.current
    if (history.index <= 0) return

    history.index -= 1
    setMessage(history.stack[history.index] ?? '')
  }, [])

  /** 前进到下一条提交信息。 */
  const redoMessage = useCallback((): void => {
    const history = historyRef.current
    if (history.index >= history.stack.length - 1) return

    history.index += 1
    setMessage(history.stack[history.index] ?? '')
  }, [])

  /**
   * 丢弃一个文件的改动；未跟踪文件按目录清理处理。
   * @param file 目标文件
   */
  const discardFile = useCallback(
    async (file: CommitFile): Promise<void> => {
      setBusy(true)

      try {
        const result = await discard(root, [file.path], file.untracked)

        if (!result.ok) {
          recordGitConsole({
            cwd: root,
            command: `git restore -- ${file.path}`,
            stdout: '',
            stderr: result.error.message,
            ok: false,
          })
          setErrorText(result.error.message)

          return
        }

        recordGitConsole({
          cwd: root,
          command: result.value.command,
          stdout: result.value.stdout,
          stderr: result.value.stderr,
          ok: true,
        })
        await refresh()
        setRevision((previous) => previous + 1)
        services.refreshGitStatus()
        services.invalidate()
      } finally {
        setBusy(false)
      }
    },
    [refresh, root, services],
  )

  /** 回滚当前选中文件的改动，先让用户确认。 */
  const rollbackSelected = useCallback((): void => {
    const file = allFiles.find((item) => item.path === selected?.path)
    if (file === undefined) return

    setConfirm({
      title: t('rollback'),
      message: `Discard all changes in ${file.path}? This action cannot be undone.`,
      // 确认按钮：执行回滚
      confirmLabel: t('rollback'),
      // 取消按钮：关闭确认框
      cancelLabel: t('cancel'),
      danger: true,
      run: () => void discardFile(file),
    })
  }, [allFiles, discardFile, selected, t])

  /** 在差异区显示第一个勾选的文件。 */
  const showFirstDiff = useCallback((): void => {
    const first = checkedFiles[0]
    if (first === undefined) return

    setSelected({ path: first.path, staged: first.staged })
    setDiffOpen(true)
  }, [checkedFiles])

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
          recordGitConsole({
            cwd: root,
            command: `git commit (${String(paths.length)} files)`,
            stdout: '',
            stderr: result.error.message,
            ok: false,
          })
          setErrorText(result.error.message)

          return
        }

        recordGitConsole({
          cwd: root,
          command: result.value.command,
          stdout: result.value.stdout,
          stderr: result.value.stderr,
          ok: true,
        })
        services.refreshGitStatus()
        services.invalidate()
        services.notify('success', t('commitSucceeded'))
        onClose()

        if (!andPush) return

        const pushed = await push(root)

        if (!pushed.ok) {
          services.notify('error', pushed.error.message)

          return
        }

        services.notify('success', t('pushSucceeded'))
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

  // Esc 先关菜单、再关弹窗，避免一次按键连关两层
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return

      if (menu !== null) {
        setMenu(null)

        return
      }

      onClose()
    }

    window.addEventListener('keydown', onKeyDown)

    return () => window.removeEventListener('keydown', onKeyDown)
  }, [menu, onClose])

  /** changelist 名称取仓库目录名，与 IDEA 默认用项目名一致。 */
  const changelistName = root.slice(root.lastIndexOf('/') + 1)

  return (
    <div className="absolute inset-0 z-[9995] flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('commitDialogTitle')}
        className="flex h-[min(92%,820px)] w-[min(96%,1240px)] flex-col overflow-hidden rounded-md border border-line2 bg-code shadow-2xl"
      >
        {/* 标题栏 */}
        <div className="flex h-7 shrink-0 items-center border-b border-line1 bg-tabbar px-3">
          <span className="text-xs font-semibold text-primary">{t('commitDialogTitle')}</span>
        </div>

        {/* 工具条：回滚、撤销重做、显示差异；右侧是 changelist 导航与选择 */}
        <div className="flex h-8 shrink-0 items-center gap-0.5 px-2">
          <ToolbarButton title={t('rollbackSelected')} disabled={selected === null || busy} onClick={rollbackSelected}>
            {rollbackIcon()}
          </ToolbarButton>

          <ToolbarButton title={t('undo')} disabled={historyRef.current.index === 0} onClick={undoMessage}>
            {undoIcon()}
          </ToolbarButton>

          <ToolbarButton
            title={t('redo')}
            disabled={historyRef.current.index >= historyRef.current.stack.length - 1}
            onClick={redoMessage}
          >
            {redoIcon()}
          </ToolbarButton>

          <ToolbarButton title={t('showDiff')} disabled={checkedFiles.length === 0} onClick={showFirstDiff}>
            {eyeIcon()}
          </ToolbarButton>

          <span className="flex-1" />

          {/* 只有一个 changelist 时，上下切换保持禁用，与 IDEA 的置灰状态一致 */}
          <ToolbarButton title={t('previousChangeList')} disabled onClick={() => undefined}>
            {arrowUpIcon()}
          </ToolbarButton>

          <ToolbarButton title={t('nextChangeList')} disabled onClick={() => undefined}>
            {arrowDownIcon()}
          </ToolbarButton>

          <ToolbarButton title={t('closePanel')} onClick={onClose}>
            {closeIcon()}
          </ToolbarButton>

          {/* changelist 标签 */}
          <span className="px-1 text-[11px] text-secondary">{t('changeListLabel')}</span>

          {/* 当前 changelist：本插件只维护一个，下拉保持不变 */}
          <button
            type="button"
            title={t('changeListDefault')}
            className="flex h-5 items-center gap-1 rounded border border-inputborder bg-inputbg px-1.5 text-[11px] text-primary"
          >
            {t('changeListDefault')}
            {chevronDownIcon()}
          </button>
        </div>

        {/* 变更树 */}
        <div className="min-h-0 flex-[4] overflow-auto py-0.5 [scrollbar-gutter:stable]">
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

        {/* 提交信息 */}
        <div className="shrink-0 border-t border-line1 px-3 pb-2 pt-1.5">
          {/* 提交信息分组标题 */}
          <div className="mb-1 text-[11px] text-secondary">{t('commitMessage')}</div>

          {/* 提交信息输入框；自动聚焦，打开弹窗即可输入 */}
          <textarea
            autoFocus
            value={message}
            spellCheck={false}
            onChange={(event) => updateMessage(event.target.value)}
            className="h-[96px] w-full resize-none rounded border border-inputborder bg-inputbg px-2 py-1 font-mono text-xs text-primary outline-none focus:border-actionblue"
          />
        </div>

        {/* 差异区：标题可折叠，正文复用 Git 面板同一套差异渲染 */}
        <div className="flex min-h-0 flex-[5] flex-col border-t border-line1">
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
                file={selected}
                files={checkedFiles.map((file) => ({ path: file.path, staged: file.staged }))}
                onSelectFile={setSelected}
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
      </div>

      {menu !== null && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}

      {confirm !== null && <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />}
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

