/**
 * Log 分支树的右键菜单。
 *
 * 三种形态与 IDEA 一一对应：当前分支、其他本地分支、远程分支。菜单只产出
 * 「文案 + 快捷键 + 动作 id」的数组，文案里的分支名在这里填充，真正执行交给
 * branch-actions，因此调整菜单结构不必碰 git 调用。
 */
import type { Translate } from '../../../types/plugin'

import type { GitRefs } from './api'
import type { MenuItem } from './menu'

/** 被右键的引用种类。 */
export type BranchKind = 'local' | 'remote' | 'tag'

/** 分支菜单需要的上下文。 */
export interface BranchMenuContext {
  /** 被右键的引用短名；远程分支带远端前缀，如 `origin/main`。 */
  target: string
  /** 引用种类。 */
  kind: BranchKind
  /** 是否为当前检出分支。 */
  current: boolean
  /** 当前检出分支短名；游离 HEAD 或未读取到时为空串。 */
  currentBranch: string
  /** 被右键本地分支的上游短名；没有跟踪分支时为空串。 */
  upstream: string
}

/** 执行一个菜单动作。 */
export type BranchActionRunner = (id: string) => void

/**
 * 由引用短名推出分支菜单需要的上下文。
 *
 * Log 分支树与顶部分支弹窗共用这一份换算：空串代表 HEAD 入口，换算成当前检出
 * 分支，两者弹出的就是同一套菜单。
 * @param refs 分支、远端与标签
 * @param target 引用短名；空串代表 HEAD 入口
 * @returns 上下文；游离 HEAD 上没有可操作的本地分支时返回 null
 */
export function branchContextFrom(refs: GitRefs | null, target: string): BranchMenuContext | null {
  const currentBranch = (refs?.local ?? []).find((item) => item.isHead)?.name ?? ''
  const name = target === '' ? currentBranch : target

  if (name === '') return null

  const local = (refs?.local ?? []).find((item) => item.name === name)
  const kind: BranchKind = (refs?.remote ?? []).some((item) => item.name === name)
    ? 'remote'
    : (refs?.tags ?? []).some((item) => item.name === name)
      ? 'tag'
      : 'local'

  return {
    target: name,
    kind,
    current: local?.isHead === true,
    currentBranch,
    upstream: local?.upstream ?? '',
  }
}

/**
 * 用实际分支名填充文案模板。
 *
 * 语言包只提供 `{branch}` 形式的模板，替换放在这一层，菜单项才算「已翻译文案」。
 * @param template 语言包模板
 * @param values 占位符取值
 * @returns 已替换的文案
 */
function fill(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, value), template)
}

/**
 * 构建分支右键菜单。
 * @param t 翻译函数
 * @param context 分支上下文
 * @param run 执行动作
 * @returns 菜单项
 */
export function branchMenuItems(t: Translate, context: BranchMenuContext, run: BranchActionRunner): MenuItem[] {
  if (context.kind === 'remote') return remoteBranchMenu(t, context, run)
  if (context.kind === 'tag') return tagMenu(t, context, run)

  return context.current ? currentBranchMenu(t, context, run) : localBranchMenu(t, context, run)
}

/**
 * 当前检出分支的菜单：没有 Delete 与 Checkout and Rebase（分支已经是当前分支）。
 * @param t 翻译函数
 * @param context 分支上下文
 * @param run 执行动作
 * @returns 菜单项
 */
function currentBranchMenu(t: Translate, context: BranchMenuContext, run: BranchActionRunner): MenuItem[] {
  const target = context.target
  const branch = { branch: target }

  return [
    { id: 'checkout', label: t('checkout'), run: () => run('checkout') },
    { id: 'newBranch', label: fill(t('newBranchFromTarget'), branch), run: () => run('newBranch') },
    { id: 'diffWorktree', label: t('showDiffWorkingTree'), separatorBefore: true, run: () => run('diffWorktree') },
    { id: 'worktree', label: fill(t('newWorktreeFrom'), branch), separatorBefore: true, run: () => run('worktree') },
    { id: 'update', label: t('update'), separatorBefore: true, run: () => run('update') },
    { id: 'push', label: t('pushEllipsis'), shortcut: '⇧⌘K', run: () => run('push') },
    ...trackedBranchItem(t, context, run),
    { id: 'rename', label: t('renameEllipsis'), shortcut: 'F2', separatorBefore: true, run: () => run('rename') },
  ]
}

/**
 * 其他本地分支的菜单。
 *
 * `currentBranch` 会出现在「Rebase 'x' onto 'y'」这类文案里；没有检出分支时用
 * 空串兜底，git 侧仍会以当前 HEAD 执行。
 * @param t 翻译函数
 * @param context 分支上下文
 * @param run 执行动作
 * @returns 菜单项
 */
