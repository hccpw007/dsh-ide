/**
 * 通知条。
 *
 * 工作台的写操作（保存冲突、删除、git 失败）需要即时反馈，但宿主没有「工作台内
 * 通知」这个插槽，因此自绘一条贴在状态栏上方的浮条。带操作的条目（例如「已移入
 * 回收站 · 撤销」）会渲染成一个按钮。
 */
import React, { useSyncExternalStore } from 'react'

import { cn } from '../../common/cn'
import type { Translate } from '../../types/plugin'
import type { Notice } from './contract'
import type { WorkbenchServices } from './services'

/** 通知条 props。 */
export interface NoticeStripProps {
  /** 外壳翻译函数。 */
  t: Translate
  /** 工作台服务总线。 */
  services: WorkbenchServices
}

/**
 * 订阅一份外部状态并返回快照。
 * @param services 服务总线
 * @returns 当前通知列表
 */
function useNotices(services: WorkbenchServices): Notice[] {
  return useSyncExternalStore(
    (listener) => services.subscribeNotices(listener),
    () => services.notices(),
    () => services.notices(),
  )
}

/**
 * 渲染通知条。
 * @param props 见 NoticeStripProps
 * @returns 无通知时为空片段
 */
export function NoticeStrip({ t, services }: NoticeStripProps): React.ReactElement | null {
  const notices = useNotices(services)

  if (notices.length === 0) return null

  return (
    <div className="flex shrink-0 flex-col gap-1 border-t border-line1 bg-layer1 px-2 py-1">
      {notices.map((notice) => (
        <div
          key={notice.id}
          className={cn(
            'flex items-center gap-2 rounded px-2 py-1 text-xs',
            notice.kind === 'error' ? 'text-danger' : notice.kind === 'success' ? 'text-success' : 'text-primary',
          )}
        >
          <span className="min-w-0 flex-1 truncate">{notice.message}</span>

          {notice.actionLabel !== undefined && notice.action !== undefined && (
            // 通知附带的操作（撤销删除、重新加载等）
            <button
              type="button"
              onClick={() => {
                notice.action?.()
                services.dismissNotice(notice.id)
              }}
              className="shrink-0 bg-transparent text-info hover:underline"
            >
              {notice.actionLabel}
            </button>
          )}

          {/* 关闭这一条通知 */}
          <button
            type="button"
            title={t('shell.dismissNotice')}
            onClick={() => services.dismissNotice(notice.id)}
            className="shrink-0 rounded px-1 text-secondary hover:bg-layer2 hover:text-primary"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
