/**
 * Rollback Changes 对话框。
 *
 * 复刻 IDEA 的滚动回滚弹窗：上方是工具条（回滚、changelist 上下切换），中间是按
 * 目录分组的变更树，下方是勾选文件的统计与「Delete local copies of added files」，
 * 底部是 Close 与 Rollback。勾选结果决定本次回滚哪些路径。
 *
 * 回滚动作不可撤销，弹窗本身就是确认环节，不再叠加二次确认。执行细节：
 * 已跟踪文件走 git restore；新增文件按选项决定是否删除本地副本，未勾选时只把已暂存
 * 的新增文件退回未跟踪，文件本身留在工作区。
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'

import { Checkbox } from '../../common/Checkbox'
import { useDialogResize } from '../../../common/dialog-resize'
import type { Translate } from '../../../types/plugin'
import type { IdeServices } from '../../shell/contract'

import { discard, readStatus, unstage, type GitStatus } from './api'
import {
  buildCommitTree,
  flattenFiles,
  splitFiles,
  statusOf,
  summarize,
  type CommitFile,
  type CommitSummary,
} from './commit-model'
import { CommitTree, UNTRACKED_KEY } from './CommitTree'
import { recordGitConsole } from './console-store'
import { arrowDownIcon, arrowUpIcon, rollbackIcon } from './icons'

/** 弹窗默认大小：取可用区域的 90%×82%，最多 520×620，与原来一致。 */
const INITIAL_SIZE = { widthRatio: 0.9, heightRatio: 0.82, maxWidth: 520, maxHeight: 620 }

/** 缩放下限：再小变更树只剩一两行。 */
const MIN_SIZE = { width: 420, height: 320 }

/** 弹窗标识：回滚框的尺寸单独记忆。 */
const SIZE_KEY = 'rollback'

/** 回滚统计的文案 key。 */
const SUMMARY_KEYS: Record<CommitSummary['key'], string> = {
  modified: 'statModified',
  added: 'statAdded',
  deleted: 'statDeleted',
  unversioned: 'statUnversioned',
}

/** 回滚统计的状态色：已修改蓝、新增绿、删除灰、未跟踪红。 */
const SUMMARY_TONES: Record<CommitSummary['key'], string> = {
  modified: 'text-vcs-modified',
  added: 'text-vcs-added',
  deleted: 'text-vcs-deleted',
  unversioned: 'text-vcs-unknown',
}

/** 对话框 props。 */
export interface RollbackDialogProps {
  /** 已绑定 git 前缀的翻译函数。 */
  t: Translate
  /** 工作台服务总线。 */
  services: IdeServices
  /** 工作区根。 */
  root: string
  /** 打开时预选的路径；为空表示勾选全部变更。 */
  initialPaths?: readonly string[]
  /** 关闭对话框，不做任何回滚。 */
  onClose(): void
  /** 回滚成功后通知调用方重读自己的列表。 */
  onRolledBack(): void
}

/**
 * 判断文件是否为「新增」：未跟踪或有索引区 A 状态。
 * @param file 待回滚文件
 * @returns 是否为新增文件
 */
function isAdded(file: CommitFile): boolean {
  return file.untracked || statusOf(file) === 'A'
}

/**
 * 渲染 Rollback Changes 对话框。
 * @param props 见 RollbackDialogProps
 * @returns 遮罩 + 对话框
 */
