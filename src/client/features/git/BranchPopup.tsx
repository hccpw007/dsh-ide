/**
 * 分支选择弹窗。
 *
 * 主工具栏点击当前分支后弹出，结构与 IDEA 的 Branches 弹窗一致：顶部是搜索框与两个
 * 图标按钮，中间是 Update / Commit / Push / New Branch / Checkout Tag 固定动作，下面
 * 按 Local / Favorites / Remote 分组列出分支（与 Log 分支树同一套分组顺序）。单击或右键
 * 分支弹出与 Log 分支树相同的分支菜单（New Branch / Compare / Rebase / Merge / Update /
 * Push / Rename / Delete 等），菜单里的写操作成功后刷新弹窗，检出类动作则关闭弹窗并让
 * 调用方刷新工具栏上的分支名。
 *
 * 文案走 Git 面板的语言包（`git.` 前缀）：产品要求 Git 相关界面固定英文，因此这里
 * 的 key 与截图里的英文界面一一对应。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { cn } from '../../../common/cn'
import type { ApiResult } from '../../../common/api'
import type { DialogFrameStore } from '../../../common/dialog-size'
import type { IdeServices } from '../../shell/contract'
import type { Translate } from '../../../types/plugin'

import { createBranch, fetchAll, readRefs, renameBranch, type GitRefs, type GitRunOutput } from './api'
import {
  createWorktree,
  defaultWorktreePath,
  runBranchAction,
  type BranchActionDeps,
  type BranchActionServices,
} from './branch-actions'
import { branchContextFrom, branchMenuItems } from './branch-menus'
import { BranchDiffDialog } from './BranchDiffDialog'
import { readFavorites } from './favorites'
import { chevronDownIcon, chevronRightIcon, gearIcon, plusIcon, searchIcon, spinnerIcon } from './icons-ui'
import { bookmarkIcon, branchIcon, fetchIcon, nodeLineIcon, pushIcon, starIcon, updateIcon } from './icons-vcs'
import { PromptDialog } from './LogDialogs'
import type { CompareState, PromptState } from './log-state'
import type { MenuState } from './menu'
import { ContextMenu } from './menu'
import { folderIcon } from '../project-tree/icons'

/** 弹窗宽度：紧凑到刚好放下分支名与上游名，与 IDEA 的分支弹窗比例一致；聊天页的入口据此把它收进视口。 */
export const POPUP_WIDTH = 380

/** 弹窗高度：列表行更紧凑后固定高度同步压矮，分支多时在列表内滚动；聊天页的入口据此决定向上展开。 */
export const POPUP_HEIGHT = 520

/** 弹窗贴边时保留的视口边距。 */
const VIEWPORT_MARGIN = 8

/** 分支菜单与弹窗之间的间隙（px），与 IDEA 一样贴在弹窗右侧而不是盖住内容。 */
const MENU_GAP = 4

/** 分支菜单的预估宽度：右侧放不下时改放左侧，避免被视口裁掉。 */
const MENU_WIDTH_ESTIMATE = 268

/**
 * 弹窗内按钮的基础样式。
 *
 * preflight 关闭，插件对 `button` 的透明底与零边框重置又只作用于 `.dsh-ide-root`
 * 内；聊天页的分支入口没有这层容器，不在这里显式清零的话，每个按钮都会顶着浏览器
 * 默认的灰底与立体边框。
 */
const POPUP_BUTTON_BASE = 'border-0 bg-transparent py-0'

/** 一条固定动作。 */
interface ActionItem {
  /** 唯一标识。 */
  id: string
  /** 已翻译文案。 */
  label: string
  /** 左侧图标；缺省时该行只留缩进。 */
  icon?: React.ReactNode
  /** 点击执行。 */
  run(): void
}

/**
 * 分支弹窗依赖的工作台能力。
 *
 * 聊天页的分支入口没有完整工作台（没有 Git 状态面板与设置页），只能提供其中一部分，
 * 因此这里只声明弹窗真正用到的成员；工作台侧传完整服务总线仍然兼容。分支菜单里的
 * 更新需要设置页、对话框需要几何记忆，两处都按可选处理，缺省时退化为内存实现或提示。
 */
export type BranchPopupServices = Pick<
  IdeServices,
  'root' | 'toast' | 'refreshGitStatus' | 'openBottomPanel' | 'openPage'
