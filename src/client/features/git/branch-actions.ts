/**
 * Log 分支菜单的动作执行。
 *
 * 菜单只产出动作 id，这里把它翻成 git 调用：单步动作直接执行，组合动作
 * （Checkout and Rebase / Checkout and Update / Pull into）按顺序串行，任一步失败
 * 立即停下，避免在半成品状态上继续叠加命令。
 */
import type { ApiResult } from '../../../common/api'
import type { Translate } from '../../../types/plugin'
import type { IdeServices } from '../../shell/contract'

import {
  addWorktree,
  checkout,
  compareRefs,
  compareWorktree,
  createBranch,
  deleteBranch,
  deleteRemoteBranch,
  fetchAll,
  fetchBranch,
  merge,
  push,
  rebase,
  updateBranch,
  type GitCompareFile,
  type GitRefs,
  type GitRunOutput,
} from './api'
import type { BranchKind, BranchMenuContext } from './branch-menus'
import { updateProject } from './update-project'

/** 一次分支动作需要的外部能力。 */
export interface BranchActionDeps {
  /** 已绑定 git 前缀的翻译函数。 */
  t: Translate
  /** 工作台服务总线。 */
  services: IdeServices
  /** 工作区根。 */
  root: string
  /** 分支、远程与标签；用来判断本地是否已有同名分支。 */
  refs: GitRefs | null
  /** 执行写操作并刷新面板；返回是否成功。 */
  run(action: () => Promise<ApiResult<GitRunOutput>>): Promise<boolean>
  /** 重新读取分支与提交列表。 */
  refresh(): Promise<void>
  /** 打开新建分支对话框。 */
  newBranch(start: string): void
  /** 打开重命名分支对话框。 */
  rename(branch: string): void
  /** 打开新建工作树对话框。 */
  worktree(ref: string): void
  /**
   * 打开两个引用之间的差异窗口。
   * @param left 比较基准
   * @param right 被比较的引用
   * @param files 差异文件列表
   */
  compare(left: string, right: string, files: GitCompareFile[]): void
  /**
   * 打开引用与工作区之间的差异窗口。
   * @param ref 被比较的引用
   * @param files 差异文件列表
   */
  diffWorktree(ref: string, files: GitCompareFile[]): void
}

/**
 * 执行一个分支菜单动作。
 * @param id 菜单动作 id
 * @param context 被右键的分支
 * @param deps 外部能力
 */
export async function runBranchAction(
  id: string,
  context: BranchMenuContext,
  deps: BranchActionDeps,
): Promise<void> {
  const { target, kind, current, currentBranch, upstream } = context
  /** 远程分支的短名：`origin/test` → `test`。 */
  const short = kind === 'remote' ? target.slice(target.indexOf('/') + 1) : target

  if (id === 'newBranch') {
    deps.newBranch(target)

    return
  }

  if (id === 'rename') {
    deps.rename(target)

    return
  }

  if (id === 'worktree') {
    deps.worktree(target)

    return
  }

  if (id === 'checkout' || id === 'checkoutTracked') {
    await checkoutTarget(kind, target, deps)

    return
  }

  if (id === 'checkoutRebase') {
    // 先切过去再变基：变基的目标是切走前的分支，与 IDEA 的组合动作一致
    if (await checkoutTarget(kind, target, deps)) await deps.run(() => rebase(deps.root, currentBranch))

    return
  }

  if (id === 'checkoutUpdate') {
    if (!(await checkoutTarget(kind, target, deps))) return

    await updateProject(deps.root, deps.services.settings().updateProjectMode, deps.services, deps.t)
    await deps.refresh()

    return
  }

  if (id === 'update') {
    if (current) await updateProject(deps.root, deps.services.settings().updateProjectMode, deps.services, deps.t)
    else if (upstream === '' || !(await deps.run(() => updateBranch(deps.root, target, upstream)))) {
      // 没有跟踪分支就无从更新，先拦下并给出可读提示，而不是把 git 的 fatal 原文抛给用户
      if (upstream === '') deps.services.toast('error', deps.t('updateProjectNoUpstream'))
    } else deps.services.toast('info', deps.t('updateProjectSuccess'))

    return
  }

  if (id === 'fetch') {
    // 远程分支抓自身，本地分支抓跟踪的上游；没有上游时交由宿主退回抓取全部远端
    const source = kind === 'remote' ? target : upstream
    const slash = source.indexOf('/')
    const remote = slash > 0 ? source.slice(0, slash) : ''
    const branch = slash > 0 ? source.slice(slash + 1) : ''

    if (await deps.run(() => fetchBranch(deps.root, remote, branch))) {
      deps.services.toast('info', deps.t('fetchSuccess'))
    }

    return
  }

  if (id === 'push') {
    if (await deps.run(() => push(deps.root))) deps.services.toast('info', deps.t('pushSuccess'))

    return
  }

  if (id === 'delete') {
    if (kind !== 'remote') {
      await deps.run(() => deleteBranch(deps.root, target))

      return
    }

    const slash = target.indexOf('/')
    const remote = slash < 0 ? 'origin' : target.slice(0, slash)
    await deps.run(() => deleteRemoteBranch(deps.root, remote, short))

    return
  }

  if (id === 'rebase') {
    await deps.run(() => rebase(deps.root, target))

    return
  }

  if (id === 'merge') {
    await deps.run(() => merge(deps.root, target))

    return
  }

  if (id === 'compare' || id === 'compareTracked') {
    const [left, right] = id === 'compare' ? [currentBranch, target] : [target, upstream]
    const result = await compareRefs(deps.root, left, right)

    if (!result.ok) {
      deps.services.toast('error', result.error.message)

      return
    }

    deps.compare(left, right, result.value.files)

    return
  }

  if (id === 'diffWorktree' || id === 'diffWorktreeTracked') {
    const ref = id === 'diffWorktreeTracked' ? upstream : target
    const result = await compareWorktree(deps.root, ref)

    if (!result.ok) {
      deps.services.toast('error', result.error.message)

      return
    }

    deps.diffWorktree(ref, result.value.files)

    return
  }

  // Pull into：先抓远端再合入，否则拉进来的永远是上一次抓到的引用
  if (id === 'pullRebase' || id === 'pullMerge' || id === 'pullRebaseTracked' || id === 'pullMergeTracked') {
    const tracked = id.endsWith('Tracked')
    const ref = tracked ? upstream : target
    const useRebase = id.startsWith('pullRebase')

    if (!(await deps.run(() => fetchAll(deps.root)))) return

    const ok = await deps.run(() => (useRebase ? rebase(deps.root, ref) : merge(deps.root, ref)))
    if (ok) deps.services.toast('info', deps.t('pullSuccess'))
  }
}