export function RollbackDialog({
  t,
  services,
  root,
  initialPaths,
  onClose,
  onRolledBack,
}: RollbackDialogProps): React.ReactElement {
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [errorText, setErrorText] = useState('')
  const [busy, setBusy] = useState(false)
  /** 已勾选的路径。 */
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set())
  /** 已折叠的目录路径与未跟踪分组。 */
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set([UNTRACKED_KEY]))
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  /** 新增文件回滚时是否删除本地副本，与 IDEA 默认勾选一致。 */
  const [deleteLocal, setDeleteLocal] = useState(true)
  const { size, handle } = useDialogResize(services.dialogSizes, {
    key: SIZE_KEY,
    initial: INITIAL_SIZE,
    min: MIN_SIZE,
  })

  /** 读取工作区状态。 */
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
  const summary = useMemo(() => summarize(checkedFiles), [checkedFiles])

  // 状态到位后给出初始勾选：调用方指定了路径就只勾这些，否则全选
  useEffect(() => {
    if (status === null) return

    const wanted = new Set(initialPaths ?? allFiles.map((file) => file.path))

    setChecked(new Set(allFiles.filter((file) => wanted.has(file.path)).map((file) => file.path)))
  }, [allFiles, initialPaths, status])

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

  /**
   * 切换目录或分组的折叠状态。
   * @param key 目录路径或分组键
   */
  function toggleCollapse(key: string): void {
    setCollapsed((previous) => {
      const updated = new Set(previous)

      if (updated.has(key)) updated.delete(key)
      else updated.add(key)

      return updated
    })
  }

  /**
   * 执行回滚：已跟踪文件恢复、新增文件按选项删除或退回未跟踪。
   */
  const rollback = useCallback(async (): Promise<void> => {
    if (root === '') return

    const files = checkedFiles
    if (files.length === 0) {
      setErrorText(t('nothingSelected'))

      return
    }

    const trackedPaths = files.filter((file) => !isAdded(file)).map((file) => file.path)
    const addedPaths = files.filter(isAdded).map((file) => file.path)
    // 已暂存的新增文件要先取消暂存：git clean 不会删除已被跟踪的文件
    const stagedAddedPaths = files.filter((file) => isAdded(file) && file.staged).map((file) => file.path)
    const cleanPaths = deleteLocal ? addedPaths : []

    setBusy(true)

    try {
      if (trackedPaths.length > 0) {
        const restored = await discard(root, trackedPaths, false)

        if (!report(restored, `git restore -- ${trackedPaths.join(' ')}`)) return
      }

      if (stagedAddedPaths.length > 0) {
        const unstaged = await unstage(root, stagedAddedPaths)

        if (!report(unstaged, `git reset HEAD -- ${stagedAddedPaths.join(' ')}`)) return
      }

      if (cleanPaths.length > 0) {
        const cleaned = await discard(root, cleanPaths, true)

        if (!report(cleaned, `git clean -fd -- ${cleanPaths.join(' ')}`)) return
      }

      services.refreshGitStatus()
      services.invalidate()
      services.toast('success', t('rollbackSucceeded'))
      onRolledBack()
      onClose()
    } finally {
      setBusy(false)
    }
  }, [checkedFiles, deleteLocal, onClose, onRolledBack, root, services, t])

  /**
   * 记录一次回滚命令的结果，并把失败信息留在对话框里。
   * @param result git 调用结果
   * @param command 用于控制台回显的命令行
   * @returns 是否成功
   */
  function report(result: Awaited<ReturnType<typeof discard>>, command: string): boolean {
    if (!result.ok) {
      recordGitConsole({ cwd: root, command, stdout: '', stderr: result.error.message, ok: false })
      setErrorText(result.error.message)

      return false
    }

    recordGitConsole({
      cwd: root,
      command: result.value.command,
      stdout: result.value.stdout,
      stderr: result.value.stderr,
      ok: true,
    })

    return true
  }

  // Esc 关闭对话框；执行中不响应，避免动作半途消失
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busy) onClose()
    }

    window.addEventListener('keydown', onKeyDown)

    return () => window.removeEventListener('keydown', onKeyDown)
  }, [busy, onClose])

  return (
    <div className="fixed inset-0 z-[9996] flex items-center justify-center bg-black/30 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('rollbackDialogTitle')}
        className="relative flex flex-col overflow-hidden rounded-[12px] border border-[color:var(--ide-dialog-border)] bg-[var(--ide-dialog-bg)] shadow-2xl"
        style={size}
      >
        {/* 标题行：左对齐的对话框标题 */}
        <div className="flex shrink-0 items-center px-5 pb-2 pt-3.5">
          {/* 对话框标题 */}
          <span className="whitespace-nowrap text-[13px] font-bold text-[color:var(--ide-dialog-fg)]">
            {t('rollbackDialogTitle')}
          </span>
        </div>

        {/* 工具条：回滚、changelist 上下切换 */}
        <div className="flex h-8 shrink-0 items-center gap-1 px-4">
          <ToolbarButton title={t('rollback')} disabled={busy || checkedFiles.length === 0} onClick={rollback}>
            {rollbackIcon()}
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

        {/* 变更树：按目录分组，勾选决定本次回滚范围 */}
        <div className="mx-4 min-h-0 flex-1 overflow-auto rounded border border-[color:var(--ide-dialog-border)] py-0.5 [scrollbar-gutter:stable]">
          {root === '' && (
            <div className="px-3 py-2 text-xs text-[color:var(--ide-dialog-fg)]">{t('noSession')}</div>
          )}

          {root !== '' && status === null && (
            <div className="px-3 py-2 text-xs text-[color:var(--ide-dialog-fg)]">
              {errorText === '' ? t('notRepository') : errorText}
            </div>
          )}

          {status !== null && allFiles.length === 0 && (
            <div className="px-3 py-2 text-xs text-[color:var(--ide-dialog-fg)]">{t('clean')}</div>
          )}

          <CommitTree
            t={t}
            changelist={t('changeListName')}
            repository={root.slice(root.lastIndexOf('/') + 1)}
            tree={tree}
            untracked={groups.untracked}
            checked={checked}
            collapsed={collapsed}
            selectedPath={selectedPath}
            onToggleCheck={toggleFiles}
            onToggleCollapse={toggleCollapse}
            onSelect={(file) => setSelectedPath(file.path)}
            onSelectNode={setSelectedPath}
          />
        </div>

        {/* 勾选文件的统计：如「2 added」，每段按状态着色与 IDEA 一致 */}
        {summary.length > 0 && (
          <div className="shrink-0 px-5 pt-2 text-[13px]">
            {summary.map((item, index) => (
              <span key={item.key} className={SUMMARY_TONES[item.key]}>
                {index > 0 ? ', ' : ''}
                {item.count} {t(SUMMARY_KEYS[item.key])}
              </span>
            ))}
          </div>
        )}

        {errorText !== '' && status !== null && (
          <div className="shrink-0 px-5 pt-1 text-[12px] text-danger">{errorText}</div>
        )}

        {/* 新增文件的处理方式：勾选后回滚会连同本地副本一起删除 */}
        <div className="shrink-0 px-5 pb-1 pt-2">
          <Checkbox
            checked={deleteLocal}
            onChange={setDeleteLocal}
            label={t('deleteLocalCopies')}
            className="text-[13px] text-[color:var(--ide-dialog-fg)]"
          />
        </div>

        {/* 底部按钮：关闭与回滚 */}
        <div className="flex shrink-0 items-center justify-end gap-2.5 px-4 pb-4 pt-2">
          {/* 关闭：不做任何回滚 */}
          <button
            type="button"
            onClick={onClose}
            className="h-7 shrink-0 whitespace-nowrap rounded-[4px] border border-[color:var(--ide-dialog-control-border)] bg-[var(--ide-dialog-control-bg)] px-4 text-[13px] text-[color:var(--ide-dialog-fg)] hover:bg-[var(--ide-dialog-hover-bg)]"
          >
            {t('close')}
          </button>

          {/* 回滚：按勾选结果执行，动作不可撤销 */}
          <button
            type="button"
            disabled={busy || checkedFiles.length === 0}
            onClick={() => void rollback()}
            className="h-7 shrink-0 whitespace-nowrap rounded-[4px] border border-[color:var(--ide-dialog-accent-border)] bg-[var(--ide-dialog-accent)] px-4 text-[13px] font-medium text-white hover:bg-[var(--ide-dialog-accent-hover)] disabled:cursor-default disabled:opacity-60"
          >
            {t('rollback')}
          </button>
        </div>

        {handle}
      </div>
    </div>
  )
}

/** 工具条按钮。 */
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
      className="flex h-6 w-6 items-center justify-center rounded text-[color:var(--ide-dialog-fg)] transition-colors hover:bg-[var(--ide-dialog-hover-bg)] disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}