> &
  Partial<Pick<IdeServices, 'dialogSizes' | 'invalidate' | 'settings'>>

/** 没有工作台几何记忆时的输入框/比较窗口尺寸存取：只在本次弹窗里有效。 */
const VOLATILE_DIALOG_SIZES: DialogFrameStore = {
  read: () => ({}),
  save: () => undefined,
}

/** 分支弹窗 props。 */
export interface BranchPopupProps {
  /** 外壳翻译函数；key 带 `git.` 前缀。 */
  t: Translate
  /** 工作台服务：读取工作区根、弹通知、打开面板与设置。 */
  services: BranchPopupServices
  /** 弹窗左上角的视口坐标。 */
  anchor: { x: number; y: number }
  /**
   * 弹窗高度上限；省略时用默认高度。
   *
   * 聊天页的入口在页面底部，按钮上方可能没有 520px 空间，调用方据此压缩高度，
   * 让弹窗完整落在按钮一侧而不盖住它。工作台顶部工具栏不传，行为不变。
   */
  heightLimit?: number
  /** 关闭弹窗。 */
  onClose(): void
  /** 切换分支成功后的回调，用于刷新工具栏上的分支名。 */
  onCheckedOut(): void
  /** 请求打开 Update Project 对话框；由外壳提供，与顶部更新图标共用同一流程。 */
  onRequestUpdate(): void
}

/**
 * 渲染分支弹窗。
 * @param props 见 BranchPopupProps
 * @returns 搜索框、固定动作与分支树
 */
