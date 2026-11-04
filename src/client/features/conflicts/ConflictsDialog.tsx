/**
 * 冲突列表窗。
 *
 * 复刻 IDEA 的 Conflicts 对话框：标题与说明、Resolve All Simple Conflicts、按文件
 * 列出两侧状态与 Accept、底部的 Close / Accept and Finish / Resolve Manually。
 *
 * 列表只做两件事：整份接受某一侧、进入三栏窗口手动解决。逐块的取舍交给三栏合并
 * 窗口，同一个决策因此只有一套交互与一份实现。完成合并（Accept and Finish）后，
 * 推送流程可以挂 onFinished 继续把提交推上去——冲突窗口不关心推送细节。
 */
import React, { useCallback, useEffect, useState } from 'react'

import { cn } from '../../../common/cn'
import { useDialogFrame } from '../../../common/dialog-frame'
import type { Translate } from '../../../types/plugin'

import {
  acceptConflictSide,
  continueOperation,
  readConflictInfo,
  readConflictVersions,
  resolveConflictFile,
  type ConflictSideStatus,
  type GitConflictInfo,
} from '../git/api'
import { chevronDownIcon, chevronRightIcon, eyeIcon } from '../git/icons-ui'
import type { GitDialogServices } from '../git/dialog-services'
import { ContextMenu, type MenuState } from '../git/menu'
import { fileIcon } from '../project-tree/file-icons'

import { conflictMarkIcon, magicWandIcon, modifiedBadgeIcon, resolvedMarkIcon } from './icons'
import { parseMergeModel, resolvedText, simpleChoice } from './merge-model'

/** 弹窗默认大小：取可用区域的 86%×76%，最多 1120×720，与 IDEA 的大号冲突窗比例一致。 */
const INITIAL_SIZE = { widthRatio: 0.86, heightRatio: 0.76, maxWidth: 1120, maxHeight: 720 }

/** 缩放下限：再小表头两列与底部三个按钮就放不下了。 */
const MIN_SIZE = { width: 640, height: 380 }

/** 弹窗标识：冲突窗的尺寸单独记忆。 */
const SIZE_KEY = 'git-conflicts'

/** 列表行列模板：首列放文件，后两列分别是两侧状态与 Accept。 */
const ROW_GRID = 'grid grid-cols-[minmax(0,1fr)_repeat(2,minmax(0,23%))] items-center'

/** 对话框 props。 */
export interface ConflictsDialogProps {
  /** 已绑定 git 前缀的翻译函数以外的冲突文案；组件内使用 conflicts 命名空间。 */
  t: Translate
  /** 工作台服务总线。 */
  services: GitDialogServices
  /** 工作区根。 */
  root: string
  /** 关闭对话框，不改变仓库状态。 */
  onClose(): void
  /** 完成合并后的收尾动作。 */
  onFinished?(): void
}

/**
 * 渲染冲突列表窗。
 * @param props 见 ConflictsDialogProps
 * @returns 遮罩 + 对话框
 */