function localBranchMenu(t: Translate, context: BranchMenuContext, run: BranchActionRunner): MenuItem[] {
  const target = context.target
  const current = context.currentBranch

  return [
    { id: 'checkout', label: t('checkout'), run: () => run('checkout') },
    { id: 'newBranch', label: fill(t('newBranchFromTarget'), { branch: target }), run: () => run('newBranch') },
    {
      id: 'checkoutRebase',
      label: fill(t('checkoutAndRebase'), { current }),
      // 没有检出分支时没有可变基的目标
      disabled: current === '',
      run: () => run('checkoutRebase'),
    },
    {
      id: 'checkoutUpdate',
      label: t('checkoutAndUpdate'),
      disabled: current === '',
      run: () => run('checkoutUpdate'),
    },
    { id: 'diffWorktree', label: t('showDiffWorkingTree'), separatorBefore: true, run: () => run('diffWorktree') },
    {
      id: 'rebase',
      label: fill(t('rebaseOnto'), { current, target }),
      separatorBefore: true,
      disabled: current === '',
      run: () => run('rebase'),
    },
    {
      id: 'merge',
      label: fill(t('mergeInto'), { current, target }),
      disabled: current === '',
      run: () => run('merge'),
    },
    { id: 'worktree', label: fill(t('newWorktreeFrom'), { branch: target }), separatorBefore: true, run: () => run('worktree') },
    { id: 'update', label: t('update'), separatorBefore: true, run: () => run('update') },
    { id: 'push', label: t('pushEllipsis'), shortcut: '⇧⌘K', run: () => run('push') },
    ...trackedBranchItem(t, context, run),
    { id: 'rename', label: t('renameEllipsis'), shortcut: 'F2', separatorBefore: true, run: () => run('rename') },
    { id: 'delete', label: t('deleteBranch'), shortcut: '⌫', run: () => run('delete') },
  ]
}

/**
 * 远程分支的菜单：没有 Rename/Update，多了 Compare 与两种 Pull into。
 * @param t 翻译函数
 * @param context 分支上下文
 * @param run 执行动作
 * @returns 菜单项
 */
function remoteBranchMenu(t: Translate, context: BranchMenuContext, run: BranchActionRunner): MenuItem[] {
  const target = context.target
  const current = context.currentBranch

  return [
    { id: 'checkout', label: t('checkout'), run: () => run('checkout') },
    { id: 'newBranch', label: fill(t('newBranchFromTarget'), { branch: target }), run: () => run('newBranch') },
    {
      id: 'checkoutRebase',
      label: fill(t('checkoutAndRebase'), { current }),
      disabled: current === '',
      run: () => run('checkoutRebase'),
    },
    { id: 'compare', label: fill(t('compareWith'), { current }), separatorBefore: true, disabled: current === '', run: () => run('compare') },
    { id: 'diffWorktree', label: t('showDiffWorkingTree'), run: () => run('diffWorktree') },
    {
      id: 'rebase',
      label: fill(t('rebaseOnto'), { current, target }),
      separatorBefore: true,
      disabled: current === '',
      run: () => run('rebase'),
    },
    {
      id: 'merge',
      label: fill(t('mergeInto'), { current, target }),
      disabled: current === '',
      run: () => run('merge'),
    },
    { id: 'worktree', label: fill(t('newWorktreeFrom'), { branch: target }), separatorBefore: true, run: () => run('worktree') },
    {
      id: 'pullRebase',
      label: fill(t('pullIntoRebase'), { current }),
      separatorBefore: true,
      disabled: current === '',
      run: () => run('pullRebase'),
    },
    {
      id: 'pullMerge',
      label: fill(t('pullIntoMerge'), { current }),
      disabled: current === '',
      run: () => run('pullMerge'),
    },
    { id: 'delete', label: t('deleteBranch'), shortcut: '⌫', separatorBefore: true, run: () => run('delete') },
  ]
}

/**
 * 标签的菜单：标签不能检出后再提交，能做的只有建分支与比较。
 * @param t 翻译函数
 * @param context 分支上下文
 * @param run 执行动作
 * @returns 菜单项
 */
function tagMenu(t: Translate, context: BranchMenuContext, run: BranchActionRunner): MenuItem[] {
  const target = context.target
  const current = context.currentBranch

  return [
    { id: 'checkout', label: t('checkout'), run: () => run('checkout') },
    { id: 'newBranch', label: fill(t('newBranchFromTarget'), { branch: target }), run: () => run('newBranch') },
    { id: 'compare', label: fill(t('compareWith'), { current }), separatorBefore: true, disabled: current === '', run: () => run('compare') },
    { id: 'diffWorktree', label: t('showDiffWorkingTree'), run: () => run('diffWorktree') },
    { id: 'worktree', label: fill(t('newWorktreeFrom'), { branch: target }), separatorBefore: true, run: () => run('worktree') },
  ]
}

/**
 * 「Tracked Branch 'origin/x'」及其子菜单；本地分支没有上游时整项不出现。
 * @param t 翻译函数
 * @param context 分支上下文
 * @param run 执行动作
 * @returns 菜单项数组；没有上游时为空数组
 */
function trackedBranchItem(t: Translate, context: BranchMenuContext, run: BranchActionRunner): MenuItem[] {
  const upstream = context.upstream
  if (upstream === '') return []

  const branch = context.target
  const current = context.currentBranch

  return [
    {
      id: 'tracked',
      label: fill(t('trackedBranch'), { branch: upstream }),
      children: [
        { id: 'trackedCheckout', label: t('checkout'), run: () => run('checkoutTracked') },
        { id: 'trackedCompare', label: fill(t('compareWithLocal'), { branch }), run: () => run('compareTracked') },
        { id: 'trackedDiff', label: t('showDiffWorkingTree'), run: () => run('diffWorktreeTracked') },
        {
          id: 'trackedPullRebase',
          label: fill(t('pullIntoRebase'), { current }),
          separatorBefore: true,
          disabled: current === '',
          run: () => run('pullRebaseTracked'),
        },
        {
          id: 'trackedPullMerge',
          label: fill(t('pullIntoMerge'), { current }),
          disabled: current === '',
          run: () => run('pullMergeTracked'),
        },
        { id: 'trackedPush', label: t('pushEllipsis'), shortcut: '⇧⌘K', separatorBefore: true, run: () => run('push') },
      ],
    },
  ]
}
