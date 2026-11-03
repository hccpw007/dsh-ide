/**
 * Log 页签左侧的竖向工具栏。
 *
 * 只做按钮装配：动作全部由 LogTab 提供，工具栏不认识 Git 数据。这样工具栏的
 * 排布（顺序、分组、禁用文案）可以独立于数据加载调整。
 */
import React from 'react'

import type { Translate } from '../../../types/plugin'

import { GitSideToolbar, type GitToolbarItem } from './GitSideToolbar'
import { backIcon, plusIcon, trashIcon } from './icons-ui'
import { starIcon, updateIcon } from './icons-vcs'
import { collapseAllIcon, expandAllIcon } from '../project-tree/icons'

/** Log 工具栏 props。 */
export interface LogToolbarProps {
  /** 已绑定 git 前缀的翻译函数。 */
  t: Translate
  /** 左侧树是否选中了某一行；没有选中行时全部动作不可用。 */
  hasSelection: boolean
  /** 选中的引用是否已收藏。 */
  favorite: boolean
  /** 选中的引用能否更新；远程分支与标签没有上游可拉取。 */
  canUpdate: boolean
  /** 选中的引用能否删除；当前检出分支与标签不能删。 */
  canDelete: boolean
  /** 从选中引用新建分支。 */
  onNewBranch(): void
  /** 更新选中的分支。 */
  onUpdate(): void
  /** 删除选中的引用。 */
  onDelete(): void
  /** 切换选中引用的收藏。 */
  onToggleFavorite(): void
  /** 折叠全部分组。 */
  onCollapseAll(): void
  /** 展开全部分组。 */
  onExpandAll(): void
}

/**
 * 渲染 Log 页签的工具栏。
 * @param props 见 LogToolbarProps
 * @returns 一列图标按钮
 */
export function LogToolbar({
  t,
  hasSelection,
  favorite,
  canUpdate,
  canDelete,
  onNewBranch,
  onUpdate,
  onDelete,
  onToggleFavorite,
  onCollapseAll,
  onExpandAll,
}: LogToolbarProps): React.ReactElement {
  /** 没有选中行时统一提示先选一行；有选中行时按引用种类给出各自的不可用原因。 */
  const noSelection = hasSelection ? undefined : t('selectItemFirst')

  /** 与 IDEA 的分支工具栏一致：新建、更新、删除、收藏，然后是分组折叠。 */
  const items: GitToolbarItem[] = [
    { id: 'back', title: t('goBack'), icon: backIcon(), unavailable: t('notAvailable') },
    {
      id: 'newBranch',
      title: t('newBranch'),
      icon: plusIcon(),
      separatorBefore: true,
      unavailable: noSelection,
      onClick: onNewBranch,
    },
    {
      id: 'update',
      title: t('update'),
      icon: updateIcon(),
      unavailable: noSelection ?? (canUpdate ? undefined : t('updateLocalOnly')),
      onClick: onUpdate,
    },
    {
      id: 'delete',
      title: t('deleteBranch'),
      icon: trashIcon(),
      unavailable: noSelection ?? (canDelete ? undefined : t('deleteUnavailable')),
      onClick: onDelete,
    },
    {
      id: 'favorite',
      title: favorite ? t('removeFavorite') : t('addFavorite'),
      icon: starIcon(),
      unavailable: noSelection,
      onClick: onToggleFavorite,
    },
    {
      id: 'expand',
      title: t('expandAll'),
      icon: expandAllIcon(15),
      separatorBefore: true,
      onClick: onExpandAll,
    },
    {
      id: 'collapse',
      title: t('collapseAll'),
      icon: collapseAllIcon(15),
      onClick: onCollapseAll,
    },
  ]

  return <GitSideToolbar label={t('title')} items={items} />
}