export function ConflictsDialog({ t, services, root, onClose, onFinished }: ConflictsDialogProps): React.ReactElement {
  const [info, setInfo] = useState<GitConflictInfo | null>(null)
  /** 打开窗口时的全部冲突文件：解决之后仍要能把它们列进「已解决」分组。 */
  const [knownPaths, setKnownPaths] = useState<string[]>([])
  const [errorText, setErrorText] = useState('')
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  /** 「未解决」分组是否折叠。 */
  const [collapsed, setCollapsed] = useState(false)
  /** 是否显示「已解决」分组；默认隐藏，与 IDEA 的默认视图一致。 */
  const [showResolved, setShowResolved] = useState(false)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const { style, rootRef, dragProps, handle } = useDialogFrame(services.dialogSizes, {
    key: SIZE_KEY,
    initial: INITIAL_SIZE,
    min: MIN_SIZE,
  })

  /** 仓库目录名：文件行右侧的灰色项目名，与项目树根节点显示一致。 */
  const repository = root.slice(root.lastIndexOf('/') + 1)

  /**
   * 重新读取冲突上下文。
   *
   * 每次接受或自动解决之后都要重读：已解决的文件会从 git 的冲突列表里消失，
   * 本地维护一份「以为解决了」的副本反而会与实际状态不一致。
   */
  const reload = useCallback(async (): Promise<void> => {
    if (root === '') return

    const result = await readConflictInfo(root)

    if (!result.ok) {
      setErrorText(result.error.message)

      return
    }

    setErrorText('')
    setInfo(result.value)
    // 首次读取记下全部冲突文件；之后只增不减，已解决的文件才能留在「已解决」分组里
    setKnownPaths((previous) => (previous.length > 0 ? previous : result.value.files.map((file) => file.path)))
  }, [root])

  useEffect(() => {
    void reload()
  }, [reload])

  const unresolved = info?.files ?? []
  const unresolvedPaths = unresolved.map((file) => file.path)
  const resolvedPaths = knownPaths.filter((path) => !unresolvedPaths.includes(path))
  /** 当前选中文件：选中项被解决后自动落到第一个未解决文件。 */
  const activePath = selected !== null && unresolvedPaths.includes(selected) ? selected : (unresolved[0]?.path ?? null)

  /**
   * 整份接受某一侧。
   * @param path 冲突文件路径
   * @param side 接受我方还是对方
   */
  const acceptSide = useCallback(
    async (path: string, side: 'ours' | 'theirs'): Promise<void> => {
      if (busy) return

      setBusy(true)

      try {
        const result = await acceptConflictSide(root, path, side)

        if (!result.ok) {
          console.error('[dsh-ide] 接受冲突一侧失败:', result.error)
          services.toast('error', result.error.message)

          return
        }

        services.refreshGitStatus()
        services.invalidate(path)
        await reload()
      } catch (error) { // 网络层异常不会带 ApiResult，留痕后让用户可以重试
        console.error('[dsh-ide] 接受冲突一侧失败:', error)
        services.toast('error', String(error))
      } finally {
        setBusy(false)
      }
    },
    [busy, reload, root, services],
  )

  /**
   * 一键解决所有简单冲突。
   *
   * 逐文件读取三方内容并解析冲突块：只要有一块需要人来判断语义，整份就跳过——
   * 半个文件的自动结果比不解决更危险。真正的语义冲突仍然留给三栏窗口。
   */
  const resolveSimple = useCallback(async (): Promise<void> => {
    const files = info?.files ?? []

    if (busy || files.length === 0) return

    setBusy(true)

    let count = 0

    try {
      for (const file of files) {
        const versions = await readConflictVersions(root, file.path)

        if (!versions.ok || versions.value.binary) continue

        const model = parseMergeModel(versions.value.worktree)
        if (model.blocks.length === 0) continue

        const choices = model.blocks.map((block) => simpleChoice(block))
        if (choices.some((choice) => choice === null)) continue

        // 自动解决要写回完整文件：按解析出的段顺序拼装，共有内容与两侧内容都带上
        const resolved = model.blocks.map((_, index) => {
          const side = choices[index] ?? 'ours'

          return { ours: side === 'ours', theirs: side === 'theirs', touched: true }
        })

        const saved = await resolveConflictFile(root, file.path, resolvedText(model, resolved))

        if (!saved.ok) {
          console.error('[dsh-ide] 自动解决冲突失败:', file.path, saved.error)

          continue
        }

        count += 1
      }
    } catch (error) { // 网络层异常不会带 ApiResult，留痕后继续按结果提示
      console.error('[dsh-ide] 自动解决冲突失败:', error)
    } finally {
      setBusy(false)
    }

    services.refreshGitStatus()
    services.invalidate()

    if (count === 0) services.toast('info', t('simpleConflictsNone'))
    else services.toast('success', t('simpleConflictsResolved').replace('{count}', String(count)))

    await reload()
  }, [busy, info, reload, root, services, t])

  /**
   * 全部解决后完成这次合并。
   *
   * `git add` 只是把文件标成已解决，仓库仍停在合并中间状态，必须显式提交合并
   * （变基与 cherry-pick 则是继续操作）。完成后交给 onFinished 收尾。
   */
  const finish = useCallback(async (): Promise<void> => {
    if (busy) return

    setBusy(true)

    try {
      const result = await continueOperation(root)

      if (!result.ok) {
        console.error('[dsh-ide] 完成合并失败:', result.error)
        services.toast('error', `${t('finishFailed')}: ${result.error.message}`)

        return
      }

      services.refreshGitStatus()
      services.invalidate()
      services.toast('success', t('finishSucceeded'))
      onClose()
      onFinished?.()
    } catch (error) { // 网络层异常不会带 ApiResult，留痕后让用户重试
      console.error('[dsh-ide] 完成合并失败:', error)
      services.toast('error', String(error))
    } finally {
      setBusy(false)
    }
  }, [busy, onClose, onFinished, root, services, t])

  /**
   * 在编辑区打开三栏合并窗口。
   * @param path 冲突文件路径；缺省时用当前选中文件
   */
  const resolveManually = useCallback(
    (path: string | null): void => {
      if (path === null) return

      services.openMerge(path)
      onClose()
    },
    [onClose, services],
  )

  /** 展开右上角的视图选项菜单。 */
  const openViewMenu = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>): void => {
      const rect = event.currentTarget.getBoundingClientRect()
      const items = [
        // 是否显示已解决的文件夹分组
        {
          id: 'resolved',
          label: t('showResolved'),
          selected: showResolved,
          run: () => setShowResolved((previous) => !previous),
        },
      ]

      setMenu({ x: rect.right - 190, y: rect.bottom + 4, items, minWidth: 190 })
    },
    [showResolved, t],
  )

  // Esc 关闭；合并完成后才能用 Enter 收尾
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()

      if (event.key === 'Enter' && unresolved.length === 0 && !busy) {
        event.preventDefault()
        void finish()
      }
    }

    window.addEventListener('keydown', onKeyDown, true)

    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [busy, finish, onClose, unresolved.length])

  return (
    <div
      className="fixed inset-0 z-[9995] flex items-center justify-center bg-black/30 p-4"
      // 点击遮罩关闭；批量解决进行中不允许关闭
      onClick={() => {
        if (!busy) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('dialogTitle')}
        className="relative flex flex-col overflow-hidden rounded-[12px] border border-[color:var(--ide-dialog-border)] bg-[var(--ide-dialog-bg)] shadow-2xl"
        style={style}
        ref={rootRef}
        onClick={(event) => event.stopPropagation()}
      >
        {/* 标题行：只保留标题；按住可拖动弹窗位置 */}
        <div className="flex shrink-0 cursor-move select-none items-center px-5 pb-2 pt-3.5" {...dragProps}>
          {/* 对话框标题：Merge conflicts */}
          <span className="whitespace-nowrap text-[13px] font-bold text-[color:var(--ide-dialog-fg)]">
            {t('dialogTitle')}
          </span>
        </div>

        {/* 说明文字：提示必须先解决冲突才能继续更新 */}
        <div className="shrink-0 px-5 pb-2 text-[13px] text-[color:var(--ide-dialog-fg)]">{t('dialogHint')}</div>

        {/* 工具行：左侧自动解决简单冲突，右侧视图选项 */}
        <div className="flex shrink-0 items-center gap-2 px-5 pb-2">
          {/* 自动解决不需要人工判断的冲突块 */}
          <button
            type="button"
            disabled={busy || unresolved.length === 0}
            onClick={() => void resolveSimple()}
            className="flex h-7 items-center gap-1.5 rounded-[4px] border border-[color:var(--ide-dialog-control-border)] bg-[var(--ide-dialog-control-bg)] px-2.5 text-[13px] text-[color:var(--ide-dialog-fg)] hover:bg-[var(--ide-dialog-hover-bg)] disabled:cursor-default disabled:opacity-50 disabled:hover:bg-[var(--ide-dialog-control-bg)]"
          >
            {magicWandIcon()}
            {t('resolveAllSimple')}
          </button>

          <span className="flex-1" />

          {/* 视图选项：切换已解决分组是否显示 */}
          <button
            type="button"
            title={t('viewOptions')}
            aria-label={t('viewOptions')}
            onClick={openViewMenu}
            className="flex h-7 items-center gap-0.5 rounded-[4px] px-1.5 text-[color:var(--ide-dialog-fg)] hover:bg-[var(--ide-dialog-hover-bg)]"
          >
            {eyeIcon(17)}
            {chevronDownIcon(12)}
          </button>
        </div>

        {/* 冲突表格：表头 + 可滚动分组列表 */}
        <div className="mx-5 mb-2 flex min-h-0 flex-1 flex-col rounded-[4px] border border-[color:var(--ide-dialog-border)]">
          <div className={cn(ROW_GRID, 'h-[26px] shrink-0 border-b border-[color:var(--ide-dialog-border)] text-[12px] text-secondary')}>
            <span />
            {/* 表头：我方列，括号里是当前分支名 */}
            <span className="truncate px-3">{info === null ? t('yours') : `${t('yours')} (${info.ours})`}</span>
            {/* 表头：对方列，括号里是正在合进来的提交短号 */}
            <span className="truncate px-3">{info === null ? t('theirs') : `${t('theirs')} (${info.theirs})`}</span>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {errorText !== '' && <div className="px-3 py-2 text-[12px] text-danger">{errorText}</div>}

            {errorText === '' && info !== null && unresolved.length === 0 && resolvedPaths.length === 0 && (
              <div className="px-3 py-2 text-[12px] text-[color:var(--ide-dialog-fg)]">{t('noConflictsFound')}</div>
            )}

            {unresolved.length > 0 && (
              <>
                {/* 未解决分组行：点击折叠/展开 */}
                <button
                  type="button"
                  onClick={() => setCollapsed((previous) => !previous)}
                  className="flex h-[26px] w-full items-center gap-1.5 bg-treeselected px-2 text-left text-[12px] text-white"
                >
                  {collapsed ? chevronRightIcon() : chevronDownIcon()}
                  <span className="text-[color:var(--ide-vcs-conflict)]">{conflictMarkIcon()}</span>
                  {/* 分组标题 */}
                  <span className="font-semibold">{t('unresolved')}</span>
                  {/* 分组内的文件数量 */}
                  <span className="text-white/70">
                    {(unresolved.length === 1 ? t('fileCountOne') : t('fileCountMany')).replace(
                      '{count}',
                      String(unresolved.length),
                    )}
                  </span>
                </button>

                {!collapsed &&
                  unresolved.map((file) => (
                    <div
                      key={file.path}
                      onClick={() => setSelected(file.path)}
                      onDoubleClick={() => resolveManually(file.path)}
                      className={cn(
                        ROW_GRID,
                        'h-[28px] cursor-default text-[12px]',
                        file.path === activePath ? 'bg-surface2' : 'hover:bg-surface2',
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-1.5 pl-9 pr-2">
                        {/* 双方都改过：文件名前的 M↓ 徽标 */}
                        <span className="text-vcs-modified">{modifiedBadgeIcon()}</span>
                        {/* 文件图标：与项目树、标签页同一套 */}
                        {fileIcon(file.path)}
                        {/* 文件名 */}
                        <span className="min-w-0 truncate text-[color:var(--ide-dialog-fg)]">
                          {file.path.slice(file.path.lastIndexOf('/') + 1)}
                        </span>
                        {/* 项目名 */}
                        <span className="shrink-0 truncate text-secondary">{repository}</span>
                      </div>

                      {/* 我方状态与整份接受按钮 */}
                      <div className="flex items-center justify-end gap-2 px-3">
                        <span className="truncate text-[color:var(--ide-dialog-fg)]">{statusLabel(t, file.oursStatus)}</span>

                        <button
                          type="button"
                          disabled={busy}
                          onClick={(event) => {
                            event.stopPropagation()
                            void acceptSide(file.path, 'ours')
                          }}
                          className="h-[22px] shrink-0 rounded-[4px] border border-[color:var(--ide-dialog-control-border)] bg-[var(--ide-dialog-control-bg)] px-2.5 text-[12px] text-[color:var(--ide-dialog-fg)] hover:bg-[var(--ide-dialog-hover-bg)] disabled:cursor-default disabled:opacity-50"
                        >
                          {t('accept')}
                        </button>
                      </div>

                      {/* 对方状态与整份接受按钮 */}
                      <div className="flex items-center justify-end gap-2 px-3">
                        <span className="truncate text-[color:var(--ide-dialog-fg)]">{statusLabel(t, file.theirsStatus)}</span>

                        <button
                          type="button"
                          disabled={busy}
                          onClick={(event) => {
                            event.stopPropagation()
                            void acceptSide(file.path, 'theirs')
                          }}
                          className="h-[22px] shrink-0 rounded-[4px] border border-[color:var(--ide-dialog-control-border)] bg-[var(--ide-dialog-control-bg)] px-2.5 text-[12px] text-[color:var(--ide-dialog-fg)] hover:bg-[var(--ide-dialog-hover-bg)] disabled:cursor-default disabled:opacity-50"
                        >
                          {t('accept')}
                        </button>
                      </div>
                    </div>
                  ))}
              </>
            )}

            {/* 已解决分组：默认隐藏，可在视图选项里打开 */}
            {showResolved && resolvedPaths.length > 0 && (
              <>
                <div className="flex h-[26px] w-full items-center gap-1.5 bg-surface2 px-2 text-[12px] text-[color:var(--ide-dialog-fg)]">
                  <span className="text-[color:var(--ide-vcs-added)]">{resolvedMarkIcon()}</span>
                  {/* 分组标题 */}
                  <span className="font-semibold">{t('resolved')}</span>
                  {/* 分组内的文件数量 */}
                  <span className="text-secondary">
                    {(resolvedPaths.length === 1 ? t('fileCountOne') : t('fileCountMany')).replace(
                      '{count}',
                      String(resolvedPaths.length),
                    )}
                  </span>
                </div>

                {resolvedPaths.map((path) => (
                  <div key={path} className={cn(ROW_GRID, 'h-[28px] text-[12px]')}>
                    <div className="flex min-w-0 items-center gap-1.5 pl-9 pr-2">
                      {fileIcon(path)}
                      <span className="min-w-0 truncate text-secondary">
                        {path.slice(path.lastIndexOf('/') + 1)}
                      </span>
                    </div>
                    <span />
                    <span />
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {/* 底部操作行：关闭、全部解决后完成合并、手动解决 */}
        <div className="flex shrink-0 items-center justify-end gap-2.5 px-4 pb-4 pt-1">
          {/* 关闭：只关窗口，未解决的冲突仍留在工作区 */}
          <button
            type="button"
            onClick={onClose}
            className="h-7 shrink-0 whitespace-nowrap rounded-[4px] border border-[color:var(--ide-dialog-control-border)] bg-[var(--ide-dialog-control-bg)] px-4 text-[13px] text-[color:var(--ide-dialog-fg)] hover:bg-[var(--ide-dialog-hover-bg)]"
          >
            {t('close')}
          </button>

          {/* 完成合并：仍有未解决文件时不可用 */}
          <button
            type="button"
            disabled={busy || unresolved.length > 0}
            onClick={() => void finish()}
            className="h-7 shrink-0 whitespace-nowrap rounded-[4px] border border-[color:var(--ide-dialog-control-border)] bg-[var(--ide-dialog-control-bg)] px-4 text-[13px] text-[color:var(--ide-dialog-fg)] hover:bg-[var(--ide-dialog-hover-bg)] disabled:cursor-default disabled:opacity-50 disabled:hover:bg-[var(--ide-dialog-control-bg)]"
          >
            {t('acceptAndFinish')}
          </button>

          {/* 主按钮：为选中文件打开三栏合并窗口 */}
          <button
            type="button"
            disabled={activePath === null}
            onClick={() => resolveManually(activePath)}
            className="h-7 shrink-0 whitespace-nowrap rounded-[4px] border border-[color:var(--ide-dialog-accent-border)] bg-[var(--ide-dialog-accent)] px-5 text-[13px] font-medium text-white hover:bg-[var(--ide-dialog-accent-hover)] disabled:cursor-default disabled:opacity-50"
          >
            {t('resolveManually')}
          </button>
        </div>

        {handle}

        {/* 视图选项下拉 */}
        {menu !== null && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
      </div>
    </div>
  )
}

/**
 * 把冲突一侧的状态转成展示文案。
 * @param t 翻译函数
 * @param status 索引区状态
 * @returns 已翻译文案
 */
function statusLabel(t: Translate, status: ConflictSideStatus): string {
  if (status === 'added') return t('statusAdded')
  if (status === 'deleted') return t('statusDeleted')

  return t('statusModified')
}
