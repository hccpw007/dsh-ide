/**
 * 分支比较窗口。
 *
 * 与 IDEA 的 Compare 窗口一致：左侧是两边的差异文件树，右侧是选中文件的差异。
 * 分支右键的 Compare with 与 Show Diff with Working Tree 都打开它，区别只在
 * 右侧是另一个引用还是工作区。
 */
import React, { useEffect, useMemo, useState } from 'react'

import type { DiffSource } from '../../../common/diff-source'
import { useDialogFrame } from '../../../common/dialog-frame'
import type { Translate } from '../../../types/plugin'
import type { IdeServices } from '../../shell/contract'

import type { GitCompareFile } from './api'
import { buildCommitTree, type CommitFile } from './commit-model'
import { DiffView } from './DiffView'
import { collapseIcon, expandAllIcon } from './icons'
import { PushFileTree } from './PushFileTree'

/** 弹窗默认大小：与 Push 弹窗同一套比例，比较窗口再窄一点给差异留空间。 */
const INITIAL_SIZE = { widthRatio: 0.9, heightRatio: 0.86, maxWidth: 1000, maxHeight: 720 }

/** 缩放下限：再小左右分栏都放不下内容。 */
const MIN_SIZE = { width: 560, height: 360 }

/** 弹窗标识：比较窗口与其他 Git 弹窗各自记忆尺寸。 */
const DIALOG_KEY = 'git.branchDiff'

/** 分支比较窗口 props。 */
export interface BranchDiffDialogProps {
  /** 已绑定 git 前缀的翻译函数。 */
  t: Translate
  /** 工作台服务总线。 */
  services: IdeServices
  /** 工作区根。 */
  root: string
  /** 标题文案，由调用方按比较方向生成。 */
  title: string
  /** 左侧（比较基准）版本名。 */
  left: string
  /** 右侧版本名；null 表示与工作区比较。 */
  right: string | null
  /** 差异文件列表。 */
  files: GitCompareFile[]
  /** 关闭窗口。 */
  onClose(): void
}

/**
 * 取差异来源对应的文件路径。
 * @param source 差异来源
 * @returns 相对仓库根的路径
 */
function pathOf(source: DiffSource): string {
  if (source.kind === 'commits') return source.path ?? ''
  if (source.kind === 'worktree') return source.path
  if (source.kind === 'refworktree') return source.path

  return source.right
}

/**
 * 把比较结果转成文件树需要的形状；只用到路径与状态字母。
 * @param files 差异文件
 * @returns 可构建目录树的文件列表
 */
function toCommitFiles(files: GitCompareFile[]): CommitFile[] {
  return files.map((file) => ({
    path: file.path,
    change: { path: file.path, indexStatus: file.status, worktreeStatus: ' ' },
    staged: false,
    untracked: false,
    conflicted: false,
  }))
}

/**
 * 渲染分支比较窗口。
 * @param props 见 BranchDiffDialogProps
 * @returns 文件树与差异
 */
export function BranchDiffDialog({
  t,
  services,
  root,
  title,
  left,
  right,
  files,
  onClose,
}: BranchDiffDialogProps): React.ReactElement {
  const { style, rootRef, dragProps, handle } = useDialogFrame(services.dialogSizes, {
    key: DIALOG_KEY,
    initial: INITIAL_SIZE,
    min: MIN_SIZE,
  })

  const [selectedPath, setSelectedPath] = useState<string>(files[0]?.path ?? '')
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set<string>())

  const tree = useMemo(() => buildCommitTree(toCommitFiles(files)), [files])

  // 每个文件对应一处差异：右侧是工作区时用 refworktree，否则比较两个引用
  const sources = useMemo(
    () =>
      files.map(
        (file): DiffSource =>
          right === null
            ? { kind: 'refworktree', ref: left, path: file.path }
            : { kind: 'commits', from: left, to: right, path: file.path },
      ),
    [files, left, right],
  )

  const source = sources.find((item) => pathOf(item) === selectedPath) ?? null

  // Esc 关闭：与桌面 IDE 的对话框习惯一致
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onKeyDown, true)

    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[9995] flex items-center justify-center bg-black/30 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex flex-col overflow-hidden rounded-[12px] border border-[color:var(--ide-dialog-border)] bg-[var(--ide-dialog-bg)] shadow-2xl"
        style={style}
        ref={rootRef}
      >
        {/* 标题行：比较方向，按住可拖动弹窗位置 */}
        <div className="flex shrink-0 cursor-move select-none items-center px-5 pb-2 pt-3.5" {...dragProps}>
          <span className="whitespace-nowrap text-[13px] font-bold text-[color:var(--ide-dialog-fg)]">{title}</span>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* 左侧：差异文件树 */}
          <div className="flex w-[38%] shrink-0 flex-col border-r border-[color:var(--ide-dialog-border)]">
            <div className="flex h-9 shrink-0 items-center gap-0.5 px-2">
              {/* 展开全部目录 */}
              <DialogToolbarButton title={t('expandAll')} onClick={() => setCollapsed(new Set())}>
                {expandAllIcon()}
              </DialogToolbarButton>

              {/* 折叠全部目录 */}
              <DialogToolbarButton
                title={t('collapseAll')}
                onClick={() => {
                  const paths = new Set<string>()

                  // 只有目录才需要折叠；根节点不收进集合，否则整棵树都会消失
                  const walk = (node: ReturnType<typeof buildCommitTree>): void => {
                    if (!node.directory || node.path === '') return

                    paths.add(node.path)
                    for (const child of node.children) walk(child)
                  }

                  walk(tree)
                  setCollapsed(paths)
                }}
              >
                {collapseIcon()}
              </DialogToolbarButton>
            </div>

            <div className="min-h-0 flex-1 overflow-auto px-1 pb-1 [scrollbar-gutter:stable]">
              {files.length === 0 ? (
                <div className="px-2 py-2 text-xs text-[color:var(--ide-dialog-fg)]">{t('compareNoFiles')}</div>
              ) : (
                <PushFileTree
                  t={t}
                  repository={root.slice(root.lastIndexOf('/') + 1)}
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
              )}
            </div>
          </div>

          {/* 右侧：选中文件的差异，与 Git 面板共用同一个渲染器 */}
          <div className="flex min-w-0 flex-1 flex-col">
            <DiffView
              t={t}
              services={services}
              root={root}
              source={source}
              files={sources}
              onSelect={(next) => setSelectedPath(pathOf(next))}
              onClose={onClose}
            />
          </div>
        </div>

        {/* 底部：只保留关闭，比较窗口没有写操作 */}
        <div className="flex shrink-0 items-center justify-end px-4 pb-4 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="h-7 shrink-0 whitespace-nowrap rounded-[4px] border border-[color:var(--ide-dialog-control-border)] bg-[var(--ide-dialog-control-bg)] px-4 text-[13px] text-[color:var(--ide-dialog-fg)] hover:bg-[var(--ide-dialog-hover-bg)]"
          >
            {t('close')}
          </button>
        </div>

        {handle}
      </div>
    </div>
  )
}

/** 文件树工具条按钮。 */
function DialogToolbarButton({
  title,
  onClick,
  children,
}: {
  title: string
  onClick(): void
  children: React.ReactNode
}): React.ReactElement {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="flex h-6 w-6 items-center justify-center rounded text-[color:var(--ide-dialog-fg)] transition-colors hover:bg-[var(--ide-dialog-hover-bg)]"
    >
      {children}
    </button>
  )
}