export function BranchPopup({
  t,
  services,
  anchor,
  heightLimit = POPUP_HEIGHT,
  onClose,
  onCheckedOut,
  onRequestUpdate,
}: BranchPopupProps): React.ReactElement {
  const root = services.root
  const [refs, setRefs] = useState<GitRefs | null>(null)
  /** 收藏的引用短名；与 Log 分支树共用同一份数据，图标规则才能保持一致。 */
  const favorites = useMemo(() => readFavorites(root), [root])
  const [search, setSearch] = useState('')
  /** 已折叠的分组键；首次打开全部展开，与 IDEA 一致。 */
  const [closedGroups, setClosedGroups] = useState<ReadonlySet<string>>(() => new Set())
  /** 是否正在从远程拉取；拉取期间按钮换成转圈图标。 */
  const [fetching, setFetching] = useState(false)
  /** 分支菜单；单击分支行时在点击位置打开，与 Log 分支树的右键菜单一致。 */
  const [menu, setMenu] = useState<MenuState | null>(null)
  /** 输入框状态与当前输入值；New Branch / Rename / New Worktree 共用。 */
  const [prompt, setPrompt] = useState<PromptState | null>(null)
  const [promptValue, setPromptValue] = useState('')
  /** 分支比较窗口；Compare with 与 Show Diff with Working Tree 共用。 */
  const [compare, setCompare] = useState<CompareState | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  /** 弹窗自身，用来把分支菜单放在它的右侧。 */
  const popupRef = useRef<HTMLDivElement | null>(null)

  // 打开即聚焦搜索框：IDEA 的弹窗支持直接输入过滤
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // 每次打开重读分支；弹窗生命周期很短，不值得为期间的仓库变化做实时订阅
  useEffect(() => {
    let cancelled = false

    void readRefs(root).then((result) => {
      if (cancelled) return

      // 读不到分支时动作区仍可用，因此只提示不阻断
      if (!result.ok) {
        console.error('[dsh-ide] 读取分支失败:', result.error)
        services.toast('error', t('git.branchPopupLoadFailed'))

        return
      }

      setRefs(result.value)
    })

    return () => {
      cancelled = true
    }
  }, [root, services, t])

  // Esc 优先关闭浮层：菜单、输入框与比较窗口都关掉后才轮到弹窗本身
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return

      if (menu !== null) {
        setMenu(null)

        return
      }

      if (prompt !== null) {
        setPrompt(null)

        return
      }

      if (compare !== null) {
        setCompare(null)

        return
      }

      onClose()
    }

    window.addEventListener('keydown', handleKeyDown, true)

    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [compare, menu, onClose, prompt])

  /** 重读分支列表；写操作完成后用它刷新弹窗内容。 */
  const reload = useCallback(async (): Promise<void> => {
    const result = await readRefs(root)

    if (result.ok) setRefs(result.value)
  }, [root])

  /** 执行一次写操作并刷新列表；失败时提示 git 的原始错误。 */
  const run = useCallback(
    async (action: () => Promise<ApiResult<GitRunOutput>>): Promise<boolean> => {
      const result = await action()

      if (!result.ok) {
        services.toast('error', result.error.message)

        return false
      }

      await reload()
      services.refreshGitStatus()

      return true
    },
    [reload, services],
  )

  /** 检出（含新建后自动检出）成功：关闭弹窗并让调用方刷新工具栏上的分支名。 */
  const handleBranchSwitched = useCallback((): void => {
    onCheckedOut()
    onClose()
  }, [onCheckedOut, onClose])

  const keyword = search.trim().toLowerCase()

  /**
   * 判断一段文案是否命中搜索。
   * @param text 待匹配的文案
   * @returns 命中时返回 true
   */
  const matches = useCallback(
    (text: string): boolean => keyword === '' || text.toLowerCase().includes(keyword),
    [keyword],
  )

  /**
   * 从远程拉取引用：只更新远程跟踪分支，不改动工作区。
   * 拉取期间弹窗保持打开并显示转圈，结束后复位成原图标。
   */
  const fetchRemote = useCallback((): void => {
    if (fetching) return

    setFetching(true)

    void fetchAll(root)
      .then((result) => {
        // 拉取失败只提示，工作区状态不受影响
        if (!result.ok) {
          console.error('[dsh-ide] 拉取远程引用失败:', result.error)
          services.toast('error', `${t('git.branchPopupFetchFailed')}: ${result.error.message}`)

          return
        }

        services.refreshGitStatus()
        services.toast('info', t('git.fetchSuccess'))
      })
      .finally(() => setFetching(false))
  }, [fetching, root, services, t])

  /** 动作一律先关弹窗再跳到 Git 面板：这些操作都要在面板里继续。 */
  const openGitPanel = useCallback((): void => {
    onClose()
    services.openBottomPanel('git')
  }, [onClose, services])

  /** 远端同步动作：Update / Commit / Push。 */
  const syncActions: ActionItem[] = [
    // 更新工程与顶部图标走同一入口：先关弹窗，再交给外壳打开方式选择对话框
    {
      id: 'update',
      label: t('git.branchPopupUpdate'),
      icon: updateIcon(),
      run: () => {
        onClose()
        onRequestUpdate()
      },
    },
    { id: 'commit', label: t('git.branchPopupCommit'), icon: nodeLineIcon(), run: openGitPanel },
    { id: 'push', label: t('git.branchPopupPush'), icon: pushIcon(), run: openGitPanel },
  ]

  /** 本地分支动作：New Branch / Checkout Tag。 */
  const branchActions: ActionItem[] = [
    { id: 'newBranch', label: t('git.branchPopupNewBranch'), icon: plusIcon(), run: openGitPanel },
    { id: 'checkoutTag', label: t('git.branchPopupCheckoutTag'), run: openGitPanel },
  ]

  /** 两组动作各自按搜索过滤；整组为空时连分隔线一起省掉。 */
  const actionGroups = [syncActions, branchActions]
    .map((group) => group.filter((action) => matches(action.label)))
    .filter((group) => group.length > 0)

  const locals = useMemo(
    () => (refs?.local ?? []).filter((branch) => matches(branch.name)),
    [refs, matches],
  )

  /** 收藏且当前引用列表里存在的项；按名称排序，搜索时同样按关键字收窄。 */
  const favoriteRefs = useMemo(() => {
    if (refs === null) return []

    const seen = new Set<string>()
    const list = [...refs.local, ...refs.remote, ...refs.tags].filter((ref) => {
      if (!favorites.has(ref.name) || seen.has(ref.name)) return false

      seen.add(ref.name)

      return matches(ref.name)
    })

    return list.sort((left, right) => left.name.localeCompare(right.name))
  }, [favorites, matches, refs])

  /** 远程分支按 `origin/` 这样的前缀分组，与 IDEA 的 Remote 层级一致。 */
  const remoteGroups = useMemo(() => {
    const groups = new Map<string, GitRefs['remote']>()

    for (const branch of refs?.remote ?? []) {
      // origin/HEAD 是符号引用：git 把它的短名给成 "origin"，两种形态都要跳过
      if (!branch.name.includes('/') || branch.name.endsWith('/HEAD')) continue

      if (!matches(branch.name)) continue

      const remote = branch.name.slice(0, branch.name.indexOf('/'))
      const bucket = groups.get(remote)

      // 原地 push：整体复制数组在分支多、搜索每次按键重算时是 O(n²)
      if (bucket === undefined) groups.set(remote, [branch])
      else bucket.push(branch)
    }

    return [...groups.entries()]
  }, [refs, matches])

  /**
   * 切换一个分组的展开状态。
   * @param key 分组键
   */
  const toggleGroup = (key: string): void => {
    setClosedGroups((previous) => {
      const next = new Set(previous)

      if (next.has(key)) next.delete(key)
      else next.add(key)

      return next
    })
  }

  /**
   * 判断分组是否展开。
   * @param key 分组键
   * @returns 展开时返回 true
   */
  const isOpen = (key: string): boolean => !closedGroups.has(key)

  /** 分支动作共用的一层能力：服务总线补齐聊天页缺失的成员。 */
  const actionServices = useMemo<BranchActionServices>(
    () => ({
      toast: services.toast,
      refreshGitStatus: services.refreshGitStatus,
      invalidate: services.invalidate ?? (() => undefined),
      settings: services.settings,
    }),
    [services],
  )

  /** 打开新建分支对话框；从分支/标签新建时预填原名称，与 Log 工具栏一致。 */
  const openNewBranch = useCallback(
    (start: string): void => {
      const isRemote = (refs?.remote ?? []).some((item) => item.name === start)
      const isRef =
        isRemote ||
        (refs?.local ?? []).some((item) => item.name === start) ||
        (refs?.tags ?? []).some((item) => item.name === start)

      if (start === '') setPromptValue(refs?.head ?? '')
      else if (isRemote) setPromptValue(start.slice(start.indexOf('/') + 1))
      else if (isRef) setPromptValue(start)
      else setPromptValue('')

      setPrompt({
        title: t('git.newBranchTitle'),
        hint: `${t('git.newBranchFromHint')} ${start === '' ? 'HEAD' : start}`,
        submit: (name) => {
          if (name.trim() === '') {
            services.toast('error', t('git.branchNameRequired'))

            return
          }

          setPrompt(null)
          void run(() => createBranch(root, name, start)).then((ok) => {
            if (ok) handleBranchSwitched()
          })
        },
      })
    },
    [handleBranchSwitched, refs, root, run, services, t],
  )

  /** 打开重命名分支对话框。 */
  const openRename = useCallback(
    (branch: string): void => {
      setPromptValue(branch)
      setPrompt({
        title: t('git.renameBranchTitle'),
        hint: branch,
        submit: (name) => {
          if (name.trim() === '') {
            services.toast('error', t('git.branchNameRequired'))

            return
          }

          setPrompt(null)
          void run(() => renameBranch(root, branch, name))
        },
      })
    },
    [root, run, services, t],
  )

  /** 打开新建工作树对话框；目录默认放在仓库的兄弟目录，与 IDEA 一致。 */
  const openWorktree = useCallback(
    (ref: string): void => {
      setPromptValue(defaultWorktreePath(root, ref))
      setPrompt({
        title: t('git.newWorktreeTitle'),
        hint: `${t('git.newWorktreeHint')} ${ref}`,
        submit: (path) => {
          if (path.trim() === '') {
            services.toast('error', t('git.worktreePathRequired'))

            return
          }

          setPrompt(null)
          void createWorktree(ref, path.trim(), { refs, root, run, services: actionServices, t })
        },
      })
    },
    [actionServices, refs, root, run, services, t],
  )

  /** 分支菜单动作需要的能力；动作本身由 branch-actions 按 id 分发。 */
  const actionDeps: BranchActionDeps = useMemo(
    () => ({
      t,
      services: actionServices,
      root,
      refs,
      run,
      refresh: reload,
      newBranch: openNewBranch,
      rename: openRename,
      worktree: openWorktree,
      compare: (left, right, files) => {
        // 比较窗口的差异视图依赖设置订阅与打开文件能力，聊天页没有这些能力
        if (services.settings === undefined) {
          services.toast('info', t('shell.composerBranchInIde'))

          return
        }

        setCompare({
          title: t('git.compareTitle').replace('{left}', left).replace('{right}', right),
          left,
          right,
          files,
        })
      },
      diffWorktree: (ref, files) => {
        if (services.settings === undefined) {
          services.toast('info', t('shell.composerBranchInIde'))

          return
        }

        setCompare({
          title: t('git.changesWithWorkingTree').replace('{branch}', ref),
          left: ref,
          right: null,
          files,
        })
      },
    }),
    [actionServices, openNewBranch, openRename, openWorktree, refs, reload, root, run, services, t],
  )

  /** 分支菜单文案走 git 语言包：菜单模块按无前缀 key 调用，这里补上命名空间。 */
  const gitT = useCallback<Translate>((key) => t(`git.${key}`), [t])

  /**
   * 单击分支行：在点击位置弹出与 Log 分支树相同的分支菜单。
   * @param event 鼠标事件
   * @param target 引用短名
   */
  const openBranchMenu = useCallback(
    (event: React.MouseEvent, target: string): void => {
      event.preventDefault()
      event.stopPropagation()

      const context = branchContextFrom(refs, target)

      if (context === null) return

      const items = branchMenuItems(gitT, context, (id) => {
        void runBranchAction(id, context, actionDeps).then(() => {
          // 检出类动作会改变当前分支：关掉弹窗并刷新工具栏上的分支名
          if (id === 'checkout' || id === 'checkoutRebase' || id === 'checkoutUpdate') handleBranchSwitched()
        })
      })

      // 菜单贴在弹窗右侧（与 IDEA 一致），右侧空间不足才改放左侧，尽量不盖住弹窗内容
      const popup = popupRef.current?.getBoundingClientRect()
      let x = event.clientX

      if (popup !== undefined) {
        const right = popup.right + MENU_GAP

        x =
          right + MENU_WIDTH_ESTIMATE <= window.innerWidth
            ? right
            : Math.max(VIEWPORT_MARGIN, popup.left - MENU_WIDTH_ESTIMATE - MENU_GAP)
      }

      setMenu({ x, y: event.clientY, items })
    },
    [actionDeps, gitT, handleBranchSwitched, refs],
  )

  // 弹窗按实测尺寸收进视口，避免贴边时被裁掉；调用方给了上限时一并压缩高度
  const width = Math.min(POPUP_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2)
  const height = Math.min(POPUP_HEIGHT, heightLimit, window.innerHeight - VIEWPORT_MARGIN * 2)
  const left = Math.max(VIEWPORT_MARGIN, Math.min(anchor.x, window.innerWidth - width - VIEWPORT_MARGIN))
  const top = Math.max(VIEWPORT_MARGIN, Math.min(anchor.y, window.innerHeight - height - VIEWPORT_MARGIN))

  /** 输入框或比较窗口打开时弹窗退到它们下面，浮层才不会被遮住。 */
  const overlayOpen = prompt !== null || compare !== null

  return (
    <>
      {/* 透明覆盖层：点击弹窗之外关闭 */}
      <div className="fixed inset-0" style={{ zIndex: overlayOpen ? 9993 : 9998 }} onClick={onClose} />

      <div
        ref={popupRef}
        role="dialog"
        aria-label={t('git.title')}
        className="fixed flex flex-col overflow-hidden rounded-[10px] border border-line2 bg-[var(--ide-menu-bg)] shadow-2xl"
        style={{ left, top, width, height, zIndex: overlayOpen ? 9994 : 9999 }}
        // 弹窗内右键保持弹窗打开，不再叠一层工作台兜底菜单
        onContextMenu={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
      >
        {/* 搜索行：输入框与右侧两个图标按钮，与 IDEA 的分支弹窗同排 */}
        <div className="flex shrink-0 items-center gap-1 px-3 pt-3">
          <div className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md border border-[var(--ide-popup-border)] px-2">
            <span className="text-secondary">{searchIcon()}</span>

            <input
              ref={inputRef}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('git.branchPopupSearch')}
              className="min-w-0 flex-1 bg-transparent text-xs text-primary outline-none placeholder:text-secondary"
            />
          </div>

          {/* 从远程拉取引用：拉取期间原地转圈，弹窗不关闭 */}
          <PopupIconButton
            title={fetching ? t('git.branchPopupFetching') : t('git.branchPopupFetch')}
            disabled={fetching}
            onClick={fetchRemote}
          >
            <span className={cn('flex', fetching && 'animate-spin')}>
              {fetching ? spinnerIcon() : fetchIcon()}
            </span>
          </PopupIconButton>

          {/* 打开 Git 设置 */}
          <PopupIconButton
            title={t('git.branchPopupSettings')}
            onClick={() => {
              onClose()
              services.openPage('settings')
            }}
          >
            {gearIcon()}
          </PopupIconButton>
        </div>

        <div className="mx-3 mt-1.5 h-px shrink-0 bg-line1" />

        <div className="min-h-0 flex-1 overflow-auto px-2 py-1">
          {/* 固定动作：两组之间画一条分隔线，与 IDEA 的分组一致 */}
          {actionGroups.map((group, index) => (
            <React.Fragment key={group[0].id}>
              {index > 0 && <Separator />}

              {group.map((action) => (
                <ActionRow
                  key={action.id}
                  icon={action.icon}
                  label={action.label}
                  onClick={action.run}
                />
              ))}
            </React.Fragment>
          ))}

          {(actionGroups.length > 0 || locals.length > 0) && <Separator />}

          {/* 本地分支：图标规则与 Log 分支树一致——当前分支用书签（优先于收藏星）、其余收藏用星、剩下是分支图标 */}
          <GroupRow label={t('git.branchPopupLocal')} open={isOpen('local')} onToggle={() => toggleGroup('local')} />

          {isOpen('local') &&
            locals.map((branch) => {
              const favorite = favorites.has(branch.name)

              return (
                <BranchRow
                  key={`local:${branch.name}`}
                  label={branch.name}
                  icon={branch.isHead ? bookmarkIcon() : favorite ? starIcon() : branchIcon(13)}
                  highlighted={favorite || branch.isHead}
                  upstream={branch.upstream}
                  indent={1}
                  onClick={(event) => openBranchMenu(event, branch.name)}
                />
              )
            })}

          {/* Favorites 分组：与 Log 分支树一致，收藏的引用在这里再列一份，原分组里仍然保留 */}
          {favoriteRefs.length > 0 && (
            <>
              <GroupRow
                label={t('git.favorites')}
                open={isOpen('favorites')}
                onToggle={() => toggleGroup('favorites')}
              />

              {isOpen('favorites') &&
                favoriteRefs.map((ref) => (
                  <BranchRow
                    key={`favorite:${ref.name}`}
                    label={ref.name}
                    // 当前分支优先显示书签，与 Local 分组的图标规则一致；远程引用与标签没有 isHead 字段
                    icon={'isHead' in ref && ref.isHead ? bookmarkIcon() : starIcon()}
                    highlighted
                    indent={1}
                    onClick={(event) => openBranchMenu(event, ref.name)}
                  />
                ))}
            </>
          )}

          {/* 远程分支：按 remote 名再分一层，与 IDEA 的 Remote 树一致 */}
          {remoteGroups.length > 0 && (
            <>
              <GroupRow
                label={t('git.branchPopupRemote')}
                open={isOpen('remote')}
                onToggle={() => toggleGroup('remote')}
              />

              {isOpen('remote') &&
                remoteGroups.map(([remote, branches]) => (
                  <React.Fragment key={`remote:${remote}`}>
                    <GroupRow
                      label={remote}
                      icon={folderIcon(isOpen(`remote:${remote}`))}
                      indent={1}
                      open={isOpen(`remote:${remote}`)}
                      onToggle={() => toggleGroup(`remote:${remote}`)}
                    />

                    {isOpen(`remote:${remote}`) &&
                      branches.map((branch) => {
                        const favorite = favorites.has(branch.name)

                        return (
                          <BranchRow
                            key={`remote:${branch.name}`}
                            label={branch.name.slice(remote.length + 1)}
                            icon={favorite ? starIcon() : branchIcon(13)}
                            highlighted={favorite}
                            indent={2}
                            onClick={(event) => openBranchMenu(event, branch.name)}
                          />
                        )
                      })}
                  </React.Fragment>
                ))}
            </>
          )}
        </div>
      </div>

      {/* 分支菜单：与 Log 分支树共用同一套菜单项，单击分支行在点击位置打开 */}
      {menu !== null && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}

      {prompt !== null && (
        <PromptDialog
          t={t}
          title={prompt.title}
          hint={prompt.hint}
          value={promptValue}
          onChange={setPromptValue}
          dialogSizes={services.dialogSizes ?? VOLATILE_DIALOG_SIZES}
          onCancel={() => setPrompt(null)}
          onConfirm={() => prompt.submit(promptValue)}
        />
      )}

      {compare !== null && (
        <BranchDiffDialog
          t={t}
          services={services as unknown as IdeServices}
          root={root}
          title={compare.title}
          left={compare.left}
          right={compare.right}
          files={compare.files}
          onClose={() => setCompare(null)}
        />
      )}
    </>
  )
}

