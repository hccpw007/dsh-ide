/**
 * 顶部工具栏的分支显示与切换。
 *
 * 按钮上同时显示当前分支名与同步状态：蓝色下箭头表示远端有未合并的提交，
 * 绿色上箭头表示本地有未推送的提交。点开是 IDEA 式的分支选择弹窗，
 * 弹窗里的「更新项目」入口交回调给调用方，避免这里重复一套更新流程。
 */
import React, { useCallback, useEffect, useState } from 'react'

import { cn } from '../../../common/cn'
import type { Translate } from '../../../types/plugin'
import { readRefs } from '../../features/git/api'
import { BranchPopup } from '../../features/git/BranchPopup'
import { branchIcon, chevronDownIcon, pushIcon, updateIcon } from '../../features/git/icons'
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
  /** 分支弹窗的位置；null 表示关闭。 */
  const [branchPopup, setBranchPopup] = useState<{ x: number; y: number } | null>(null)

  /** 读取当前分支名与它相对上游的领先/落后数量；不是仓库时留空，工具栏照常显示。 */
  const loadBranch = useCallback(async (): Promise<void> => {
    if (root === '') {
      setBranch('')
      setAhead(0)
      setBehind(0)

      return
    }

    onBusyChange(true)

    try {
      const result = await readRefs(root)
      setBranch(result.ok ? result.value.head : '')

      // 领先/落后只对当前分支有意义：分支弹窗里的两个箭头据此显示
      const head = result.ok ? result.value.local.find((item) => item.isHead) : undefined
      setAhead(head?.ahead ?? 0)
      setBehind(head?.behind ?? 0)
    } finally {
      onBusyChange(false)
    }
  }, [onBusyChange, root])

  useEffect(() => {
    void loadBranch()
  }, [loadBranch])

  // 面板里的写操作（提交、切换分支）后领先/落后会变，跟着重读
  useEffect(() => services.subscribeGitStatus(() => void loadBranch()), [loadBranch, services])

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
        />
      )}
    </>
  )
}
