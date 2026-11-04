/**
 * 推送窗口里的单文件差异弹窗。
 *
 * Push 弹窗是整页遮罩，打开后工作台不可见；双击右侧文件树里的文件时，用这个叠在
 * 推送窗之上的差异弹窗查看该文件在当前推送范围里的改动，关掉弹窗即可回到推送窗，
 * 不必先关闭推送窗再回工作台看差异。
 *
 * 形态与 IDEA 的 Show Diff 窗口一致：只显示一个文件的差异，工具栏可切到同范围的
 * 上/下一个文件；切换时把路径回传给推送窗，文件树的高亮行跟着走。
 */
import React, { useEffect, useMemo } from 'react'

import { useDialogFrame } from '../../../common/dialog-frame'
import type { DiffSource } from '../../../common/diff-source'
import type { Translate } from '../../../types/plugin'

import type { GitDialogServices } from './dialog-services'
import { DiffView } from './DiffView'
import { closeIcon } from './icons-ui'

/** 弹窗默认大小：差异需要横向空间，取可用区域的 92%×86%，最多 1000×720。 */
const INITIAL_SIZE = { widthRatio: 0.92, heightRatio: 0.86, maxWidth: 1000, maxHeight: 720 }

/** 缩放下限：再小并排差异的两栏都放不下内容。 */
const MIN_SIZE = { width: 560, height: 360 }

/** 弹窗标识：推窗里的差异弹窗单独记忆尺寸，与比较窗口互不干扰。 */
const SIZE_KEY = 'git.pushFileDiff'

/** 差异弹窗 props。 */
export interface FileDiffDialogProps {
  /** 已绑定 git 前缀的翻译函数。 */
  t: Translate
  /** 工作台能力：差异视图要用设置订阅与「在编辑器中打开」。 */
  services: GitDialogServices
  /** 工作区根。 */
  root: string
  /** 比较基准版本：整段推送取上游，单个提交取父提交。 */
  from: string
  /** 被比较的版本：HEAD 或选中的提交。 */
  to: string
  /** 当前查看的文件路径。 */
  path: string
  /** 同范围内可切换的文件，顺序与推送窗口的文件树一致。 */
  paths: string[]
  /** 切换到另一个文件；推送窗据此同步文件树选中行。 */
  onSelect(path: string): void
  /** 关闭差异弹窗，推送窗保持打开。 */
  onClose(): void
}

/**
 * 渲染单文件差异弹窗。
 * @param props 见 FileDiffDialogProps
 * @returns 遮罩 + 差异弹窗
 */
export function FileDiffDialog({
  t,
  services,
  root,
  from,
  to,
  path,
  paths,
  onSelect,
  onClose,
}: FileDiffDialogProps): React.ReactElement {
  const { style, rootRef, dragProps, handle } = useDialogFrame(services.dialogSizes, {
    key: SIZE_KEY,
    initial: INITIAL_SIZE,
    min: MIN_SIZE,
  })

  // 每个文件对应一处提交间差异：左侧是基准版本，右侧是被比较的版本
  const sources = useMemo(
    () => paths.map((item): DiffSource => ({ kind: 'commits', from, to, path: item })),
    [from, paths, to],
  )

  const source = sources.find((item) => item.kind === 'commits' && item.path === path) ?? null
  const name = path.slice(path.lastIndexOf('/') + 1)

  // Esc 关闭：推送窗在差异弹窗打开时不响应 Esc，只有这一层会关
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onKeyDown, true)

    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/30 p-4"
      // 点击遮罩只关闭差异弹窗，推送窗保持打开
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={path}
        className="relative flex flex-col overflow-hidden rounded-[12px] border border-[color:var(--ide-dialog-border)] bg-[var(--ide-dialog-bg)] shadow-2xl"
        style={style}
        ref={rootRef}
        onClick={(event) => event.stopPropagation()}
      >
        {/* 标题行：左上角是关闭按钮，后接文件名与完整路径；按住标题可拖动弹窗 */}
        <div className="flex shrink-0 cursor-move select-none items-center gap-2 px-3 pb-2 pt-3" {...dragProps}>
          {/* 关闭差异弹窗，回到推送窗；与工具栏里的关闭按钮是同一个动作 */}
          <button
            type="button"
            title={t('closeDiff')}
            aria-label={t('closeDiff')}
            onClick={onClose}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-secondary transition-colors hover:bg-[var(--ide-dialog-hover-bg)] hover:text-[color:var(--ide-dialog-fg)]"
          >
            {closeIcon()}
          </button>

          <span className="whitespace-nowrap text-[13px] font-bold text-[color:var(--ide-dialog-fg)]">{name}</span>

          <span className="min-w-0 truncate text-[11px] text-secondary">{path}</span>
        </div>

        {/* 差异正文：与 Git 面板、差异标签共用同一个渲染器 */}
        <div className="flex min-h-0 flex-1 flex-col">
          <DiffView
            t={t}
            services={services}
            root={root}
            source={source}
            files={sources}
            // 本弹窗只构造提交间差异，其余来源不会出现；切文件时把路径交回推送窗同步选中
            onSelect={(next) => {
              if (next.kind === 'commits' && next.path !== undefined) onSelect(next.path)
            }}
            onClose={onClose}
          />
        </div>

        {handle}
      </div>
    </div>
  )
}
