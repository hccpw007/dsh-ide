/**
 * 右下角的临时提示层。
 *
 * fetch、push 这类一次性 Git 操作成功后，IDEA 会在编辑器右下角弹一个几秒后自动消失
 * 的气球。宿主没有「工作台内浮窗」插槽，因此自绘一层：固定在右下角、不占布局、不打断
 * 操作，到时由服务总线把条目移除。
 */
import React, { useSyncExternalStore } from 'react'

import type { IdeToast } from './contract'
import type { WorkbenchServices } from './services'

/** 提示层 props。 */
export interface ToastLayerProps {
  /** 工作台服务总线。 */
  services: WorkbenchServices
}

/**
 * 渲染右下角的临时提示。
 * @param props 见 ToastLayerProps
 * @returns 无提示时为空片段
 */
export function ToastLayer({ services }: ToastLayerProps): React.ReactElement | null {
  const toasts = useSyncExternalStore(
    (listener) => services.subscribeToasts(listener),
    () => services.toasts(),
    () => services.toasts(),
  )

  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed bottom-10 right-10 z-[9997] flex flex-col items-end gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className="pointer-events-auto flex w-[360px] items-center gap-3.5 rounded-lg bg-[var(--ide-toast-bg)] px-5 py-[22px] shadow-2xl"
        >
          {toastIcon(toast.kind)}

          <span className="min-w-0 flex-1 text-[13px] leading-5 text-primary">{toast.message}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * 提示前的圆形图标。
 * @param kind 提示类型
 * @returns 18px 的实心圆图标
 */
function toastIcon(kind: IdeToast['kind']): React.ReactNode {
  /** 圆底配色：失败用错误色，成功用新增色，其余用 IDEA 的蓝色。 */
  const fill = kind === 'error' ? 'var(--ide-vcs-conflict)' : kind === 'success' ? 'var(--ide-vcs-added)' : 'var(--ide-ic-blue)'
  /** 圆内的白色符号：深色主题下也保持纯白，与 IDEA 的图标一致。 */
  const ink = 'var(--ide-ic-white)'

  return (
    <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true" focusable="false" className="shrink-0">
      <circle cx="8" cy="8" r="7" fill={fill} />

      {kind === 'error' ? (
        <>
          <path d="M8 4.4v4.4" stroke={ink} strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="11.3" r="0.9" fill={ink} />
        </>
      ) : kind === 'success' ? (
        <path
          d="m4.7 8.2 2.2 2.2 4.3-4.5"
          stroke={ink}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      ) : (
        <>
          <path d="M8 7.1v4.4" stroke={ink} strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="4.7" r="0.9" fill={ink} />
        </>
      )}
    </svg>
  )
}
