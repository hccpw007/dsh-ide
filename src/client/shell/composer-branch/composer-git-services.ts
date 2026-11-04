/**
 * 聊天页分支入口使用的 Git 对话框能力。
 *
 * 聊天页没有工作台：没有编辑器、Git 面板与设置页，因此这里只实现对话框真正用到的
 * 能力——设置（差异字号/行距、更新工程的上次选择）、弹窗几何与分支状态刷新；打开文件、
 * 打开差异、展开面板、三栏合并这些依赖工作台的入口退化成一条就地提示，避免点了没反应。
 */
import { useCallback, useEffect, useMemo, useRef } from 'react'

import { apiGet, apiPost } from '../../../common/api'
import type { DialogFrameStore } from '../../../common/dialog-size'
import type { Translate } from '../../../types/plugin'
import type { GitDialogServices } from '../../features/git/dialog-services'
import type { IdeSettingsView, ToastKind } from '../contract'
import { DEFAULT_SETTINGS } from '../services'

/** 内存版弹窗几何存储：聊天页没有设置页可存，尺寸只在本次挂载期间有效。 */
const VOLATILE_DIALOG_SIZES: DialogFrameStore = {
  read: () => ({}),
  save: () => undefined,
}

/** 构造参数。 */
export interface ComposerGitServicesOptions {
  /** 会话工作目录，作为所有 Git 操作的根。 */
  root: string
  /** 就地提示：聊天页没有工作台的提示层。 */
  notify(kind: ToastKind, message: string): void
  /** 刷新分支按钮上的领先/落后数量。 */
  refreshGitStatus(): void
  /** 外壳翻译函数，用于降级入口的提示文案。 */
  t: Translate
}

/**
 * 组装聊天页可用的 Git 对话框能力。
 * @param options 见 ComposerGitServicesOptions
 * @returns 满足 GitDialogServices 的服务对象；引用稳定，可安全作为依赖
 */
export function useComposerGitServices({
  root,
  notify,
  refreshGitStatus,
  t,
}: ComposerGitServicesOptions): GitDialogServices {
  /** 设置的最新值；宿主接口返回前先用默认值渲染。 */
  const settingsRef = useRef<IdeSettingsView>(DEFAULT_SETTINGS)
  /** 设置订阅者：差异视图与更新对话框靠它感知字号、行距与上次选择的变化。 */
  const listenersRef = useRef(new Set<() => void>())

  // 读一次宿主设置：DiffView 的字号/行距与更新工程的上次选择都来自这里
  useEffect(() => {
    let cancelled = false

    void apiGet<IdeSettingsView>('/settings').then((result) => {
      if (cancelled) return

      // 读不到设置就沿用默认值，对话框本身仍然可用
      if (!result.ok) {
        console.error('[dsh-ide] 聊天页读取设置失败:', result.error)

        return
      }

      settingsRef.current = { ...DEFAULT_SETTINGS, ...result.value }

      for (const listener of listenersRef.current) listener()
    })

    return () => {
      cancelled = true
    }
  }, [])

  const subscribeSettings = useCallback((listener: () => void): (() => void) => {
    const listeners = listenersRef.current
    listeners.add(listener)

    return () => {
      listeners.delete(listener)
    }
  }, [])

  const updateSettings = useCallback((patch: Partial<IdeSettingsView>): void => {
    const next = { ...settingsRef.current, ...patch }
    settingsRef.current = next

    for (const listener of listenersRef.current) listener()

    void apiPost<IdeSettingsView>('/settings', next).then((result) => {
      if (!result.ok) console.error('[dsh-ide] 聊天页保存设置失败:', result.error)
    })
  }, [])

  /** 依赖工作台的入口在聊天页不可用：统一提示，而不是静默失败。 */
  const unavailable = useCallback((): void => {
    notify('info', t('shell.composerBranchInIde'))
  }, [notify, t])

  return useMemo<GitDialogServices>(
    () => ({
      root,
      // 会话目录由宿主注入，聊天页内不会中途换根，空订阅即可
      subscribeRoot: () => () => undefined,
      toast: notify,
      refreshGitStatus,
      // 聊天页没有项目树与文件变更广播，无需通知任何人
      invalidate: () => undefined,
      dialogSizes: VOLATILE_DIALOG_SIZES,
      settings: () => settingsRef.current,
      subscribeSettings,
      updateSettings,
      openFile: unavailable,
      openDiff: unavailable,
      openBottomPanel: unavailable,
      openMerge: unavailable,
    }),
    [notify, refreshGitStatus, root, subscribeSettings, unavailable, updateSettings],
  )
}
