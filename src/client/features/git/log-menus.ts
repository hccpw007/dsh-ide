/**
 * Log 页签的右键菜单与下拉菜单定义。
 *
 * 菜单项只是「标签 + 动作」的数组，与 React 状态无关：把它们从组件里挪出来，
 * 组件剩下的只有状态与取数，读起来才是一条线。
 */
import type { Translate } from '../../../types/plugin'

import type { GitRef, GitRefs } from './api'
import { branchIcon, copyRevisionIcon, createPatchIcon, starIcon, undoArrowIcon } from './icons-vcs'
import type { DateFilter } from './LogFilterBar'
import type { MenuItem } from './menu'

/** 过滤下拉的类别。 */
export type FilterKind = 'branch' | 'user' | 'date' | 'paths'

/** 用户列表最多显示的行数：协同仓库的作者可能很多，超出的靠滚动查看。 */
const USER_LIST_MAX_ROWS = 10

/** 分支过滤菜单的取值：分支列表与收藏。 */
export interface BranchFilterState {
  /** 当前分支过滤；空串表示所有分支，HEAD 表示只看 HEAD，其余是引用名。 */
  branch: string
  /** 分支、远程与标签；未读取到时为 null。 */
  refs: GitRefs | null
  /** 收藏的引用短名；Favorites 分组来自它。 */
  favorites: ReadonlySet<string>
}

/** 分支过滤菜单的写回动作。 */
export interface BranchFilterActions {
  /** 按给定引用过滤提交；空串表示所有分支，HEAD 表示只看 HEAD。 */
  applyBranch(branch: string): void
  /** 打开输入框让用户直接填写分支、标签或引用名。 */
  selectBranch(): void
}