/** 搜索行右侧的图标按钮。 */
function PopupIconButton({
  title,
  disabled = false,
  onClick,
  children,
}: {
  title: string
  /** 是否禁用；拉取进行中用它挡住重复点击。 */
  disabled?: boolean
  onClick(): void
  children: React.ReactNode
}): React.ReactElement {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        POPUP_BUTTON_BASE,
        'flex h-7 w-7 shrink-0 items-center justify-center rounded text-secondary transition-colors',
        // 拉取进行中保持一块底色，与 IDEA 的「进行中」按钮观感一致
        disabled ? 'cursor-default bg-surface3' : 'hover:bg-surface3 hover:text-primary',
      )}
    >
      {children}
    </button>
  )
}

/** 弹窗里的一条固定动作。 */
function ActionRow({
  icon,
  label,
  onClick,
}: {
  /** 左侧图标；缺省时留出同宽空位，文案与其它行左对齐。 */
  icon?: React.ReactNode
  label: string
  onClick(): void
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        POPUP_BUTTON_BASE,
        'flex h-[22px] w-full items-center gap-2 rounded px-2 text-left text-xs text-primary transition-colors hover:bg-surface3',
      )}
    >
      <span className="flex w-4 shrink-0 items-center justify-center text-secondary">{icon}</span>

      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  )
}

