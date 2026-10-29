/**
 * 项目树的单行渲染。
 *
 * 目录项行与三种状态行（加载中 / 空 / 截断 / 失败）共用同一个渲染入口：树把它们
 * 摊平成一个列表，键盘上下移动才有一条明确的空间顺序。
 */
import React from 'react'

import { cn } from '../../../common/cn'
import type { Translate } from '../../../types/plugin'

import { chevronIcon, fileBadge, folderIcon } from './icons'
import { BASE_INDENT, INDENT_WIDTH, type EntryRow, type TreeRow } from './tree-model'

/**
 * Git 状态到文件名的配色。
 * @param status 状态字母
 * @returns Tailwind 文本色类名；无状态时为空串
 */
export function gitTone(status: string | undefined): string {
  if (status === undefined) return ''

  if (status === '?' || status === 'A') return 'text-success'
  if (status === 'M' || status === 'R' || status === 'C') return 'text-warn'
  if (status === 'D') return 'text-danger'

  return ''
}

/** 目录项行的 props。 */
export interface EntryRowViewProps {
  /** 行数据。 */
  row: EntryRow
  /** 已绑定前缀的翻译函数。 */
  t: Translate
  /** 是否已展开。 */
  expanded: boolean
  /** 是否为选中行。 */
  selected: boolean
  /** 是否为键盘焦点行。 */
  focused: boolean
  /** Git 状态字母。 */
  gitStatus?: string
  /** 注册行元素引用。 */
  registerRef(element: HTMLButtonElement | null): void
  onClick(): void
  onContextMenu(event: React.MouseEvent): void
  onFocus(): void
}

/**
 * 渲染一个目录项行。
 * @param props 见 EntryRowViewProps
 * @returns 可聚焦的行按钮
 */
export function EntryRowView({
  row,
  t,
  expanded,
  selected,
  focused,
  gitStatus,
  registerRef,
  onClick,
  onContextMenu,
  onFocus,
}: EntryRowViewProps): React.ReactElement {
  return (
    <button
      type="button"
      role="treeitem"
      aria-level={row.depth + 1}
      aria-expanded={row.directory ? expanded : undefined}
      aria-selected={selected}
      tabIndex={focused ? 0 : -1}
      ref={registerRef}
      title={row.path}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onFocus={onFocus}
      className={cn(
        'flex h-6 w-full items-center gap-1.5 truncate pr-2 text-left text-xs leading-none outline-none',
        'hover:bg-surface2 focus-visible:bg-surface2',
        selected ? 'bg-surface2 text-primary' : 'bg-transparent text-primary',
      )}
      // 缩进随层数变化，无法用静态类名表达，因此用行内样式
      style={{ paddingLeft: BASE_INDENT + row.depth * INDENT_WIDTH }}
    >
      {/* 展开箭头；文件行用等宽占位保持名称对齐 */}
      {row.directory ? chevronIcon(expanded) : <span className="w-2.5 shrink-0" aria-hidden="true" />}

      {/* 目录图标或按扩展名着色的文件角标 */}
      {row.directory ? folderIcon(expanded) : fileBadge(row.name)}

      {/* 文件名；带 Git 状态时按状态着色 */}
      <span className={cn('truncate', gitTone(gitStatus))}>{row.name}</span>

      {/* 供读屏器区分目录与文件 */}
      <span className="sr-only">{row.directory ? t('directoryLabel') : t('fileLabel')}</span>
    </button>
  )
}

/** 状态行 props。 */
export interface StatusRowViewProps {
  /** 状态行数据。 */
  row: Extract<TreeRow, { kind: 'loading' | 'empty' | 'truncated' | 'error' }>
  /** 已绑定前缀的翻译函数。 */
  t: Translate
  /** 失败行的重试回调；仅 error 行使用。 */
  onRetry?(): void
}

/**
 * 渲染加载 / 空 / 截断 / 失败状态行。
 * @param props 见 StatusRowViewProps
 * @returns 单行提示
 */
export function StatusRowView({ row, t, onRetry }: StatusRowViewProps): React.ReactElement {
  const paddingLeft = BASE_INDENT + row.depth * INDENT_WIDTH

  if (row.kind === 'error') {
    return (
      <div key={row.key} className="flex h-6 items-center gap-2 pr-2 text-xs text-danger" style={{ paddingLeft }}>
        {/* 目录读取失败提示 */}
        <span className="truncate">{t('loadFailed')}</span>

        {/* 重试按钮：重新请求失败的目录 */}
        <button type="button" onClick={onRetry} className="shrink-0 bg-transparent px-0 text-info hover:underline">
          {t('retry')}
        </button>
      </div>
    )
  }

  const tone = row.kind === 'truncated' ? 'text-warn' : 'text-secondary'
  const text = row.kind === 'truncated' ? t('truncated') : row.kind === 'loading' ? t('loading') : t('empty')

  return (
    <div key={row.key} className={cn('flex h-6 items-center pr-2 text-xs', tone)} style={{ paddingLeft }}>
      {text}
    </div>
  )
}
