/**
 * Local Changes 的变更列表。
 *
 * 两种排布共用同一份视图数据：按目录分组时渲染可折叠的目录树，平铺时直接列文件，
 * 排序规则均由 changes-model 决定，组件只负责显示与事件转发。
 * 文件状态色与项目树、提交弹窗共用同一套 VCS 令牌，同一文件在哪里都同一个颜色。
 */
import React, { Fragment } from 'react'
import type { Translate } from '../../../types/plugin'

import { cn } from '../../../common/cn'
import { directoryCollapseKey, type ChangeGroupKey, type ChangeGroupView } from './changes-model'
import { statusOf, statusTone, type CommitFile, type CommitNode } from './commit-model'
import type { SelectedChange } from './diff-model'
import { chevronDownIcon, chevronRightIcon } from './icons'
import { fileIcon } from '../project-tree/file-icons'
import { folderIcon } from '../project-tree/icons'

/** 变更列表 props。 */
export interface ChangesListProps {
  /** 已绑定 git 前缀的翻译函数。 */
  t: Translate
  /** 按当前分组方式与排序方式整理好的分组。 */
  views: ChangeGroupView[]
  /** 已折叠的分组键与目录键。 */
  collapsed: ReadonlySet<string>
  /** 当前选中文件；null 表示没有选中。 */
  selected: SelectedChange | null
  /** 写操作进行中时禁用分组上的批量暂存。 */
  busy: boolean
  /** 折叠或展开一个分组/目录。 */
  onToggleCollapse(key: string): void
  /** 选中文件以查看差异。 */
  onSelect(item: CommitFile): void
  /** 打开文件右键菜单。 */
  onFileMenu(event: React.MouseEvent, item: CommitFile): void
  /** 打开分组右键菜单。 */
  onGroupMenu(event: React.MouseEvent, view: ChangeGroupView): void
  /** 暂存一组文件。 */
  onStage(items: CommitFile[]): void
}

/**
 * 把变更类型映射成文件名色调。
 * @param item 变更项
 * @returns Tailwind 文本色类名
 */
function toneOf(item: CommitFile): string {
  // 冲突优先于其它状态：合并冲突的文件要一眼可见
  if (item.conflicted) return 'text-vcs-conflict'

  return statusTone(statusOf(item))
}

/**
 * 拆分路径为文件名与目录。
 * @param path 相对路径
 * @returns 文件名与目录
 */
function splitPath(path: string): { name: string; directory: string } {
  const index = path.lastIndexOf('/')

  return index < 0 ? { name: path, directory: '' } : { name: path.slice(index + 1), directory: path.slice(0, index) }
}

/**
 * 渲染变更列表。
 * @param props 见 ChangesListProps
 * @returns 分组、目录树与文件行
 */
