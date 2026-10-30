/**
 * Commit 弹窗的变更树。
 *
 * 根节点是 changelist（用仓库目录名），其下按目录分组，只含单个目录的中间节点会被
 * 压缩成一行；未纳入版本控制的文件单独成组。勾选框支持三态：目录与 changelist 按
 * 子项聚合出「部分选中」，与 IDEA 的提交树一致。
 */
import React from 'react'

import { cn } from '../../../common/cn'
import type { Translate } from '../../../types/plugin'

import { flattenFiles, statusOf, statusTone, type CommitFile, type CommitNode } from './commit-model'
import { chevronDownIcon, chevronRightIcon, fileIcon, folderIcon } from './icons'

/** 未跟踪文件分组的折叠键，与目录路径不会冲突。 */
export const UNTRACKED_KEY = 'unversioned'

/** 勾选框的三态。 */
type CheckState = 'all' | 'none' | 'partial'

/** 变更树 props。 */
export interface CommitTreeProps {
  /** 已绑定 git 前缀的翻译函数。 */
  t: Translate
  /** changelist 名称，显示在根节点上。 */
  changelist: string
  /** 已跟踪变更的目录树根节点。 */
  tree: CommitNode
  /** 未跟踪文件。 */
  untracked: CommitFile[]
  /** 已勾选的路径。 */
  checked: ReadonlySet<string>
  /** 已折叠的目录路径与分组键。 */
  collapsed: ReadonlySet<string>
  /** 当前选中的文件路径。 */
  selectedPath: string | null
  /** 切换一组文件的勾选状态。 */
  onToggleCheck(files: CommitFile[], next: boolean): void
  /** 切换目录或分组的折叠状态。 */
  onToggleCollapse(key: string): void
  /** 选中文件，供下方差异视图使用。 */
  onSelect(file: CommitFile): void
}

/**
 * 渲染变更树。
 * @param props 见 CommitTreeProps
 * @returns 已跟踪变更树与未跟踪分组
 */
