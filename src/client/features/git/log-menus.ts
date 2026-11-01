/**
 * Log 页签的右键菜单与下拉菜单定义。
 *
 * 菜单项只是「标签 + 动作」的数组，与 React 状态无关：把它们从组件里挪出来，
 * 组件剩下的只有状态与取数，读起来才是一条线。
 */
import type { Translate } from '../../../types/plugin'

import { branchIcon, copyRevisionIcon, createPatchIcon, undoArrowIcon } from './icons'
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

/** 提交菜单需要的上下文：决定哪些改写历史的项可用。 */
export interface CommitMenuContext {
  /** 是否为当前分支尖端；只有尖端能直接改写提交信息。 */
  isHead: boolean
  /** 是否允许丢弃该提交；根提交没有父提交，不能丢。 */
  canDrop: boolean
  /** 子提交是否已在列表里。 */
  hasChild: boolean
  /** 父提交是否已在列表里。 */
  hasParent: boolean
}

/**
 * 构建提交右键菜单。
 *
 * 分组与顺序照 IDEA 的提交菜单：复制与拣选、检出与比较、重置与反向、改写历史、
 * 分支与标签、父子导航。暂未实现的能力保留在原位并置灰，菜单结构才不会漂移。
 * @param t 翻译函数
 * @param context 提交上下文
 * @param run 执行动作
 * @returns 菜单项
 */
export function commitMenuItems(t: Translate, context: CommitMenuContext, run: (id: string) => void): MenuItem[] {
  return [
    {
      id: 'copyRevision',
      label: t('copyRevisionNumber'),
      icon: copyRevisionIcon(),
      shortcut: '⌥⇧⌘C',
      run: () => run('copyRevision'),
    },
    { id: 'createPatch', label: t('createPatch'), icon: createPatchIcon(), run: () => run('createPatch') },
    { id: 'cherryPick', label: t('cherryPick'), icon: branchIcon(14), run: () => run('cherryPick') },

    { id: 'checkout', label: t('checkoutRevision'), separatorBefore: true, run: () => run('checkout') },
    { id: 'showRepository', label: t('showRepositoryAtRevision'), run: () => run('showRepository') },
    { id: 'compareWithLocal', label: t('commitCompareWithLocal'), run: () => run('compareWithLocal') },

    { id: 'reset', label: t('resetHere'), icon: undoArrowIcon(), separatorBefore: true, run: () => run('reset') },
    { id: 'revert', label: t('revertCommit'), run: () => run('revert') },
    { id: 'undo', label: t('undoCommit'), disabled: true },

    {
      id: 'editMessage',
      label: t('editCommitMessage'),
      shortcut: 'F2',
      separatorBefore: true,
      disabled: !context.isHead,
      run: () => run('editMessage'),
    },
    { id: 'fixup', label: t('fixup'), disabled: true },
    { id: 'squash', label: t('squashInto'), disabled: true },
    { id: 'drop', label: t('dropCommit'), disabled: !context.canDrop, run: () => run('drop') },
    { id: 'interactiveRebase', label: t('interactiveRebase'), disabled: true },
    { id: 'pushUpToHere', label: t('pushUpToHere'), run: () => run('pushUpToHere') },

    {
      id: 'newBranch',
      label: t('newBranchEllipsis'),
      shortcut: '⌥⌘N',
      separatorBefore: true,
      run: () => run('newBranch'),
    },
    { id: 'newTag', label: t('newTag'), run: () => run('newTag') },

    {
      id: 'goChild',
      label: t('goToChildCommit'),
      shortcut: '←',
      separatorBefore: true,
      disabled: !context.hasChild,
      run: () => run('goChild'),
    },
    {
      id: 'goParent',
      label: t('goToParentCommit'),
      shortcut: '→',
      disabled: !context.hasParent,
      run: () => run('goParent'),
    },
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
