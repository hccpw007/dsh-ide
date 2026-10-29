/**
 * Log 页签左侧的竖向工具栏。
 *
 * 只做按钮装配：动作全部由 LogTab 提供，工具栏不认识 Git 数据。这样工具栏的
 * 排布（顺序、分组、禁用文案）可以独立于数据加载调整。
 */
import React from 'react'

import type { Translate } from '../../../types/plugin'

import { GitSideToolbar, type GitToolbarItem } from './GitSideToolbar'
import {
  backIcon,
  checkoutIcon,
  chevronDownIcon,
  clockIcon,
  collapseIcon,
  diffIcon,
  gearIcon,
  plusIcon,
  searchIcon,
  starIcon,
  trashIcon,
} from './icons'

/** Log 工具栏 props。 */
export interface LogToolbarProps {
  /** 已绑定 git 前缀的翻译函数。 */
  t: Translate
  /** 当前选中的分支；空串表示没有可作用的对象。 */
  branch: string
  /** 新建分支。 */
  onNewBranch(): void
  /** 检出当前分支。 */
  onCheckout(): void
  /** 删除当前分支。 */
  onDelete(): void
  /** 聚焦提交搜索框。 */
  onSearch(): void
}

/**
 * 渲染 Log 页签的工具栏。
 * @param props 见 LogToolbarProps
 * @returns 一列图标按钮
 */
export function LogToolbar({
  t,
  branch,
  onNewBranch,
  onCheckout,
  onDelete,
  onSearch,
}: LogToolbarProps): React.ReactElement {
  /** 与截图顺序一致；尚未接上的能力保持禁用并写明原因。 */
  const items: GitToolbarItem[] = [
    { id: 'back', title: t('goBack'), icon: backIcon(), unavailable: t('notAvailable') },
    { id: 'newBranch', title: t('newBranch'), icon: plusIcon(), separatorBefore: true, onClick: onNewBranch },
    {
      id: 'checkout',
      title: t('checkout'),
      icon: checkoutIcon(),
      unavailable: branch === '' ? t('selectItemFirst') : undefined,
      onClick: branch === '' ? undefined : onCheckout,
    },
    {
      id: 'delete',
      title: t('deleteBranch'),
      icon: trashIcon(),
      unavailable: branch === '' ? t('selectItemFirst') : undefined,
      onClick: branch === '' ? undefined : onDelete,
    },
    { id: 'diff', title: t('showDiff'), icon: diffIcon(), unavailable: t('diffInline') },
    { id: 'search', title: t('searchCommits'), icon: searchIcon(), separatorBefore: true, onClick: onSearch },
    { id: 'favorite', title: t('addFavorite'), icon: starIcon(), unavailable: t('notAvailable') },
    { id: 'timeline', title: t('showTimeline'), icon: clockIcon(), unavailable: t('notAvailable') },
    { id: 'settings', title: t('settings'), icon: gearIcon(), unavailable: t('notAvailable') },
    {
      id: 'collapse',
      title: t('collapseAll'),
      icon: collapseIcon(),
      separatorBefore: true,
      unavailable: t('nothingToCollapse'),
    },
    { id: 'expand', title: t('expandAll'), icon: chevronDownIcon(), unavailable: t('nothingToCollapse') },
  ]

  return <GitSideToolbar label={t('title')} items={items} />
}
