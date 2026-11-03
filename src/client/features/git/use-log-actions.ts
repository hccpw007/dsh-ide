/**
 * Log 页签的分支与提交动作。
 *
 * 分支右键、提交右键、左侧工具栏与对话框确认最终都落到同一组 git 命令上：
 * 集中在一处，菜单与工具栏才不会各自演化出不同的行为。
 */
import { useCallback, useMemo, useState } from 'react'
import type { MouseEvent } from 'react'

import type { ApiResult } from '../../../common/api'
import type { Translate } from '../../../types/plugin'
import type { IdeServices } from '../../shell/contract'

import {
  checkout,
  cherryPick,
  compareWorktree,
  createBranch,
  dropCommit,
  pushUpToHere,
  renameBranch,
  revertCommit,
  tagCommit,
  type GitCommit,
  type GitCommitDetail,
  type GitRefs,
  type GitRunOutput,
} from './api'
import { createWorktree, defaultWorktreePath, runBranchAction, type BranchActionDeps } from './branch-actions'
import { branchMenuItems, type BranchKind, type BranchMenuContext } from './branch-menus'
import { commitMenuContext, neighbourCommit, writePatch } from './commit-actions'
import { toggleFavorite } from './favorites'
import { commitMenuItems } from './log-menus'
import type { CompareState, PromptState } from './log-state'
import type { MenuState } from './menu'

/** 动作需要的状态与写回函数。 */
export interface LogActionDeps {
  /** 工作区根。 */
  root: string
  /** 工作台服务总线。 */
  services: IdeServices
  /** 已绑定 git 前缀的翻译函数。 */
  t: Translate
  /** 分支、远端与标签。 */
  refs: GitRefs | null
  /** 左侧树选中的引用；空串表示 HEAD 行，null 表示没有选中任何行。 */
  treeSelected: string | null
  /** 收藏的引用短名。 */
  favorites: ReadonlySet<string>
  /** 替换收藏集合。 */
  setFavorites(value: ReadonlySet<string>): void
  /** 过滤后的提交，用于子/父提交导航。 */
  visibleCommits: GitCommit[]
  /** 当前检出提交的短 hash。 */
  headHash: string
  /** 选中提交的详情；编辑提交信息时取正文。 */
  detail: GitCommitDetail | null
  /** 选中某个提交（右键与子/父导航）。 */
  selectCommit(commit: GitCommit): void
  /** 清空过滤并定位到某提交（Show Repository at Revision）。 */
  revealAtCommit(commit: GitCommit): void
  /** 打开输入框对话框。 */
  setPrompt(state: PromptState | null): void
  /** 设置输入框的预填内容。 */
  setPromptValue(value: string): void
  /** 打开重置对话框的目标提交。 */
  setResetTarget(commit: GitCommit | null): void
  /** 打开提交信息编辑对话框的目标提交。 */
  setMessageTarget(commit: GitCommit | null): void
  /** 设置提交信息编辑框的文本。 */
  setMessageValue(value: string): void
  /** 打开分支比较窗口。 */
  setCompare(state: CompareState | null): void
  /** 打开浮层菜单。 */
  setMenu(state: MenuState | null): void
  /** 写入错误文案。 */
  setError(value: string): void
  /** 写操作完成后重新读取分支与提交列表。 */
  refresh(): Promise<void>
}

/** 动作 hook 的返回值。 */
export interface LogActions {
  /** 是否有写操作在进行。 */
  busy: boolean
  /** 执行一次写操作并刷新列表；返回是否成功。 */
  run(action: () => Promise<ApiResult<GitRunOutput>>): Promise<boolean>
  /** 左侧树选中项的分支上下文；null 表示没有选中任何行。 */
  selectionContext: BranchMenuContext | null
  /** 打开新建分支对话框。 */
  openNewBranch(start: string): void
  /** 打开提交右键菜单。 */
  openCommitMenu(event: MouseEvent, commit: GitCommit): void
  /** 打开分支右键菜单。 */
  openBranchMenu(event: MouseEvent, target: string): void
  /** 对左侧树选中的引用执行菜单动作。 */
  runOnSelectedBranch(id: string): void
  /** 切换选中引用的收藏。 */
  toggleSelectedFavorite(): void
}

