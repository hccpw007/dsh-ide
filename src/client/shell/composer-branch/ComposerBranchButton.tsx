/**
 * 聊天输入框工具行里的分支控件。
 *
 * 位置与 IDE 顶部菜单的分支名称一致：分支图标、当前分支名、同步状态箭头（远端有
 * 未合并提交时蓝色下箭头，本地有未推送提交时绿色上箭头）与下拉箭头，排在宿主
 * 「权限」药丸右侧、模型选择器左侧。分支取自当前会话工作目录，未绑定目录或不是
 * Git 仓库时整个控件不出现。
 *
 * 点击弹出与 IDE 相同的分支选择弹窗（复用 git feature 的 BranchPopup）。聊天页
 * 没有工作台，弹窗里依赖工作台的动作（Commit / Push / Update / 设置）改为就地
 * 提示，分支切换与拉取照常可用；失败信息同样用这条提示呈现，不静默吞掉。
 */
import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'

import { cn } from '../../../common/cn'
import { toastIcon } from '../../../common/ToastStack'
import type { Translate } from '../../../types/plugin'
import { readRefs } from '../../features/git/api'
import { BranchPopup, POPUP_HEIGHT, type BranchPopupServices } from '../../features/git/BranchPopup'
import { chevronDownIcon } from '../../features/git/icons-ui'
import { branchIcon, pushIcon, updateIcon } from '../../features/git/icons-vcs'
import type { ToastKind } from '../contract'
import { readSessionCwd, subscribeSessions } from '../session-cwd'

/** 提示停留时长：足够读完分支操作失败的原因，又不长期遮挡输入框。 */
const NOTICE_DURATION_MS = 3000

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
  /** 分支弹窗的位置；null 表示弹窗关闭。 */
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null)
  /** 弹窗高度上限：随按钮位置算出的可用空间变化，空间不足时压缩列表高度。 */
  const [popupHeightLimit, setPopupHeightLimit] = useState(POPUP_HEIGHT)
  /** 就地提示；null 表示当前没有提示。 */
  const [notice, setNotice] = useState<ComposerNotice | null>(null)
  /** 重读计数：切换分支后加一，让读取 effect 重新执行。 */
  const [reloadToken, setReloadToken] = useState(0)

  // 读取当前分支与领先/落后数量：会话目录变化或切换分支后重读，结果回来前保持上一次的值
  useEffect(() => {
    let cancelled = false

    // 会话尚未绑定项目时没有分支可读，直接清空让控件隐藏
    if (cwd === '') {
      setBranch('')
      setAhead(0)
      setBehind(0)

      return () => {
        cancelled = true
      }
    }

    void readRefs(cwd).then((result) => {
      if (cancelled) return

      // 不是 Git 仓库或读取失败时隐藏控件，原始错误留给控制台排查
      if (!result.ok) {
        console.error('[dsh-ide] 读取对话页分支失败:', result.error)
        setBranch('')
        setAhead(0)
        setBehind(0)

        return
      }

      setBranch(result.value.head)

      // 领先/落后只对当前分支有意义：按钮上的同步箭头据此显示
      const head = result.value.local.find((item) => item.isHead)
      setAhead(head?.ahead ?? 0)
      setBehind(head?.behind ?? 0)
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

  /**
   * 供分支弹窗使用的最小工作台能力。
   *
   * 聊天页没有 Git 状态面板与设置页，对应的两个入口改为提示；状态刷新由本控件
   * 在切换成功后自行重读，不需要工作台的总线广播。
   */
  const services = useMemo<BranchPopupServices>(
    () => ({
      root: cwd,
      toast: notify,
      // 聊天页没有工作台的 Git 状态面板可刷新，分支切换后的重读已由本控件负责
      refreshGitStatus: () => undefined,
      openBottomPanel: () => notify('info', t('shell.composerBranchInIde')),
      openPage: () => notify('info', t('shell.composerBranchInIde')),
    }),
    [cwd, notify, t],
  )

  // 读不到分支（未绑定目录、非仓库）时不占工具行位置
  if (branch === '') return null

  /*
   * 包一层工作台根容器：分支弹窗与提示都取 `--ide-*` 配色变量，聊天页没有工作台
   * 就解析不到；这层容器只继承变量与字体，靠样式里的 display: contents 退出布局。
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

          // 输入行贴着页面底部：下方放得下就向下展开，否则向上展开并按可用高度压缩弹窗
          if (spaceBelow >= POPUP_HEIGHT) {
            setPopupHeightLimit(POPUP_HEIGHT)
            setAnchor({ x: rect.left, y: rect.bottom + VIEWPORT_GAP })

            return
          }

          const limit = Math.max(MIN_POPUP_HEIGHT, rect.top - VIEWPORT_GAP * 2)
          // 弹窗实际高度取默认高度与可用空间的较小值，因此按它反推展开位置才贴合按钮
          const height = Math.min(POPUP_HEIGHT, limit)
          setPopupHeightLimit(limit)
          setAnchor({ x: rect.left, y: Math.max(VIEWPORT_GAP, rect.top - height - VIEWPORT_GAP) })
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

      {/* 分支选择弹窗：在按钮一侧展开，切换成功后重读分支名 */}
      {anchor !== null && (
        <BranchPopup
          t={t}
          services={services}
          anchor={anchor}
          heightLimit={popupHeightLimit}
          onClose={() => setAnchor(null)}
          onCheckedOut={() => setReloadToken((value) => value + 1)}
          onRequestUpdate={() => {
            setAnchor(null)
            notify('info', t('shell.composerBranchInIde'))
          }}
        />
      )}

      {/* 就地提示：分支操作失败与依赖工作台的动作都通过它反馈 */}
      {notice !== null && <NoticeBubble notice={notice} />}
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