/** 分组标题行：chevron 加分组名，点击折叠。 */
function GroupRow({
  label,
  icon,
  indent = 0,
  open,
  onToggle,
}: {
  label: string
  /** 分组前的图标；Remote 的 remote 名用文件夹。 */
  icon?: React.ReactNode
  /** 缩进层级，每级 16px。 */
  indent?: number
  open: boolean
  onToggle(): void
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        POPUP_BUTTON_BASE,
        'flex h-[22px] w-full items-center gap-2 rounded pr-2 text-left text-xs text-primary transition-colors hover:bg-surface3',
      )}
      // 缩进随层级变化，无法用静态类名表达
      style={{ paddingLeft: 8 + indent * 16 }}
    >
      <span className="flex w-4 shrink-0 items-center justify-center text-secondary">
        {open ? chevronDownIcon() : chevronRightIcon()}
      </span>

      {icon !== undefined && (
        <span className="flex w-4 shrink-0 items-center justify-center text-secondary">{icon}</span>
      )}

      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  )
}

/** 分支行：图标、分支名，行尾是上游分支与箭头。 */
function BranchRow({
  label,
  icon,
  highlighted = false,
  upstream,
  indent = 0,
  onClick,
}: {
  label: string
  icon: React.ReactNode
  /** 图标是否用琥珀色强调；当前分支与收藏分支为真，普通分支为灰。 */
  highlighted?: boolean
  upstream?: string
  /** 缩进层级，每级 16px。 */
  indent?: number
  onClick(event: React.MouseEvent<HTMLButtonElement>): void
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      // 右键弹出同一份菜单：IDEA 的分支弹窗里单击与右键都出菜单
      onContextMenu={(event) => {
        event.preventDefault()
        onClick(event)
      }}
      // 弹窗没有「当前选中」状态：IDEA 的选中蓝在这里只表示鼠标悬停
      className={cn(
        POPUP_BUTTON_BASE,
        'group flex h-[22px] w-full items-center gap-2 rounded pr-2 text-left text-xs text-primary transition-colors hover:bg-treeselected hover:text-white',
      )}
      style={{ paddingLeft: 8 + indent * 16 }}
    >
      <span
        className={cn(
          'flex w-4 shrink-0 items-center justify-center group-hover:text-white',
          highlighted ? 'text-[color:var(--ide-ic-amber)]' : 'text-secondary',
        )}
      >
        {icon}
      </span>

      <span className="min-w-0 flex-1 truncate">{label}</span>

      {upstream !== undefined && upstream !== '' && (
        <span className="shrink-0 text-[11px] text-secondary group-hover:text-white/80">{upstream}</span>
      )}

      <span className="shrink-0 text-secondary group-hover:text-white/80">›</span>
    </button>
  )
}

/** 动作区与分支区之间的分隔线。 */
function Separator(): React.ReactElement {
  return <div className="my-1 h-px bg-line1" />
}