/**
 * 构建 Log 页签的全部动作。
 * @param deps 状态与写回函数
 * @returns 写操作、菜单与工具栏动作
 */
export function useLogActions(deps: LogActionDeps): LogActions {
  const {
    detail,
    headHash,
    refs,
    refresh,
    revealAtCommit,
    root,
    selectCommit,
    services,
    setCompare,
    setError,
    setFavorites,
    setMenu,
    setMessageTarget,
    setMessageValue,
    setPrompt,
    setPromptValue,
    setResetTarget,
    t,
    treeSelected,
    visibleCommits,
  } = deps

  const [busy, setBusy] = useState(false)

  /**
   * 执行一次写操作并刷新列表；命令与控制台记录由 api 层统一处理。
   * @param action 实际调用
   * @returns 是否成功
   */
  const run = useCallback(
    async (action: () => Promise<ApiResult<GitRunOutput>>): Promise<boolean> => {
      setBusy(true)

      try {
        const result = await action()

        if (!result.ok) {
          setError(result.error.message)

          return false
        }

        setError('')
        await refresh()
        services.refreshGitStatus()
        services.invalidate()

        return true
      } finally {
        setBusy(false)
      }
    },
    [refresh, services, setError],
  )

  /**
   * 打开新建分支对话框。
   * @param start 起点：分支/标签名、提交 hash，或空串表示当前 HEAD
   */
  const openNewBranch = useCallback(
    (start: string): void => {
      const isRemote = (refs?.remote ?? []).some((item) => item.name === start)
      const isRef =
        isRemote ||
        (refs?.local ?? []).some((item) => item.name === start) ||
        (refs?.tags ?? []).some((item) => item.name === start)

      // 从分支/标签新建时预填原名称，基于它改名不用重敲；远程分支只取分支名，
      // 远端前缀不能进新分支名；从提交 hash 新建时没有可沿用的名字，保持为空
      if (start === '') setPromptValue(refs?.head ?? '')
      else if (isRemote) setPromptValue(start.slice(start.indexOf('/') + 1))
      else if (isRef) setPromptValue(start)
      else setPromptValue('')

      setPrompt({
        title: t('newBranchTitle'),
        hint: `${t('newBranchFromHint')} ${start === '' ? 'HEAD' : start}`,
        submit: (name) => {
          if (name.trim() === '') {
            setError(t('branchNameRequired'))

            return
          }

          void run(() => createBranch(root, name, start))
        },
      })
    },
    [refs, root, run, setError, setPrompt, setPromptValue, t],
  )

  /** 打开重命名分支对话框。 */
  const openRename = useCallback(
    (branch: string): void => {
      setPromptValue(branch)
      setPrompt({
        title: t('renameBranchTitle'),
        hint: branch,
        submit: (name) => {
          if (name.trim() === '') {
            setError(t('branchNameRequired'))

            return
          }

          void run(() => renameBranch(root, branch, name))
        },
      })
    },
    [root, run, setError, setPrompt, setPromptValue, t],
  )

  /** 打开新建工作树对话框；目录默认放在仓库的兄弟目录，与 IDEA 一致。 */
  const openWorktree = useCallback(
    (ref: string): void => {
      setPromptValue(defaultWorktreePath(root, ref))
      setPrompt({
        title: t('newWorktreeTitle'),
        hint: `${t('newWorktreeHint')} ${ref}`,
        submit: (path) => {
          if (path.trim() === '') {
            setError(t('worktreePathRequired'))

            return
          }

          void createWorktree(ref, path.trim(), { refs, root, run, services, t })
        },
      })
    },
    [refs, root, run, services, setError, setPrompt, setPromptValue, t],
  )

  /**
   * 由引用短名推出右键菜单需要的上下文。
   * @param target 引用短名；空串代表 HEAD 入口，换算成当前检出分支
   * @returns 上下文；游离 HEAD 上没有可操作的本地分支时返回 null
   */
  const branchContext = useCallback(
    (target: string): BranchMenuContext | null => {
      const currentBranch = (refs?.local ?? []).find((item) => item.isHead)?.name ?? ''
      // HEAD 入口等价于当前检出分支，两者右键弹出的是同一套菜单
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
    },
    [refs],
  )

  /** 左侧树选中项对应的分支上下文；没有选中行时为 null。 */
  const selectionContext = useMemo(
    () => (treeSelected === null ? null : branchContext(treeSelected)),
    [branchContext, treeSelected],
  )

  /** 分支菜单动作需要的能力；动作本身由 branch-actions 按 id 分发。 */
  const branchActionDeps: BranchActionDeps = useMemo(
    () => ({
      t,
      services,
      root,
      refs,
      run,
      refresh,
      newBranch: openNewBranch,
      rename: openRename,
      worktree: openWorktree,
      compare: (left, right, files) => {
        setCompare({
          title: t('compareTitle').replace('{left}', left).replace('{right}', right),
          left,
          right,
          files,
        })
      },
      diffWorktree: (ref, files) => {
        setCompare({ title: t('changesWithWorkingTree').replace('{branch}', ref), left: ref, right: null, files })
      },
    }),
    [openNewBranch, openRename, openWorktree, refs, refresh, root, run, services, setCompare, t],
  )

  /**
   * 打开分支右键菜单。
   * @param event 鼠标事件
   * @param target 引用短名；空串代表 HEAD 入口
   */
  const openBranchMenu = useCallback(
    (event: MouseEvent, target: string): void => {
      const context = branchContext(target)

      // 游离 HEAD 上没有本地分支可操作，右键 HEAD 入口不弹菜单
      if (context === null) return

      const items = branchMenuItems(t, context, (id) => void runBranchAction(id, context, branchActionDeps))

      setMenu({ x: event.clientX, y: event.clientY, items })
    },
    [branchActionDeps, branchContext, setMenu, t],
  )

  /** 复制文本到剪贴板；失败时提示，异常不静默丢弃。 */
  const copyText = useCallback(
    (text: string): void => {
      void navigator.clipboard.writeText(text).then(
        () => services.toast('success', t('copied')),
        (copyError: unknown) => {
          console.error('[dsh-ide] Failed to copy text:', copyError)
          services.toast('error', t('copyFailed'))
        },
      )
    },
    [services, t],
  )

  /** 生成补丁文件并写进工作区根目录，路径提示在右下角。 */
  const savePatch = useCallback(
    async (commit: GitCommit): Promise<void> => {
      const written = await writePatch(root, commit)

      if (!written.ok) {
        setError(written.error.message)

        return
      }

      services.invalidate()
      services.toast('success', t('patchCreated').replace('{path}', written.value.path))
    },
    [root, services, setError, t],
  )

  /** 打开提交信息编辑框；正文随详情一起加载，没读到详情时退回标题。 */
  const openEditMessage = useCallback(
    (commit: GitCommit): void => {
      const body = detail !== null && detail.commit.hash === commit.hash ? (detail.commit.body ?? '') : ''

      setMessageTarget(commit)
      setMessageValue(body === '' ? commit.subject : body)
    },
    [detail, setMessageTarget, setMessageValue],
  )

  /** 打开新建标签对话框；提示里用短 hash，完整 hash 会把说明撑成一行。 */
  const openNewTag = useCallback(
    (commit: GitCommit): void => {
      setPromptValue('')
      setPrompt({
        title: t('newTagTitle'),
        hint: `${t('newTagAtHint')} ${commit.shortHash}`,
        submit: (name) => {
          if (name.trim() === '') {
            setError(t('tagNameRequired'))

            return
          }

          void run(() => tagCommit(root, name, commit.hash))
        },
      })
    },
    [root, run, setError, setPrompt, setPromptValue, t],
  )

  /** 与工作区比较：打开比较窗口，右侧取工作区。 */
  const compareWithLocal = useCallback(
    async (commit: GitCommit): Promise<void> => {
      const result = await compareWorktree(root, commit.hash)

      if (!result.ok) {
        setError(result.error.message)

        return
      }

      setCompare({
        title: t('commitCompareTitle').replace('{hash}', commit.shortHash),
        left: commit.hash,
        right: null,
        files: result.value.files,
      })
    },
    [root, setCompare, setError, t],
  )

  /** 跳到子提交或父提交；目标不在已加载的列表里时提示。 */
  const goToCommit = useCallback(
    (commit: GitCommit, direction: 'child' | 'parent'): void => {
      const target = neighbourCommit(commit, visibleCommits, direction)

      if (target === undefined) {
        services.toast('info', t('commitNotLoaded'))

        return
      }

      selectCommit(target)
    },
    [selectCommit, services, t, visibleCommits],
  )

  /** 执行提交右键菜单项。 */
  const runCommitAction = useCallback(
    (id: string, commit: GitCommit): void => {
      // 置灰项（Undo Commit / Fixup / Squash Into / 交互式变基）不会触发，故无分支
      if (id === 'copyRevision') copyText(commit.hash)
      if (id === 'createPatch') void savePatch(commit)
      if (id === 'cherryPick') void run(() => cherryPick(root, commit.hash))
      if (id === 'checkout') void run(() => checkout(root, commit.hash))
      if (id === 'showRepository') revealAtCommit(commit)
      if (id === 'compareWithLocal') void compareWithLocal(commit)
      if (id === 'reset') setResetTarget(commit)
      if (id === 'revert') void run(() => revertCommit(root, commit.hash))
      if (id === 'editMessage') openEditMessage(commit)
      if (id === 'drop') void run(() => dropCommit(root, commit.hash))
      if (id === 'pushUpToHere') void run(() => pushUpToHere(root, commit.hash))
      if (id === 'newBranch') openNewBranch(commit.hash)
      if (id === 'newTag') openNewTag(commit)
      if (id === 'goChild') goToCommit(commit, 'child')
      if (id === 'goParent') goToCommit(commit, 'parent')
    },
    [
      compareWithLocal,
      copyText,
      goToCommit,
      openEditMessage,
      openNewBranch,
      openNewTag,
      revealAtCommit,
      root,
      run,
      savePatch,
      setResetTarget,
    ],
  )

  /**
   * 打开提交右键菜单。
   * @param event 鼠标事件
   * @param commit 提交
   */
  const openCommitMenu = useCallback(
    (event: MouseEvent, commit: GitCommit): void => {
      event.preventDefault()

      // 与 IDEA 一致：右键某行先把它设为当前选中，右侧详情随之切换
      selectCommit(commit)

      const items = commitMenuItems(t, commitMenuContext(commit, visibleCommits, headHash), (id: string) =>
        runCommitAction(id, commit),
      )

      setMenu({ x: event.clientX, y: event.clientY, items })
    },
    [headHash, runCommitAction, selectCommit, setMenu, t, visibleCommits],
  )

  /** 对左侧树选中的引用执行菜单动作；工具栏与右键菜单走同一条执行路径。 */
  const runOnSelectedBranch = useCallback(
    (id: string): void => {
      if (selectionContext === null) return

      void runBranchAction(id, selectionContext, branchActionDeps)
    },
    [branchActionDeps, selectionContext],
  )

  /** 切换选中引用的收藏；HEAD 行按当前检出分支处理。 */
  const toggleSelectedFavorite = useCallback((): void => {
    if (selectionContext === null) return

    setFavorites(toggleFavorite(root, selectionContext.target))
  }, [root, selectionContext, setFavorites])

  return {
    busy,
    run,
    openNewBranch,
    openCommitMenu,
    openBranchMenu,
    runOnSelectedBranch,
    toggleSelectedFavorite,
    selectionContext,
  }
}
