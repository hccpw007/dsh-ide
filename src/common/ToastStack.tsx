/**
 * 右下角提示的渲染层（公共组件）。
 *
 * 只负责把一组提示画出来，不关心它们从哪里来：外壳从服务总线取到列表后传进来，
 * 其它承载面（侧栏、浮窗）也能复用同一套外观。关闭与「更多」通过回调交还给调用方，
 * 因此这里不依赖任何上层实现，也不持有状态。
 *
 * 外观对齐 IDEA 的通知气球：固定在右下角、不占布局、不打断操作，鼠标移上去才露出
 * 右侧的「更多」与「关闭」。
 */
import React from 'react'

import type { Translate } from '../types/plugin'

/** 一条待渲染的提示。 */
export interface ToastStackItem {
  /** 自增 id，用作列表 key。 */
  id: number
  /** 类型，决定图标与配色。 */
  kind: string
  /** 正文。 */
  message: string
}

/** 提示层 props。 */
export interface ToastStackProps {
  /** 待展示的提示，最新的排在最后。 */
  items: readonly ToastStackItem[]
  /** 已绑定语言命名空间的翻译函数；用到 `toastMore` 与 `dismissToast` 两个 key。 */
  t: Translate
  /** 关掉一条提示。 */
  onDismiss(id: number): void
  /** 打开某条提示的更多操作菜单。 */
  onMore(event: React.MouseEvent, item: ToastStackItem): void
}

/**
 * 渲染右下角提示。
 * @param props 见 ToastStackProps
 * @returns 无提示时为空片段
 */
export function ToastStack({ items, t, onDismiss, onMore }: ToastStackProps): React.ReactElement | null {
  if (items.length === 0) return null

  return (
    <div // 层级要高过弹窗与遮罩（9998/9999）：fetch 时分支弹窗还开着，提示必须压在它上面才能悬停
      className="pointer-events-none fixed bottom-10 right-10 z-[10000] flex flex-col items-end gap-2"
    >
      {items.map((item) => (
        <div
          key={item.id}
          role="status"
          className="group pointer-events-auto flex w-[360px] items-center gap-3.5 rounded-lg bg-[var(--ide-toast-bg)] px-5 py-4 shadow-2xl"
        >
          {toastIcon(item.kind)}

          <span className="min-w-0 flex-1 text-[13px] leading-5 text-primary">{item.message}</span>

          {/* 悬停才露出的操作区：更多与关闭，与 IDEA 的通知气球一致 */}
          <span className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              title={t('toastMore')}
              aria-label={t('toastMore')}
              onClick={(event) => onMore(event, item)}
              className="flex h-5 w-5 items-center justify-center rounded text-secondary transition-colors hover:bg-surface2 hover:text-primary"
            >
              {kebabIcon()}
            </button>

            <button
              type="button"
              title={t('dismissToast')}
              aria-label={t('dismissToast')}
              onClick={() => onDismiss(item.id)}
              className="flex h-5 w-5 items-center justify-center rounded text-secondary transition-colors hover:bg-surface2 hover:text-primary"
            >
              {closeIcon()}
            </button>
          </span>
        </div>
      ))}
    </div>
  )
}

/** 提示右侧的「更多」图标：三个竖排圆点。 */
function kebabIcon(): React.ReactNode {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false" className="shrink-0">
      <circle cx="8" cy="3.4" r="1.15" />
      <circle cx="8" cy="8" r="1.15" />
      <circle cx="8" cy="12.6" r="1.15" />
    </svg>
  )
}

/** 提示右侧的关闭图标。 */
function closeIcon(): React.ReactNode {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
    >
      <path d="m4.2 4.2 7.6 7.6" />
      <path d="m11.8 4.2-7.6 7.6" />
    </svg>
  )
}

/**
 * 提示前的圆形图标。
 * @param kind 提示类型
 * @returns 18px 的实心圆图标
 */
function toastIcon(kind: string): React.ReactNode {
  /** 圆底配色：失败用错误色，成功用新增色，其余用 IDEA 的蓝色。 */
  const fill = kind === 'error' ? 'var(--ide-vcs-conflict)' : kind === 'success' ? 'var(--ide-vcs-added)' : 'var(--ide-ic-blue)'
  /** 圆内的白色符号：深浅主题下都保持纯白，与 IDEA 的图标一致。 */
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
