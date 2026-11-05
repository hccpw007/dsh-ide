/**
 * 顶部工具栏的分支显示与切换。
 *
 * 按钮上同时显示当前分支名与同步状态：蓝色下箭头表示远端有未合并的提交，
 * 绿色上箭头表示本地有未推送的提交。点开是 IDEA 式的分支选择弹窗，
 * 弹窗里的「更新项目」入口交回调给调用方，避免这里重复一套更新流程。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'

import { cn } from '../../../common/cn'
import type { Translate } from '../../../types/plugin'
import { readRefs } from '../../features/git/api'
import { BranchPopup } from '../../features/git/BranchPopup'
import { GitDialogs, type GitDialogKind } from '../../features/git/GitDialogs'
import { chevronDownIcon } from '../../features/git/icons-ui'
import { branchIcon, pushIcon, updateIcon } from '../../features/git/icons-vcs'
import type { WorkbenchServices } from '../services'

/** 分支控件 props。 */
export interface BranchControlProps {
  /** 外壳翻译函数。 */
  t: Translate
  /** 工作台服务总线。 */
  services: WorkbenchServices
  /** 工作区根。 */
  root: string
  /** 加载分支信息期间置为 true，供相邻按钮显示进行中文案。 */
  onBusyChange(busy: boolean): void
  /** 分支弹窗里请求更新项目。 */
  onRequestUpdate(): void
}

/**
 * 渲染当前分支按钮与分支选择弹窗。
 * @param props 见 BranchControlProps
 * @returns 分支格与分支弹窗
 */
export function BranchControl({
  t,
  services,
  root,
  onBusyChange,
  onRequestUpdate,
}: BranchControlProps): React.ReactElement {
  const [branch, setBranch] = useState('')
  /** 本地领先上游的提交数；0 表示没有待推送的提交。 */
  const [ahead, setAhead] = useState(0)
  /** 本地落后上游的提交数；0 表示没有待合并的远端提交。 */
  const [behind, setBehind] = useState(0)
  /** 工作区是否存在待提交的改动（含未跟踪与冲突），为 true 时分支名后加 `*`。 */
  const [pendingCommit, setPendingCommit] = useState(false)
  /** 分支弹窗的位置；null 表示关闭。 */
  const [branchPopup, setBranchPopup] = useState<{ x: number; y: number } | null>(null)
  /** 提交/推送对话框；null 表示都没打开。 */
  const [dialog, setDialog] = useState<GitDialogKind | null>(null)

  /** 读取当前分支名、它相对上游的领先/落后数量与工作区是否有待提交改动；不是仓库时留空，工具栏照常显示。 */
  const loadBranch = useCallback(async (): Promise<void> => {
    if (root === '') {
      setBranch('')
      setAhead(0)
      setBehind(0)
      setPendingCommit(false)

      return
    }

    onBusyChange(true)

    try {
      // 只读 refs：工作区是否有待提交改动直接复用总线已经拉到的 status 映射，
      // 不再额外跑一次 `git status`。旧实现每次保存都触发总线广播 → 这里再起
      // 一个 status 进程，大仓库上打字停顿就明显发热
      const result = await readRefs(root)
      setBranch(result.ok ? result.value.head : '')

      // 领先/落后只对当前分支有意义：分支弹窗里的两个箭头据此显示
      const head = result.ok ? result.value.local.find((item) => item.isHead) : undefined
      setAhead(head?.ahead ?? 0)
      setBehind(head?.behind ?? 0)

      // 读不到 refs 就按无待提交处理，避免 git 服务异常时在分支名后误标 `*`
      setPendingCommit(result.ok && services.gitStatus().size > 0)
    } finally {
      onBusyChange(false)
    }
  }, [onBusyChange, root, services])

  useEffect(() => {
    void loadBranch()
  }, [loadBranch])

  /**
   * 总线广播后的合并窗口。
   *
   * 自动保存、树刷新、Git 操作会在 250ms 内连发多次广播；每次广播都读一遍 refs
   * 会扇出多个 git 子进程。合并到 400ms 内最多一次即可。
   */
  const reloadTimer = useRef<number | null>(null)

  useEffect(() => {
    const schedule = (): void => {
      if (reloadTimer.current !== null) return

      reloadTimer.current = window.setTimeout(() => {
        reloadTimer.current = null
        void loadBranch()
      }, 400)
    }

    const unsubscribe = services.subscribeGitStatus(schedule)

    return () => {
      unsubscribe()

      if (reloadTimer.current !== null) {
        window.clearTimeout(reloadTimer.current)
        reloadTimer.current = null
      }
    }
  }, [loadBranch, services])

  return (
    <>
      {/* 当前分支：点开 IDEA 式的分支选择弹窗 */}
      <button
        type="button"
        title={t('shell.selectBranch')}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          setBranchPopup({ x: rect.left, y: rect.bottom + 4 })
        }}
        className="flex h-6 max-w-64 items-center gap-1.5 rounded px-1.5 text-xs text-primary transition-colors hover:bg-surface2"
      >
        {branchIcon(15, 1.5)}

        <span className="truncate font-medium">{branch === '' ? t('shell.detachedHead') : branch}</span>

        {/* 待提交标记：工作区有未提交的改动时在分支名后紧跟一个 *，与 IDEA 的分支控件一致 */}
        {pendingCommit && (
          // 抵消按钮 gap 后留 3px 间隔；星号比分支名大一号才够醒目，配合下移让它在小写字高里居中
          <span
            className="-ml-[3px] shrink-0 translate-y-[2px] text-[14px] leading-none font-medium"
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

        {chevronDownIcon()}
      </button>

      {/* 分支选择弹窗：定位在分支按钮下方，切换成功后刷新工具栏上的分支名 */}
      {branchPopup !== null && (
        <BranchPopup
          t={t}
          services={services}
          anchor={branchPopup}
          onClose={() => setBranchPopup(null)}
          onCheckedOut={() => void loadBranch()}
          onRequestUpdate={onRequestUpdate}
          onRequestCommit={() => {
            setBranchPopup(null)
            setDialog('commit')
          }}
          onRequestPush={() => {
            setBranchPopup(null)
            setDialog('push')
          }}
        />
      )}

      {/* 提交/推送对话框：分支弹窗里的固定动作直接打开，与工具栏按钮同一套弹窗 */}
      <GitDialogs t={t} services={services} open={dialog} onClose={() => setDialog(null)} />
    </>
  )
}
