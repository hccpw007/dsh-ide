/**
 * 聊天页分支入口使用的 Git 对话框能力。
 *
 * 聊天页没有工作台：没有编辑器、Git 面板与设置页，因此这里只实现对话框真正用到的
 * 能力——设置（差异字号/行距、更新工程的上次选择、弹窗几何）与分支状态刷新；打开文件、
 * 打开差异、展开面板、三栏合并这些依赖工作台的入口退化成一条就地提示，避免点了没反应。
 * 设置同样落在宿主的 `settings.json` 上，与工作台共用一份文档，聊天页里拖过的弹窗位置
 * 与尺寸因此也能跨会话沿用。
 */
import { useCallback, useEffect, useMemo, useRef } from 'react'

import { apiGet, apiPost } from '../../../common/api'
import type { DialogFrameStore } from '../../../common/dialog-size'
import type { Translate } from '../../../types/plugin'
import type { GitDialogServices } from '../../features/git/dialog-services'
import type { IdeSettingsView, ToastKind } from '../contract'
import { DEFAULT_SETTINGS, readCachedTheme } from '../services'

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
 * @returns 满足 GitDialogServices 的服务对象，外加打开弹窗前刷新设置的入口；引用稳定，可安全作为依赖
 */
export function useComposerGitServices({
  root,
  notify,
  refreshGitStatus,
  t,
}: ComposerGitServicesOptions): GitDialogServices & { refreshSettings(): void } {
  /**
   * 设置的最新值；宿主接口返回前先用缓存里的配色与默认值渲染。
   *
   * 配色取自工作台写下的本地缓存：用户设的是强制深色而宿主是浅色时，首帧就能按
   * 深色渲染浮层，不会先闪一下浅色。
   */
  const settingsRef = useRef<IdeSettingsView>({
    ...DEFAULT_SETTINGS,
    theme: readCachedTheme() ?? DEFAULT_SETTINGS.theme,
  })
  /** 设置订阅者：差异视图与更新对话框靠它感知字号、行距与上次选择的变化。 */
  const listenersRef = useRef(new Set<() => void>())

  /**
   * 读一次宿主设置：DiffView 的字号/行距、更新工程的上次选择与浮层配色都来自这里。
   *
   * 聊天页与 IDE 设置页是两个独立的挂载点，设置页改过的值不会自动广播过来，
   * 因此打开弹窗前再调一次，配色与对话框选项才能跟上。
   */
  const loadSettings = useCallback((): void => {
    void apiGet<IdeSettingsView>('/settings').then((result) => {
      // 读不到设置就沿用现有值，对话框本身仍然可用
      if (!result.ok) {
        console.error('[dsh-ide] 聊天页读取设置失败:', result.error)

        return
      }

      settingsRef.current = { ...DEFAULT_SETTINGS, ...result.value }

      for (const listener of listenersRef.current) listener()
    })
  }, [])

  // 挂载时先读一次：对话框的字号、行距与更新方式不打开弹窗也要就位
  useEffect(() => {
    loadSettings()
  }, [loadSettings])

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

  /**
   * 弹窗几何信息：与工作台写同一份设置文档，聊天页里拖动过的尺寸与位置同样跨会话记住。
   *
   * 订阅交给设置订阅者：设置要到打开弹窗后才从宿主读回，弹窗靠这次重渲染才读得到
   * 记住的几何，否则打开那一刻拿到的还是空表，位置与尺寸都按默认值渲染。
   */
  const dialogSizes = useMemo<DialogFrameStore>(
    () => ({
      read: () => settingsRef.current.dialogSizes,
      save: (key, frame) => {
        updateSettings({ dialogSizes: { ...settingsRef.current.dialogSizes, [key]: frame } })
      },
      subscribe: subscribeSettings,
    }),
    [subscribeSettings, updateSettings],
  )

  return useMemo<GitDialogServices & { refreshSettings(): void }>(
    () => ({
      root,
      // 会话目录由宿主注入，聊天页内不会中途换根，空订阅即可
      subscribeRoot: () => () => undefined,
      toast: notify,
      refreshGitStatus,
      // 聊天页没有项目树与文件变更广播，无需通知任何人
      invalidate: () => undefined,
      dialogSizes,
      settings: () => settingsRef.current,
      subscribeSettings,
      updateSettings,
      openFile: unavailable,
      openDiff: unavailable,
      openBottomPanel: unavailable,
      openMerge: unavailable,
      // 打开弹窗前再读一次：IDE 设置页刚改过的配色与对话框选项要立刻反映到浮层上
      refreshSettings: loadSettings,
    }),
    [dialogSizes, loadSettings, notify, refreshGitStatus, root, subscribeSettings, unavailable, updateSettings],
  )
}