/**
 * 检出某个引用；远程分支落成本地分支，否则会停在游离 HEAD 上。
 * @param kind 引用种类
 * @param target 引用短名
 * @param deps 外部能力
 * @returns 是否成功
 */
async function checkoutTarget(kind: BranchKind, target: string, deps: BranchActionDeps): Promise<boolean> {
  // 标签与本地分支直接检出；标签会进入游离 HEAD，这与 IDEA 的行为一致
  if (kind !== 'remote') return deps.run(() => checkout(deps.root, target))

  const short = target.slice(target.indexOf('/') + 1)
  const localExists = (deps.refs?.local ?? []).some((item) => item.name === short)

  return localExists
    ? deps.run(() => checkout(deps.root, short))
    : deps.run(() => createBranch(deps.root, short, target))
}

/**
 * 生成新工作树的默认目录。
 *
 * 与 IDEA 一致放在仓库的兄弟目录，名字是「仓库名-分支短名」；分支名里的斜杠
 * 换成短横线，避免建出多层目录。
 * @param root 工作区根
 * @param ref 要检出的引用
 * @returns 绝对路径
 */
export function defaultWorktreePath(root: string, ref: string): string {
  const separator = root.includes('\\') ? '\\' : '/'
  const cut = root.lastIndexOf(separator)
  const parent = cut <= 0 ? root : root.slice(0, cut)
  const name = cut <= 0 ? root : root.slice(cut + 1)
  const short = ref.slice(ref.indexOf('/') + 1)
  const suffix = short.replace(/[^\w.-]+/g, '-')

  return `${parent}${separator}${name}-${suffix}`
}

/**
 * 在给定目录新建工作树。
 * @param ref 要检出的引用
 * @param path 工作树目录
 * @param deps 外部能力
 */
export async function createWorktree(
  ref: string,
  path: string,
  deps: Pick<BranchActionDeps, 'root' | 'run' | 'services' | 't' | 'refs'>,
): Promise<void> {
  const isRemote = (deps.refs?.remote ?? []).some((item) => item.name === ref)
  const short = isRemote ? ref.slice(ref.indexOf('/') + 1) : ''
  const localExists = short !== '' && (deps.refs?.local ?? []).some((item) => item.name === short)

  // 远程分支在本地还没有同名分支时要新建；已有时直接检出本地分支，否则会与 git 的 -b 冲突
  const ok = await deps.run(() =>
    addWorktree(deps.root, { path, ref, ...(isRemote && !localExists ? { branch: short } : {}) }),
  )

  if (ok) deps.services.toast('info', deps.t('worktreeSuccess').replace('{path}', path))
}