/** 过滤菜单当前取值。 */
export interface FilterState {
  /** 作者过滤。 */
  userFilter: string
  /** 当前仓库的提交身份（git config user.name）；为空时 me 项不可点。 */
  currentUser: string
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
  /** 打开输入框让用户直接填写作者名；不给时菜单里不出现 Select... 项。 */
  selectUser?(): void
  /** 用户搜索框输入变化；不给时用户菜单不出现搜索框。 */
  searchUser?(value: string): void
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
 * @param kind 过滤类别；分支过滤见 branchFilterMenuItems
 * @param state 当前取值
 * @param actions 写回动作
 * @returns 菜单项
 */
export function filterMenuItems(
  t: Translate,
  kind: Exclude<FilterKind, 'branch'>,
  state: FilterState,
  actions: FilterActions,
): MenuItem[] {
  if (kind === 'user') return userFilterItems(t, state, actions)

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

/**
 * 构建分支过滤菜单。
 *
 * 结构与 IDEA 的分支过滤器一致：首项 Select... 打开输入框直接填引用，接着是
 * Favorites 分组（HEAD 与已收藏的引用），再往下 Local 与各远端各占一个子菜单——
 * 仓库有几个远端、几十个分支时菜单也不会长出屏幕。
 * @param t 翻译函数
 * @param state 当前取值
 * @param actions 写回动作
 * @returns 菜单项
 */
export function branchFilterMenuItems(
  t: Translate,
  state: BranchFilterState,
  actions: BranchFilterActions,
): MenuItem[] {
  const local = state.refs?.local ?? []
  const remote = state.refs?.remote ?? []
  const tags = state.refs?.tags ?? []

  // 收藏项按分支树的顺序展开：本地、远程、标签；已删除的引用查不到就自然跳过
  const favoriteNames = [...local, ...remote, ...tags]
    .map((item) => item.name)
    .filter((name) => state.favorites.has(name))

  return [
    // 首项在 IDEA 里就是带焦点蓝底的 Select...，点击后可以输入分支、标签或任意引用
    { id: 'select', label: t('selectEllipsis'), icon: null, selected: true, run: () => actions.selectBranch() },
    // 分组标题沿用菜单里的结构占位：只显示文案，不响应点击
    { id: 'favoritesTitle', label: t('favorites'), icon: null, disabled: true },
    // HEAD 项显式只看 HEAD 的提交历史；「所有分支」由清空过滤或眼睛按钮表达
    branchFilterItem(t('head'), 'HEAD', state, actions, true),
    ...favoriteNames.map((name) => branchFilterItem(name, name, state, actions, true)),
    {
      id: 'local',
      label: t('local'),
      icon: null,
      separatorBefore: true,
      children: [
        branchFilterItem(t('head'), 'HEAD', state, actions, false),
        ...local.map((item) => branchFilterItem(item.name, item.name, state, actions, false)),
      ],
    },
    ...remoteFilterGroups(remote).map(([name, branches]) => ({
      id: `remote:${name}`,
      label: `${name}/...`,
      icon: null,
      children: branches.map((branch) =>
        branchFilterItem(branch.slice(name.length + 1), branch, state, actions, false),
      ),
    })),
  ]
}

/**
 * 构建一个可选的分支项。
 * @param label 展示文案
 * @param ref 过滤用的引用名；空串表示所有分支，HEAD 表示只看 HEAD
 * @param state 当前取值，用来标出正在生效的项
 * @param actions 写回动作
 * @param favorite 是否画收藏星标
 * @returns 菜单项
 */
function branchFilterItem(
  label: string,
  ref: string,
  state: BranchFilterState,
  actions: BranchFilterActions,
  favorite: boolean,
): MenuItem {
  // 看所有分支时过滤为空，没有「当前分支」，任何具名项都不打勾
  const active = state.branch === ref

  return {
    id: `${favorite ? 'favorite' : 'branch'}:${ref}`,
    label: `${active ? '✓ ' : ''}${label}`,
    // 图标槽一律占位，收藏项与普通项的文案才能左右对齐
    icon: favorite ? starIcon('text-warn') : null,
    run: () => actions.applyBranch(ref),
  }
}

/**
 * 按远端名分组远程分支。
 *
 * 远端名取第一个 `/` 之前的部分；没有分支段的裸引用（如 `origin`）不是可检出的
 * 分支，跳过——与左侧分支树的处理一致。
 * @param remote 远程分支
 * @returns 远端名与该远端的远程分支全名
 */
function remoteFilterGroups(remote: readonly GitRef[]): [string, string[]][] {
  const groups = new Map<string, string[]>()

  for (const branch of remote) {
    const slash = branch.name.indexOf('/')

    if (slash < 0) continue

    const name = branch.name.slice(0, slash)
    const list = groups.get(name) ?? []

    list.push(branch.name)
    groups.set(name, list)
  }

  return [...groups.entries()]
}

/**
 * 构建用户过滤菜单。
 *
 * 结构与 IDEA 的 VCS Users 下拉一致：前两项固定是 Select... 与 me，分隔线下面是一个
 * 搜索框加作者列表；协同仓库的作者可能非常多，列表固定最多显示 USER_LIST_MAX_ROWS 行，
 * 其余靠滚动，搜索框与固定项始终可见。当前生效的作者用实心蓝底标出。
 * @param t 翻译函数
 * @param state 当前取值
 * @param actions 写回动作
 * @returns 菜单项
 */
function userFilterItems(t: Translate, state: FilterState, actions: FilterActions): MenuItem[] {
  return [
    // 首项打开输入框：作者名不一定在列表里出现过，需要能直接填
    ...(actions.selectUser === undefined
      ? []
      : [{ id: 'select', label: t('selectEllipsis'), icon: null, run: () => actions.selectUser?.() }]),
    // 第二项固定是 me：直接过滤当前提交身份；未配置 user.name 时没有可用的值，置灰
    {
      id: 'me',
      label: t('me'),
      icon: null,
      disabled: state.currentUser === '',
      selected: state.currentUser !== '' && state.userFilter === state.currentUser,
      run: () => actions.setUserFilter(state.currentUser),
    },
    // 分隔线下面的输入框就地筛选作者：IDEA 的 Recent 分组标题位置换成可输入的搜索框
    ...(actions.searchUser === undefined
      ? []
      : [
          {
            id: 'userSearch',
            label: '',
            icon: null,
            separatorBefore: true,
            search: { placeholder: t('selectUserPlaceholder'), onChange: actions.searchUser },
          },
        ]),
    // 作者列表限高滚动：候选很多时菜单不会撑满整屏，上方搜索框也不会被滚走
    {
      id: 'userList',
      label: '',
      icon: null,
      list: {
        items: state.authors.map((author) => ({
          id: `user:${author}`,
          label: author,
          icon: null,
          // 当前过滤值就在列表里高亮，不再单独占一行
          selected: state.userFilter === author,
          run: () => actions.setUserFilter(author),
        })),
        maxRows: USER_LIST_MAX_ROWS,
      },
    },
  ]
}