export function ChangesList({
  t,
  views,
  collapsed,
  selected,
  busy,
  onToggleCollapse,
  onSelect,
  onFileMenu,
  onGroupMenu,
  onStage,
}: ChangesListProps): React.ReactElement {
  /**
   * 渲染一个文件行。
   * @param item 变更项
   * @param depth 目录层级；平铺模式下固定为 0
   * @param withDirectory 是否在文件名后附带目录灰度文本（平铺模式）
   * @returns 文件行
   */
  function renderFile(item: CommitFile, depth: number, withDirectory: boolean): React.ReactNode {
    const { name, directory } = splitPath(item.path)
    const active = selected !== null && selected.path === item.path && selected.staged === item.staged

    return (
      <button
        key={item.path}
        type="button"
        title={item.path}
        onClick={() => onSelect(item)}
        onContextMenu={(event) => onFileMenu(event, item)}
        className={cn(
          'mx-1 flex h-[23px] items-center gap-1.5 rounded pr-2 text-left text-xs transition-colors',
          // 选中行用 IDEA 的蓝色圆角块，与项目树同一套底色；文件名仍保留状态色
          active ? 'bg-treeselected' : 'hover:bg-surface2/60',
        )}
        // 树里为目录箭头留出一格宽度，平铺时与分组行保持同样的左边距
        style={{ width: 'calc(100% - 8px)', paddingLeft: withDirectory ? 20 : 4 + depth * 14 + 18 }}
      >
        {fileIcon(item.path)}

        {/* 文件名按变更类型着色 */}
        <span className={cn('min-w-0 shrink truncate', toneOf(item))}>{name}</span>

        {/* 目录紧跟在文件名后面，与 IDEA 的「名字 + 灰色路径」一致；树里由层级表达，不再重复 */}
        {withDirectory && directory !== '' && (
          <span className="min-w-0 truncate text-[11px] text-secondary">{directory}</span>
        )}
      </button>
    )
  }

  /**
   * 渲染一个目录节点及其子树。
   * @param node 目录节点
   * @param groupKey 所属分组，用于组装折叠键
   * @param depth 缩进层级，从 1 起
   * @returns 该目录的整棵子树
   */
  function renderNode(node: CommitNode, groupKey: ChangeGroupKey, depth: number): React.ReactNode {
    if (!node.directory) return null

    const key = directoryCollapseKey(groupKey, node.path)
    const open = !collapsed.has(key)

    return (
      <Fragment key={key}>
        <div
          className="flex h-[23px] cursor-pointer items-center gap-1.5 pr-2 text-xs hover:bg-surface2/50"
          style={{ paddingLeft: 4 + depth * 14 }}
          onClick={() => onToggleCollapse(key)}
        >
          <span className="flex w-3.5 shrink-0 justify-center text-secondary">
            {open ? chevronDownIcon() : chevronRightIcon()}
          </span>

          <span className="shrink-0 text-secondary">{folderIcon(open)}</span>

          {/* 目录名；只含一层目录时已由 commit-model 压缩成一行 */}
          <span className="min-w-0 truncate text-primary">{node.name}</span>

          {/* 目录内文件数 */}
          <span className="shrink-0 text-[11px] text-secondary">
            {node.fileCount} {node.fileCount === 1 ? t('file') : t('files')}
          </span>
        </div>

        {open &&
          node.children.map((child) => {
            if (child.directory) return renderNode(child, groupKey, depth + 1)
            if (child.file === undefined) return null

            return renderFile(child.file, depth + 1, false)
          })}
      </Fragment>
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto py-0.5 [scrollbar-gutter:stable]">
      {views.map((view) => {
        const open = !collapsed.has(view.group.key)

        return (
          <div key={view.group.key}>
            <div
              className="group flex h-6 cursor-pointer items-center gap-1.5 px-1 hover:bg-surface2/50"
              onClick={() => onToggleCollapse(view.group.key)}
              onContextMenu={(event) => onGroupMenu(event, view)}
            >
              <span className="flex h-6 w-3.5 items-center justify-center text-secondary">
                {open ? chevronDownIcon() : chevronRightIcon()}
              </span>

              {/* 分组名称：IDEA 里是常规前景色的粗体，只有冲突组才换色提示 */}
              <span
                className={cn('text-xs font-semibold', view.group.key === 'conflicted' ? 'text-warn' : 'text-primary')}
              >
                {t(view.group.label)}
              </span>

              {/* 组内文件数 */}
              <span className="text-[11px] text-secondary">
                {view.items.length} {view.items.length === 1 ? t('file') : t('files')}
              </span>

              <span className="flex-1" />

              {/* 分组批量操作：悬停时显示，不抢占列表宽度 */}
              <button
                type="button"
                className="hidden rounded px-1 text-[10px] text-secondary hover:text-primary group-hover:block"
                disabled={busy}
                onClick={(event) => {
                  event.stopPropagation()
                  onStage(view.items)
                }}
              >
                {t('stage')}
              </button>
            </div>

            {open &&
              (view.tree === null
                ? view.items.map((item) => renderFile(item, 0, true))
                : view.tree.children.map((child) => {
                    if (child.directory) return renderNode(child, view.group.key, 1)
                    if (child.file === undefined) return null

                    return renderFile(child.file, 0, false)
                  }))}
          </div>
        )
      })}
    </div>
  )
}
