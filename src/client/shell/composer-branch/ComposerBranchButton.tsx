/**
 * 聊天输入框工具行里的分支控件。
 *
 * 位置与 IDE 顶部菜单的分支名称一致：分支图标、当前分支名、同步状态箭头（远端有
 * 未合并提交时蓝色下箭头，本地有未推送提交时绿色上箭头）与下拉箭头，排在宿主
 * 「权限」药丸右侧、模型选择器左侧。分支取自当前会话工作目录，未绑定目录或不是
 * Git 仓库时整个控件不出现。
 *
 * 点击弹出与 IDE 相同的分支选择弹窗（复用 git feature 的 BranchPopup）。弹窗顶部的
 * Update Project / Commit / Push 直接打开对应对话框，New Branch 与 Checkout Tag 在弹窗
 * 内完成；聊天页没有工作台，对话框里依赖编辑器的入口（查看差异、打开文件、展开 Git
 * 面板、三栏合并）改为就地提示，失败信息同样用这条提示呈现，不静默吞掉。
 *
 * 分支弹窗、Git 对话框与就地提示都是 fixed 定位的全屏浮层：宿主输入卡片的容器会因为
 * `will-change: transform` 成为 fixed 包含块，因此它们统一 portal 到 body 渲染，避免
 * 以输入卡片为参照而错位、并把宿主的会话滚动区撑高。
 */
import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'

import { cn } from '../../../common/cn'
import { ConfirmDialog, type ConfirmRequest } from '../../common/ConfirmDialog'
import { notifyGitActivity, subscribeGitActivity } from '../../../common/git-activity'
import { featureTranslate } from '../../../common/locale'
import { toastIcon } from '../../../common/ToastStack'
import type { Translate } from '../../../types/plugin'
import { ConflictsDialog } from '../../features/conflicts/ConflictsDialog'
import {
  subscribeConflicts,
  takeConflictsRequest,
  type ConflictsRequest,
} from '../../features/conflicts/conflicts-request'
import { readRefs, readStatus } from '../../features/git/api'
import { BranchPopup, POPUP_HEIGHT, type BranchPopupServices } from '../../features/git/BranchPopup'
import { GitDialogs, type GitDialogKind } from '../../features/git/GitDialogs'
import { chevronDownIcon } from '../../features/git/icons-ui'
import { branchIcon, pushIcon, updateIcon } from '../../features/git/icons-vcs'
import { resetToRemoteBranch, updateProject } from '../../features/git/update-project'
import { UpdateProjectDialog } from '../../features/git/UpdateProjectDialog'
import type { ToastKind, UpdateProjectMode } from '../contract'
import { readSessionCwd, subscribeSessions } from '../session-cwd'

import { useComposerGitServices } from './composer-git-services'

/** 提示停留时长：足够读完分支操作失败的原因，又不长期遮挡输入框。 */
const NOTICE_DURATION_MS = 3000

/** 定时重读分支的间隔：覆盖终端里直接跑 git、外部工具切分支这类收不到广播的变化。 */
const REFRESH_INTERVAL_MS = 30_000

/** 广播合并窗口：自动保存也会触发 Git 刷新广播，合并后再跑一次 git，避免频繁重读。 */
const ACTIVITY_MERGE_MS = 600

/** 弹窗与按钮、视口边缘之间保留的间距；与分支弹窗自身的贴边边距一致。 */
const VIEWPORT_GAP = 8

/** 弹窗压缩后的最小高度：再矮就放不下搜索框与分支行，失去切换意义。 */
const MIN_POPUP_HEIGHT = 240

/** 控件 props。 */
export interface ComposerBranchButtonProps {
  /** 外壳翻译函数。 */
  t: Translate
  /** 控件所属会话；空串表示宿主没有按会话注入，读取不到工作目录。 */
  sessionId: string
}

/** 一条就地提示；聊天页没有工作台提示层，失败与降级信息用它呈现。 */
interface ComposerNotice {
  /** 类型，决定图标与配色。 */
  kind: ToastKind
  /** 正文。 */
  message: string
}

