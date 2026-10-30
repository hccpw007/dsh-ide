/**
 * 右下角的临时提示层。
 *
 * 渲染交给公共组件 ToastStack，这里只做两件事：从服务总线订阅提示列表，以及把
 * 「更多」菜单接到工作台的动作上。提示本身的样式与交互都在公共组件里，其它承载面
 * 想复用同一套外观时不必再抄一遍。
 */
import React, { useSyncExternalStore } from 'react'

import { openIdeContextMenu } from '../../common/context-menu'
import { ToastStack, type ToastStackItem } from '../../common/ToastStack'
import type { Translate } from '../../types/plugin'
import type { WorkbenchServices } from './services'

/** 提示层 props。 */
export interface ToastLayerProps {
  /** 工作台服务总线。 */
  services: WorkbenchServices
  /** 外壳翻译函数。 */
  t: Translate
}

/**
 * 渲染右下角的临时提示。
 * @param props 见 ToastLayerProps
 * @returns 无提示时为空片段
 */
export function ToastLayer({ services, t }: ToastLayerProps): React.ReactElement | null {
  const toasts = useSyncExternalStore(
    (listener) => services.subscribeToasts(listener),
    () => services.toasts(),
    () => services.toasts(),
  )

  /**
   * 把提示正文写入剪贴板。
   * @param message 提示正文
   * @returns 是否写入成功；失败时已记日志，调用方据此决定是否点亮复制反馈
   */
  const copyToastMessage = async (message: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(message)
      return true
    } catch (error: unknown) {
      // 剪贴板可能被浏览器策略拒绝；提示本身已展示过，这里只留日志
      console.error('[dsh-ide] 复制提示内容失败:', error)
      return false
    }
  }

  /**
   * 打开单条提示的更多操作菜单。
   * @param event 触发菜单的鼠标事件
   * @param toast 目标提示
   */
  const openToastMenu = (event: React.MouseEvent, toast: ToastStackItem): void => {
    openIdeContextMenu(event, services, [
      {
        id: 'copy',
        label: t('shell.copyToastMessage'),
        run: () => {
          // 菜单里只关心复制动作本身；成功与否已在 copyToastMessage 内部记录日志
          void copyToastMessage(toast.message)
        },
      },
      {
        id: 'close',
        label: t('shell.dismissToast'),
        run: () => services.dismissToast(toast.id),
      },
    ])
  }

  return (
    <ToastStack
      items={toasts}
      // 公共组件只认 toastMore / dismissToast / toastCopied 三个短 key，命名空间在这里绑定
      t={(key) => t(`shell.${key}`)}
      onDismiss={(id) => services.dismissToast(id)}
      onMore={openToastMenu}
      onCopyMessage={copyToastMessage}
    />
  )
}