export function CommitTree({
  t,
  changelist,
  tree,
  untracked,
  checked,
  collapsed,
  selectedPath,
  onToggleCheck,
  onToggleCollapse,
  onSelect,
}: CommitTreeProps): React.ReactElement {
  /**
   * 计算一组文件的勾选态。
   * @param files 目标文件
   * @returns 全选、部分选中或未选
   */
  function checkStateOf(files: CommitFile[]): CheckState {
    if (files.length === 0) return 'none'

    const selected = files.filter((file) => checked.has(file.path)).length

    return selected === 0 ? 'none' : selected === files.length ? 'all' : 'partial'
  }

  /**
   * 渲染一个目录节点及其子节点。
   * @param node 目录节点
   * @param depth 缩进层级
   * @returns 该目录的整棵子树
   */
  function renderNode(node: CommitNode, depth: number): React.ReactNode {
    if (!node.directory) return null

    const files = flattenFiles(node)
    const open = !collapsed.has(node.path)
    const isRoot = node.path === ''

    return (
      <React.Fragment key={node.path}>
        <div
          className="flex h-[23px] cursor-pointer items-center gap-1.5 pr-2 text-xs hover:bg-surface2/50"
          style={{ paddingLeft: 4 + depth * 14 }}
          onClick={() => onToggleCollapse(node.path)}
        >
          <span className="flex w-3.5 shrink-0 justify-center text-secondary">
            {open ? chevronDownIcon() : chevronRightIcon()}
          </span>

          <Checkbox state={checkStateOf(files)} onChange={(next) => onToggleCheck(files, next)} />

          <span className="shrink-0 text-secondary">{folderIcon(open)}</span>

          {/* 目录名；压缩链路后显示为 components/DealConditions */}
          <span className="shrink-0 text-primary">{isRoot ? changelist : node.name}</span>

          {/* 目录内文件数 */}
          <span className="shrink-0 text-[11px] text-secondary">
            {files.length} {files.length === 1 ? t('file') : t('files')}
          </span>

          {/* 根节点右侧补一个灰色路径，与 IDEA 的「名称 + 路径」一致 */}
          {isRoot && <span className="min-w-0 truncate text-[11px] text-secondary">{changelist}</span>}
        </div>

        {open &&
          node.children.map((child) => {
            if (child.directory) return renderNode(child, depth + 1)
            if (child.file === undefined) return null

            return renderFile(child.file, depth + 1)
          })}
      </React.Fragment>
    )
  }

  /**
   * 渲染一个文件节点。
   * @param file 待提交文件
   * @param depth 缩进层级
   * @returns 文件行
   */
  function renderFile(file: CommitFile, depth: number): React.ReactNode {
    const letter = statusOf(file)
    const name = file.path.slice(file.path.lastIndexOf('/') + 1)

    return (
      <div
        key={file.path}
        className={cn(
          'flex h-[23px] cursor-pointer items-center gap-1.5 pr-2 text-xs',
          selectedPath === file.path ? 'bg-treeselected' : 'hover:bg-surface2/50',
        )}
        // 文件行留出目录箭头的宽度，勾选框才能和父目录对齐
        style={{ paddingLeft: 4 + depth * 14 + 18 }}
        onClick={() => onSelect(file)}
      >
        <Checkbox
          state={checked.has(file.path) ? 'all' : 'none'}
          onChange={(next) => onToggleCheck([file], next)}
        />

        {/* 变更状态字母：颜色与项目树、Local Changes 同一套 */}
        <span className={cn('w-2.5 shrink-0 text-[10px] font-bold', statusTone(letter))}>{letter}</span>

        {fileIcon(file.path, 13)}

        <span className={cn('min-w-0 truncate', statusTone(letter))}>{name}</span>
      </div>
    )
  }

  const untrackedOpen = !collapsed.has(UNTRACKED_KEY)

  return (
    <>
      {/* 没有已跟踪变更时不渲染空的 changelist 根节点，只保留未跟踪分组 */}
      {tree.fileCount > 0 && renderNode(tree, 0)}

      {untracked.length > 0 && (
        <div>
          <div
            className="flex h-[23px] cursor-pointer items-center gap-1.5 px-1 text-xs hover:bg-surface2/50"
            style={{ paddingLeft: 4 }}
            onClick={() => onToggleCollapse(UNTRACKED_KEY)}
          >
            <span className="flex w-3.5 shrink-0 justify-center text-secondary">
              {untrackedOpen ? chevronDownIcon() : chevronRightIcon()}
            </span>

            <Checkbox state={checkStateOf(untracked)} onChange={(next) => onToggleCheck(untracked, next)} />

            {/* 未纳入版本控制的文件分组 */}
            <span className="shrink-0 text-primary">{t('groupUntracked')}</span>

            <span className="shrink-0 text-[11px] text-secondary">
              {untracked.length} {untracked.length === 1 ? t('file') : t('files')}
            </span>
          </div>

          {untrackedOpen && untracked.map((file) => renderFile(file, 1))}
        </div>
      )}
    </>
  )
}

/**
 * 三态勾选框。
 * @param props 状态与切换回调
 * @returns 方形勾选框
 */
function Checkbox({ state, onChange }: { state: CheckState; onChange(next: boolean): void }): React.ReactElement {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state === 'partial' ? 'mixed' : state === 'all'}
      onClick={(event) => {
        // 勾选只改变勾选状态，不触发行的展开或选中
        event.stopPropagation()
        onChange(state !== 'all')
      }}
      className={cn(
        'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border',
        state === 'none' ? 'border-line4 bg-inputbg' : 'border-actionblue bg-actionblue',
      )}
    >
      {state === 'all' && (
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true" focusable="false">
          <path
            d="M1.6 5.2 4 7.6 8.4 2.6"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-onAccent"
          />
        </svg>
      )}

      {/* 部分选中：一条横杠，与 IDEA 的三态勾选框一致 */}
      {state === 'partial' && <span className="h-0.5 w-2 rounded-sm bg-onAccent" />}
    </button>
  )
}