/**
 * 渲染分支按钮与分支选择弹窗。
 * @param props 见 ComposerBranchButtonProps
 * @returns 分支按钮、按需弹出的分支弹窗与就地提示
 */
export function ComposerBranchButton({
  t,
  sessionId,
}: ComposerBranchButtonProps): React.ReactElement | null {
  const cwd = useSyncExternalStore(
    subscribeSessions,
    () => readSessionCwd(sessionId),
    () => readSessionCwd(sessionId),
  )
  const [branch, setBranch] = useState('')
  /** 本地领先上游的提交数；0 表示没有待推送的提交。 */
  const [ahead, setAhead] = useState(0)
  /** 本地落后上游的提交数；0 表示没有待合并的远端提交。 */
  const [behind, setBehind] = useState(0)
  /** 工作区是否存在待提交的改动（含未跟踪与冲突），为 true 时分支名后加 `*`。 */
  const [pendingCommit, setPendingCommit] = useState(false)
  /**
   * 分支弹窗的位置；null 表示弹窗关闭。
   *
   * `expand` 决定 `y` 的含义：`down` 是弹窗上边缘，`up` 是下边缘（按钮贴着页面底部
   * 时向上展开，弹窗高度随内容自适应，只有按底边定位才不会与按钮之间留出空隙）。
   */
  const [anchor, setAnchor] = useState<{
    x: number
    y: number
    expand: 'down' | 'up'
  } | null>(null)
  /** 弹窗高度上限：随按钮位置算出的可用空间变化，空间不足时压缩列表高度。 */
  const [popupHeightLimit, setPopupHeightLimit] = useState(POPUP_HEIGHT)
  /** 就地提示；null 表示当前没有提示。 */
  const [notice, setNotice] = useState<ComposerNotice | null>(null)
  /** 重读计数：切换分支后加一，让读取 effect 重新执行。 */
  const [reloadToken, setReloadToken] = useState(0)

  // 读取当前分支、领先/落后数量与工作区是否有待提交改动：会话目录变化或切换分支后重读，结果回来前保持上一次的值
  useEffect(() => {
    let cancelled = false

    // 会话尚未绑定项目时没有分支可读，直接清空让控件隐藏
    if (cwd === '') {
      setBranch('')
      setAhead(0)
      setBehind(0)
      setPendingCommit(false)

      return () => {
        cancelled = true
      }
    }

    // 分支名与工作区状态互不依赖，并行读取省掉一次往返
    void Promise.all([readRefs(cwd), readStatus(cwd)]).then(([result, status]) => {
      if (cancelled) return

      // 不是 Git 仓库或读取失败时隐藏控件，原始错误留给控制台排查
      if (!result.ok) {
        console.error('[dsh-ide] 读取对话页分支失败:', result.error)
        setBranch('')
        setAhead(0)
        setBehind(0)
        setPendingCommit(false)

        return
      }

      setBranch(result.value.head)

      // 领先/落后只对当前分支有意义：按钮上的同步箭头据此显示
      const head = result.value.local.find((item) => item.isHead)
      setAhead(head?.ahead ?? 0)
      setBehind(head?.behind ?? 0)

      // 读不到状态就按无待提交处理，避免 git 服务异常时在分支名后误标 `*`
      if (status.ok) {
        const { staged, unstaged, untracked, conflicted } = status.value
        setPendingCommit(staged.length + unstaged.length + untracked.length + conflicted.length > 0)
      } else { // 状态读取失败：降级为不标记，原始错误进控制台
        console.error('[dsh-ide] 读取对话页工作区状态失败:', status.error)
        setPendingCommit(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [cwd, reloadToken])

  // 提示到点自动收回，避免一直压住输入区
  useEffect(() => {
    if (notice === null) return undefined

    const timer = window.setTimeout(() => setNotice(null), NOTICE_DURATION_MS)

    return () => window.clearTimeout(timer)
  }, [notice])

  /** 弹一条就地提示；重复触发会重新计时。 */
  const notify = useCallback((kind: ToastKind, message: string): void => {
    setNotice({ kind, message })
  }, [])

  /** 刷新分支按钮上的领先/落后数量；写操作成功后调用。 */
  const refreshBranch = useCallback((): void => {
    setReloadToken((value) => value + 1)
  }, [])

  // 工作台或聊天页对话框的 Git 写操作都会广播：收到后重读分支名与领先/落后。
  // 自动保存同样会触发刷新广播，因此把合并窗口内的多次通知收成一次，避免频繁跑 git
  useEffect(() => {
    let timer: number | null = null

    const schedule = (): void => {
      if (timer !== null) return

      timer = window.setTimeout(() => {
        timer = null
        refreshBranch()
      }, ACTIVITY_MERGE_MS)
    }

    const unsubscribe = subscribeGitActivity(schedule)

    return () => {
      unsubscribe()

      if (timer !== null) window.clearTimeout(timer)
    }
  }, [refreshBranch])

  // 兜底：切回前台与低频轮询时重读，覆盖终端里直接跑 git 这类发不出广播的变化
  useEffect(() => {
    const refreshWhenVisible = (): void => {
      if (document.visibilityState === 'visible') refreshBranch()
    }

    const timer = window.setInterval(refreshWhenVisible, REFRESH_INTERVAL_MS)

    window.addEventListener('focus', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)

    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshWhenVisible)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [refreshBranch])

  /**
   * 供分支弹窗使用的最小工作台能力。
   *
   * 聊天页没有 Git 状态面板与设置页，对应的两个入口改为提示；状态刷新由本控件
   * 在写操作成功后自行重读，不需要工作台的总线广播。
   */
  const services = useMemo<BranchPopupServices>(
    () => ({
      root: cwd,
      toast: notify,
      // 弹窗里的写操作（新建分支、检出、重命名）广播出去，按钮与本控件一起重读
      refreshGitStatus: notifyGitActivity,
      openPage: () => notify('info', t('shell.composerBranchInIde')),
    }),
    [cwd, notify, refreshBranch, t],
  )

  /** Git 对话框能力：设置、弹窗几何与状态刷新用真实实现，编辑器相关入口退化为提示。 */
  const gitServices = useComposerGitServices({
    root: cwd,
    notify,
    refreshGitStatus: notifyGitActivity,
    t,
  })

  /** 当前打开的 Git 对话框；null 表示都没打开。 */
  const [dialog, setDialog] = useState<GitDialogKind | null>(null)
  /** 更新工程对话框是否打开。 */
  const [updateOpen, setUpdateOpen] = useState(false)
  /** 更新对话框里选中的方式；与工作台一样，切换即写入设置。 */
  const [updateMode, setUpdateMode] = useState<UpdateProjectMode>('merge')
  /** 二次确认框请求；重置到远端分支这类不可撤销的动作先过它。 */
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null)
  /** 冲突窗口请求：更新工程或推送被拒后由写操作流程写入。 */
  const [conflictsRequest, setConflictsRequest] = useState<ConflictsRequest | null>(null)

  /** 设置订阅；包一层稳定引用，避免 useSyncExternalStore 每次渲染都换订阅函数。 */
  const subscribeSettings = useCallback(
    (listener: () => void) => gitServices.subscribeSettings(listener),
    [gitServices],
  )

  /**
   * IDE 配色偏好。
   *
   * 聊天页没有工作台根节点，浮层不会自动带上 `data-ide-theme`；不挂这个属性时配色会
   * 一直跟随宿主，用户在 IDE 里选了深色而宿主是浅色，弹窗就会与 IDE 不一致。
   */
  const ideTheme = useSyncExternalStore(
    subscribeSettings,
    () => gitServices.settings().theme,
    () => gitServices.settings().theme,
  )

  /** 宿主的实际深浅；「跟随宿主」时要据此决定浮层用哪套明暗取值。 */
  const [hostDark, setHostDark] = useState(() => document.body.hasAttribute('data-ds-dark-theme'))

  useEffect(() => {
    const observer = new MutationObserver(() => setHostDark(document.body.hasAttribute('data-ds-dark-theme')))

    observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })

    return () => observer.disconnect()
  }, [])

  /**
   * 浮层实际的明暗。
   *
   * 不能只看 `data-ide-theme`：`--ide-menu-bg` 这类 IDEA 实测色只在
   * `data-ide-scheme='dark'` 下定义，缺了它弹窗会退回宿主偏亮的浮层令牌，
   * 深色主题下变成一块灰蓝底，与工作台里的菜单对不上。
   */
  const scheme = ideTheme === 'system' ? (hostDark ? 'dark' : 'light') : ideTheme

  // 冲突窗口：先取一次挂载前留下的待办，再订阅后续请求；聊天页没有工作台的 GitActions 来消费它
  useEffect(() => {
    const pending = takeConflictsRequest()
    if (pending !== null) setConflictsRequest(pending)

    return subscribeConflicts(setConflictsRequest)
  }, [])

  /** 更新、确认与冲突窗是否打开；打开期间要拦下宿主的 Esc，避免被当成「中断生成」。 */
  const modalOpen = updateOpen || confirm !== null || conflictsRequest !== null

  // Esc 在捕获阶段拦停：对话框自身先处理关闭，事件不再传到宿主的全局快捷键
  useEffect(() => {
    if (!modalOpen) return undefined

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') event.stopPropagation()
    }

    window.addEventListener('keydown', handleKeyDown, true)

    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [modalOpen])

  /** 打开更新工程：勾过 Don't show again 就直接更新，否则先弹出方式选择。 */
  const openUpdateProject = useCallback((): void => {
    const settings = gitServices.settings()

    if (settings.updateProjectSkipDialog) {
      void updateProject(cwd, settings.updateProjectMode, gitServices, t)

      return
    }

    setUpdateMode(settings.updateProjectMode)
    setUpdateOpen(true)
  }, [cwd, gitServices, t])

  /** 切换更新方式：立刻写入设置，下次打开沿用。 */
  const persistUpdateMode = useCallback(
    (mode: UpdateProjectMode): void => {
      setUpdateMode(mode)
      gitServices.updateSettings({ updateProjectMode: mode })
    },
    [gitServices],
  )

  /** 更新对话框点 OK：按所选方式更新工作区。 */
  const applyUpdate = useCallback(
    (mode: UpdateProjectMode, remember: boolean): void => {
      setUpdateOpen(false)

      // 方式在单选框切换时就已保存，这里只补记「下次跳过对话框」
      if (remember) gitServices.updateSettings({ updateProjectSkipDialog: true })

      void updateProject(cwd, mode, gitServices, t)
    },
    [cwd, gitServices, t],
  )

  /** 重置到远端分支：会丢弃本地未推送的提交，先二次确认。 */
  const resetProjectToRemote = useCallback((): void => {
    setUpdateOpen(false)
    setConfirm({
      title: t('git.updateProjectResetTitle'),
      message: t('git.updateProjectResetConfirm'),
      confirmLabel: t('git.updateProjectResetRemote'),
      cancelLabel: t('shell.cancel'),
      danger: true,
      run: () => void resetToRemoteBranch(cwd, gitServices, t),
    })
  }, [cwd, gitServices, t])

  /** 冲突窗口文案走 conflicts 命名空间。 */
  const conflictsTranslate = useMemo(() => featureTranslate(t, 'conflicts'), [t])

  // 读不到分支（未绑定目录、非仓库）时不占工具行位置
  if (branch === '') return null

  /*
   * 按钮包一层工作台根容器：图标与分支名用到 `--ide-*` 配色，聊天页没有工作台就
   * 解析不到；这层容器只继承变量与字体，靠样式里的 display: contents 退出布局。
   * 浮层不在这层里，统一 portal 到 body，原因见下方 createPortal 处的注释。
   */
  return (
    <div className="dsh-ide-root dsh-ide-inline-scope">
      {/* 当前分支：点开与 IDE 相同的分支选择弹窗 */}
      <button
        type="button"
        title={t('shell.selectBranch')}
        aria-haspopup="dialog"
        aria-expanded={anchor !== null}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_GAP * 2

          // IDE 设置页可能刚改过配色与对话框选项：先刷新一次，弹窗首帧就是最新设置
          gitServices.refreshSettings()

          // 输入行贴着页面底部：下方放得下就向下展开，否则向上展开并按可用高度压缩弹窗
          if (spaceBelow >= POPUP_HEIGHT) {
            setPopupHeightLimit(POPUP_HEIGHT)
            setAnchor({ x: rect.left, y: rect.bottom + VIEWPORT_GAP, expand: 'down' })

            return
          }

          // 向上展开：弹窗高度随内容自适应，按底边定位才能让内容少时也贴着按钮
          setPopupHeightLimit(Math.max(MIN_POPUP_HEIGHT, rect.top - VIEWPORT_GAP * 2))
          setAnchor({ x: rect.left, y: rect.top - VIEWPORT_GAP, expand: 'up' })
        }}
        className={cn(
          /*
           * 尺寸对齐宿主输入行的权限药丸：28px 高、13px 字、常规圆角，悬停才浮出
           * 宿主的中性底色。preflight 关闭，按钮的默认灰底与立体边框必须显式清零，
           * 否则会比旁边的药丸厚重一截。
           */
          'flex h-7 max-w-[200px] shrink-0 items-center gap-1.5 rounded-md border-0 px-2 py-0 text-[13px] font-medium leading-5 transition-colors',
          // 弹窗打开时保持展开态，让用户一眼看出弹窗来自这里；否则透明底、悬停浮出中性底色
          anchor !== null
            ? 'bg-activebg text-primary'
            : 'bg-transparent text-secondary hover:bg-hoverbg hover:text-primary',
        )}
      >
        {branchIcon(14, 1.4)}

        <span className="truncate">{branch}</span>

        {/* 待提交标记：工作区有未提交的改动时在分支名后加 *，与工作台工具栏同一套样式 */}
        {pendingCommit && (
          // 抵消按钮 gap 后留 3px 间隔；星号比分支名大一号才够醒目，配合下移让它在小写字高里居中
          <span
            className="-ml-[3px] shrink-0 translate-y-[2px] text-[15px] leading-none"
            title={t('shell.branchPendingCommit')}
          >
            *
          </span>
        )}

        {/* 同步状态：蓝色斜向下箭头 = 远端有未合并的提交，绿色斜向上箭头 = 本地有未推送的提交 */}
        {(behind > 0 || ahead > 0) && (
          <span className="flex shrink-0 items-center">
            {behind > 0 && (
              <span
                title={t('git.commitsToPull').replace('{count}', String(behind))}
                className="flex items-center text-[color:var(--ide-ic-blue)]"
              >
                {updateIcon(12, 1.5)}
              </span>
            )}

            {/* 图标自带左右留白，两个箭头相邻时用负边距抵消，视觉上才真正挨在一起 */}
            {ahead > 0 && (
              <span
                title={t('git.commitsToPush').replace('{count}', String(ahead))}
                className={cn(
                  'flex items-center text-[color:var(--ide-vcs-added)]',
                  behind > 0 ? '-ml-[1px]' : undefined,
                )}
              >
                {pushIcon(12, 1.5)}
              </span>
            )}
          </span>
        )}

        {chevronDownIcon(14)}
      </button>

      {/*
       * 浮层统一经 portal 挂到 body。
       *
       * 宿主的输入卡片容器带 `will-change: transform`（sticky 定位的性能优化），会把
       * 自己变成 fixed 元素的包含块：浮层留在原地时会以输入卡片而不是视口为参照——遮罩
       * 只盖住卡片、弹窗按卡片坐标错位，超出卡片的部分还会撑大宿主的会话滚动区，页面
       * 下方因此留出一大片空白。挂到 body 后浮层重新相对视口定位，也不参与宿主的滚动计算。
       *
       * 容器仍要带 `dsh-ide-root`：`--ide-*` 配色与按钮重置只定义在这个类上，
       * `dsh-ide-inline-scope` 让容器以 display: contents 退出布局。`data-ide-theme`
       * 与 `data-ide-scheme` 分别决定配色偏好与明暗，缺一个都会退回宿主的偏亮取值。
       */}
      {createPortal(
        <div
          className="dsh-ide-root dsh-ide-inline-scope"
          data-ide-theme={ideTheme === 'system' ? undefined : ideTheme}
          data-ide-scheme={scheme}
        >
          {/* 分支选择弹窗：在按钮一侧展开，切换成功后重读分支名 */}
          {anchor !== null && (
            <BranchPopup
              t={t}
              services={services}
              anchor={anchor}
              expand={anchor.expand}
              heightLimit={popupHeightLimit}
              onClose={() => setAnchor(null)}
              onCheckedOut={refreshBranch}
              onRequestUpdate={() => {
                setAnchor(null)
                openUpdateProject()
              }}
              onRequestCommit={() => {
                setAnchor(null)
                setDialog('commit')
              }}
              onRequestPush={() => {
                setAnchor(null)
                setDialog('push')
              }}
            />
          )}

          {/* 提交/推送对话框：遮罩铺满整页；Esc 在这里拦下，避免宿主把它当成「中断生成」 */}
          {dialog !== null && (
            <div
              className="fixed inset-0 z-[9995]"
              onKeyDownCapture={(event) => {
                if (event.key === 'Escape') event.stopPropagation()
              }}
            >
              <GitDialogs t={t} services={gitServices} open={dialog} onClose={() => setDialog(null)} />
            </div>
          )}

          {/* 更新工程对话框：选择合并或变基，或把当前分支重置到远端分支 */}
          {updateOpen && (
            <UpdateProjectDialog
              t={t}
              mode={updateMode}
              onModeChange={persistUpdateMode}
              onCancel={() => setUpdateOpen(false)}
              onApply={applyUpdate}
              onResetToRemote={resetProjectToRemote}
              dialogSizes={gitServices.dialogSizes}
            />
          )}

          {/* 重置到远端分支的二次确认：会丢弃本地未推送的提交 */}
          {confirm !== null && (
            <ConfirmDialog
              request={confirm}
              onClose={() => setConfirm(null)}
              dialogSizes={gitServices.dialogSizes}
            />
          )}

          {/* 冲突解决窗：更新工程或推送被拒后由写操作流程请求 */}
          {conflictsRequest !== null && (
            <ConflictsDialog
              t={conflictsTranslate}
              services={gitServices}
              root={cwd}
              onClose={() => setConflictsRequest(null)}
              onFinished={conflictsRequest.onFinished}
            />
          )}

          {/* 就地提示：分支操作失败与依赖工作台的动作都通过它反馈 */}
          {notice !== null && <NoticeBubble notice={notice} />}
        </div>,
        document.body,
      )}
    </div>
  )
}

/**
 * 右下角的单条提示。
 * @param props 提示内容
 * @returns 固定定位的提示条；层级高于分支弹窗，避免被遮罩挡住
 */
function NoticeBubble({ notice }: { notice: ComposerNotice }): React.ReactElement {
  return (
    <div
      role="status"
      className="pointer-events-none fixed bottom-10 right-10 z-[10001] flex max-w-[360px] items-center gap-3 rounded-lg bg-[var(--ide-toast-bg)] px-4 py-3 shadow-2xl"
    >
      {toastIcon(notice.kind)}

      <span className="min-w-0 text-[13px] leading-5 text-primary">{notice.message}</span>
    </div>
  )
}
