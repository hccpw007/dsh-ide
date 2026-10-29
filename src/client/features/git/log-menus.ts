/**
 * Log 页签的右键菜单与下拉菜单定义。
 *
 * 菜单项只是「标签 + 动作」的数组，与 React 状态无关：把它们从组件里挪出来，
 * 组件剩下的只有状态与取数，读起来才是一条线。
 */
import type { Translate } from '../../../types/plugin'

import type { DateFilter } from './LogFilterBar'
import type { MenuItem } from './menu'

/** 过滤下拉的类别。 */
export type FilterKind = 'branch' | 'user' | 'date' | 'paths'

/** 过滤菜单当前取值。 */
export interface FilterState {
  /** 是否显示全部分支的提交。 */
  allBranches: boolean
  /** 当前分支。 */
  branch: string
  /** 作者过滤。 */
  userFilter: string
  /** 可选作者。 */
  authors: string[]
  /** 日期过滤。 */
  dateFilter: DateFilter
  /** 路径过滤。 */
  pathFilter: string
  /** 当前活动文件，供「仅看此文件」用。 */
  activeFile: string | null
}

/** 过滤菜单写回动作。 */
export interface FilterActions {
  setAllBranches(value: boolean): void
  setUserFilter(value: string): void
  setDateFilter(value: DateFilter): void
  setPathFilter(value: string): void
}

/**
 * 构建分支右键菜单。
 * @param t 翻译函数
 * @param target 分支短名
 * @param isRemote 是否远程分支
 * @param run 执行动作
 * @returns 菜单项
 */
export function branchMenuItems(
  t: Translate,
  target: string,
  isRemote: boolean,
  run: (id: string, target: string) => void,
): MenuItem[] {
  return [
    { id: 'checkout', label: t('checkout'), run: () => run('checkout', target) },
    { id: 'newBranch', label: t('newBranchFrom'), run: () => run('newBranch', target) },
    { id: 'rename', label: t('renameBranch'), disabled: isRemote, run: () => run('rename', target) },
    { id: 'merge', label: t('mergeIntoCurrent'), separatorBefore: true, run: () => run('merge', target) },
    { id: 'rebase', label: t('rebaseCurrent'), run: () => run('rebase', target) },
    { id: 'fetch', label: t('fetch'), separatorBefore: true, run: () => run('fetch', target) },
    { id: 'pull', label: t('pull'), run: () => run('pull', target) },
    { id: 'push', label: t('push'), run: () => run('push', target) },
    { id: 'copy', label: t('copyBranchName'), separatorBefore: true, run: () => run('copy', target) },
    { id: 'delete', label: t('deleteBranch'), danger: true, disabled: isRemote, run: () => run('delete', target) },
  ]
}

/**
 * 构建提交右键菜单。
 * @param t 翻译函数
 * @param run 执行动作
 * @returns 菜单项
 */
export function commitMenuItems(t: Translate, run: (id: string) => void): MenuItem[] {
  return [
    { id: 'checkout', label: t('checkoutRevision'), run: () => run('checkout') },
    { id: 'newBranch', label: t('newBranchHere'), run: () => run('newBranch') },
    { id: 'cherryPick', label: t('cherryPick'), separatorBefore: true, run: () => run('cherryPick') },
    { id: 'revert', label: t('revertCommit'), run: () => run('revert') },
    { id: 'reset', label: t('resetHere'), danger: true, run: () => run('reset') },
    { id: 'copyHash', label: t('copyHash'), separatorBefore: true, run: () => run('copyHash') },
    { id: 'copySubject', label: t('copySubject'), run: () => run('copySubject') },
  ]
}

/**
 * 构建过滤下拉菜单。
 * @param t 翻译函数
 * @param kind 过滤类别
 * @param state 当前取值
 * @param actions 写回动作
 * @returns 菜单项
 */
export function filterMenuItems(
  t: Translate,
  kind: FilterKind,
  state: FilterState,
  actions: FilterActions,
): MenuItem[] {
  if (kind === 'branch') {
    return [
      { id: 'all', label: `${state.allBranches ? '✓ ' : ''}${t('all')}`, run: () => actions.setAllBranches(true) },
      {
        id: 'current',
        label: `${state.allBranches ? '' : '✓ '}${state.branch === '' ? t('headCurrent') : state.branch}`,
        run: () => actions.setAllBranches(false),
      },
    ]
  }

  if (kind === 'user') {
    return [
      { id: 'all', label: `${state.userFilter === '' ? '✓ ' : ''}${t('all')}`, run: () => actions.setUserFilter('') },
      ...state.authors.map((author) => ({
        id: `user:${author}`,
        label: `${state.userFilter === author ? '✓ ' : ''}${author}`,
        run: () => actions.setUserFilter(author),
      })),
    ]
  }

  if (kind === 'date') {
    const options: { id: DateFilter; label: string }[] = [
      { id: 'all', label: t('all') },
      { id: 'today', label: t('today') },
      { id: 'week', label: t('lastWeek') },
      { id: 'month', label: t('lastMonth') },
    ]

    return options.map((option) => ({
      id: option.id,
      label: `${state.dateFilter === option.id ? '✓ ' : ''}${option.label}`,
      run: () => actions.setDateFilter(option.id),
    }))
  }

  // 路径过滤只有「全部」与「当前文件」两个来源，后者在没有活动文件时不出现
  const activeFile = state.activeFile

  return [
    { id: 'all', label: `${state.pathFilter === '' ? '✓ ' : ''}${t('all')}`, run: () => actions.setPathFilter('') },
    ...(activeFile === null
      ? []
      : [
          {
            id: 'active',
            label: `${state.pathFilter === activeFile ? '✓ ' : ''}${activeFile}`,
            run: () => actions.setPathFilter(activeFile),
          },
        ]),
  ]
}
