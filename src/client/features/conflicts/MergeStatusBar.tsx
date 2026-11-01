/**
 * 合并状态条。
 *
 * 仓库停在合并 / 变基 / cherry-pick 的中间状态时，顶部主工具栏的分支名后面一直显示
 * 这段状态：警告图标 + 当前操作与分支名 + 绿色 Accept（完成合并）+ 红色 Abort（中止）。
 * 与截图一致：合并是一段有始有终的过程，主工具栏上随时能看出正处于哪种操作、怎么收尾。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

import { cn } from '../../../common/cn'
import { featureTranslate } from '../../../common/locale'
import type { Translate } from '../../../types/plugin'
import { ConfirmDialog, type ConfirmRequest } from '../../common/ConfirmDialog'
import type { IdeServices } from '../../shell/contract'

import { abortOperation, continueOperation, readConflictInfo, type GitConflictInfo } from '../git/api'
import { closeIcon } from '../git/icons-ui'

import { requestConflicts } from './conflicts-request'
import { acceptAllIcon, warningIcon } from './icons'

/** 状态条 props。 */
export interface MergeStatusBarProps {
  /** 外壳根翻译函数；组件内部绑定 conflicts 前缀。 */
  t: Translate
  /** 工作台服务总线。 */
  services: IdeServices
}

/**
 * 渲染合并状态条。
 * @param props 见 MergeStatusBarProps
 * @returns 进行中的合并状态；没有进行中的操作时不渲染任何内容
 */
export function MergeStatusBar({ t, services }: MergeStatusBarProps): React.ReactElement | null {
  const tr = useMemo(() => featureTranslate(t, 'conflicts'), [t])
  const [info, setInfo] = useState<GitConflictInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null)
  /** 读取中的标记：Git 状态刷新可能密集触发，避免同时发多条同样的请求。 */
  const inFlight = useRef(false)

  // 工作区根由宿主提供，切换会话时状态条要跟着重新判断
  const root = useSyncExternalStore(
    (listener) => services.subscribeRoot(listener),
    () => services.root,
    () => services.root,
  )

  /** 读取冲突上下文；没有进行中的操作时清空状态条。 */
  const reload = useCallback(async (): Promise<void> => {
    if (root === '' || inFlight.current) {
      if (root === '') setInfo(null)

      return
    }

    inFlight.current = true

    try {
      const result = await readConflictInfo(root)

      // 不是仓库属于正常状态：状态条直接隐藏，不弹提示
      setInfo(!result.ok || result.value.operation === 'none' ? null : result.value)
    } catch (error) { // 网络层异常不影响编辑器使用，留痕后隐藏状态条
      console.error('[dsh-ide] 读取合并状态失败:', error)
      setInfo(null)
    } finally {
      inFlight.current = false
    }
  }, [root])

  useEffect(() => {
    void reload()
  }, [reload])

  // Git 状态与文件变更都可能代表合并结束（完成、中止、在终端里收尾），两者都触发重读
  useEffect(() => {
    const offStatus = services.subscribeGitStatus(() => void reload())
    const offInvalidate = services.subscribeInvalidate(() => void reload())

    return () => {
      offStatus()
      offInvalidate()
    }
  }, [reload, services])

  /**
   * 接受并完成这次合并。
   *
   * 仍有冲突文件时 `git commit` 会被拒绝，因此先把冲突窗口交给用户：与 IDEA 一样，
   * 这个按钮在任何时刻都可以点，没解决完只是转到解决流程，而不是变灰让人猜原因。
   */
  const accept = useCallback((): void => {
    if (busy || root === '') return

    if (info !== null && info.files.length > 0) {
      requestConflicts({ flow: 'update' })

      return
    }

    setBusy(true)

    void (async (): Promise<void> => {
      try {
        const result = await continueOperation(root)

        if (!result.ok) {
          console.error('[dsh-ide] 完成合并失败:', result.error)
          services.toast('error', `${tr('finishFailed')}: ${result.error.message}`)

          return
        }

        services.toast('success', tr('finishSucceeded'))
        services.refreshGitStatus()
        services.invalidate()
        await reload()
      } catch (error) { // 网络层异常不会带 ApiResult，留痕后让用户重试
        console.error('[dsh-ide] 完成合并失败:', error)
        services.toast('error', String(error))
      } finally {
        setBusy(false)
      }
    })()
  }, [busy, info, reload, root, services, tr])

  /**
   * 中止这次合并。
   *
   * 中止会把工作区恢复到操作开始前，已做的冲突解决不会保留，因此先二次确认。
   */
  const abort = useCallback((): void => {
    setConfirm({
      // 确认框标题：中止合并
      title: tr('abortTitle'),
      message: tr('abortConfirm'),
      // 确认按钮：执行中止
      confirmLabel: tr('abortAction'),
      // 取消按钮：保留当前合并状态
      cancelLabel: tr('cancelAbort'),
      danger: true,
      run: () => {
        void (async (): Promise<void> => {
          setBusy(true)

          try {
            const result = await abortOperation(root)

            if (!result.ok) {
              console.error('[dsh-ide] 中止合并失败:', result.error)
              services.toast('error', `${tr('abortFailed')}: ${result.error.message}`)

              return
            }

            services.toast('info', tr('aborted'))
            services.refreshGitStatus()
            services.invalidate()
            await reload()
          } catch (error) { // 网络层异常不会带 ApiResult，留痕后让用户重试
            console.error('[dsh-ide] 中止合并失败:', error)
            services.toast('error', String(error))
          } finally {
            setBusy(false)
          }
        })()
      },
    })
  }, [reload, root, services, tr])

  if (info === null) return null

  // 操作名称：合并 / 变基 / cherry-pick 各自一句，后面接当前分支名
  const label =
    info.operation === 'rebase'
      ? tr('rebaseLabel').replace('{branch}', info.ours)
      : info.operation === 'cherry-pick'
        ? tr('cherryPickLabel').replace('{branch}', info.ours)
        : tr('mergeLabel').replace('{branch}', info.ours)

  return (
    <>
      <div className="ml-1 flex shrink-0 items-center gap-1.5">
        {/* 警告三角：当前仓库处于未完成的合并状态 */}
        <span className="text-warn">{warningIcon()}</span>

        {/* 操作与分支名 */}
        <span className="whitespace-nowrap text-[12px] text-primary">{label}</span>

        {/* 接受并完成这次合并 */}
        <button
          type="button"
          title={tr('acceptMerge')}
          aria-label={tr('acceptMerge')}
          disabled={busy}
          onClick={accept}
          className={cn(
            'flex h-6 w-7 items-center justify-center rounded-[4px] bg-success text-[color:var(--dsw-static-neutral-bluish-00)] hover:bg-success/90',
            busy && 'cursor-default opacity-50',
          )}
        >
          {acceptAllIcon(13)}
        </button>

        {/* 中止合并：恢复到操作开始前 */}
        <button
          type="button"
          title={tr('abortMerge')}
          aria-label={tr('abortMerge')}
          disabled={busy}
          onClick={abort}
          className={cn(
            'flex h-6 w-7 items-center justify-center rounded-[4px] bg-danger text-[color:var(--dsw-static-neutral-bluish-00)] hover:bg-danger/90',
            busy && 'cursor-default opacity-50',
          )}
        >
          {closeIcon(13)}
        </button>
      </div>

      {confirm !== null && (
        <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} dialogSizes={services.dialogSizes} />
      )}
    </>
  )
}
