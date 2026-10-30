/**
 * Push 弹窗右侧的待推送文件树。
 *
 * 结构与 Commit 弹窗的变更树一致，但这里是只读预览：没有勾选框，目录行只显示
 * 文件数，根节点是仓库目录名。文件状态只体现在文件名颜色上（与项目树同一套
 * VCS 令牌），行首只保留文件类型图标，与 IDEA 的推送预览一致。
 */
import React from 'react'

import { cn } from '../../../common/cn'
import type { Translate } from '../../../types/plugin'

import { fileIcon } from '../project-tree/file-icons'
import { folderIcon } from '../project-tree/icons'
import { flattenFiles, statusOf, statusTone, type CommitFile, type CommitNode } from './commit-model'
import { chevronDownIcon, chevronRightIcon } from './icons'

/** 文件树 props。 */
export interface PushFileTreeProps {
  /** 已绑定 git 前缀的翻译函数。 */
  t: Translate
  /** 仓库目录名，显示在根节点上。 */
  repository: string
  /** 目录树根节点。 */
  tree: CommitNode
  /** 已折叠的目录路径。 */
  collapsed: ReadonlySet<string>
  /** 当前选中的文件路径。 */
  selectedPath: string | null
  /** 切换目录的展开状态。 */
  onToggleCollapse(path: string): void
  /** 选中文件。 */
  onSelect(file: CommitFile): void
}

/**
 * 渲染待推送文件树。
 * @param props 见 PushFileTreeProps
 * @returns 目录树
 */
export function PushFileTree({
  t,
  repository,
  tree,
  collapsed,
  selectedPath,
  onToggleCollapse,
  onSelect,
}: PushFileTreeProps): React.ReactElement {
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
          className={cn(
            'flex h-[23px] cursor-pointer items-center gap-1.5 pr-2 text-xs',
            selectedPath === node.path ? 'bg-treeselected' : 'hover:bg-surface2/50',
          )}
          style={{ paddingLeft: 4 + depth * 14 }}
          onClick={() => onToggleCollapse(node.path)}
        >
          <span className="flex w-3.5 shrink-0 justify-center text-secondary">
            {open ? chevronDownIcon() : chevronRightIcon()}
          </span>

          <span className="shrink-0 text-secondary">{folderIcon(open)}</span>

          {/* 根节点显示仓库名，其下压缩后的目录链路按 path 展示 */}
          <span className={cn('shrink-0 text-primary', isRoot && 'font-semibold')}>
            {isRoot ? repository : node.name}
          </span>

          {/* 根节点写「3 files」，目录行只写数字，与 IDEA 的计数写法一致 */}
          <span className="shrink-0 text-[11px] text-secondary">
            {isRoot ? `${String(files.length)} ${files.length === 1 ? t('file') : t('files')}` : String(files.length)}
          </span>

          {isRoot && <span className="min-w-0 truncate text-[11px] text-secondary">{repository}</span>}
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
   * @param file 待推送文件
   * @param depth 缩进层级
   * @returns 文件行
   */
  function renderFile(file: CommitFile, depth: number): React.ReactNode {
    const status = statusOf(file)
    const name = file.path.slice(file.path.lastIndexOf('/') + 1)

    return (
      <div
        key={file.path}
        className={cn(
          'flex h-[23px] cursor-pointer items-center gap-1.5 pr-2 text-xs',
          selectedPath === file.path ? 'bg-treeselected' : 'hover:bg-surface2/50',
        )}
        // 文件行留出目录箭头的宽度，图标才能与父目录对齐
        style={{ paddingLeft: 4 + depth * 14 + 18 }}
        onClick={() => onSelect(file)}
      >
        {fileIcon(file.path)}

        <span className={cn('min-w-0 truncate', statusTone(status))}>{name}</span>
      </div>
    )
  }

  // 没有待推送文件时整棵树为空，由弹窗显示空状态文案
  return <>{tree.fileCount > 0 && renderNode(tree, 0)}</>
}
