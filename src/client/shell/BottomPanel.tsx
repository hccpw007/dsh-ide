/**
 * 底部面板。
 *
 * 入口图标在左侧列下方（见 ToolWindowBar），因此这里不再渲染图标页签，
 * 只显示当前面板名称与关闭按钮 —— 与 IDEA 的底部工具窗口一致。
 */
import React from 'react'

import type { Translate } from '../../types/plugin'
import type { IdeFeature } from './contract'
import type { WorkbenchServices } from './services'

/** 底部面板 props。 */
export interface BottomPanelProps {
  /** 当前显示的面板 feature；null 表示没有可显示的面板。 */
  feature: IdeFeature | null
  /** 面板高度（px），由外壳的布局状态提供。 */
  height: number
  /** 点击关闭按钮时收起面板。 */
  onClose(): void
  /** 会话 id，透传给面板内容。 */
  sessionId: string
  /** 工作台服务总线。 */
  services: WorkbenchServices
  /** 外壳翻译函数；feature 文案已带 `<id>.` 前缀。 */
  t: Translate
}

/**
 * 渲染底部面板。
 * @param props 见 BottomPanelProps
 * @returns 标题行与内容区
 */
export function BottomPanel({
  feature,
  height,
  onClose,
  sessionId,
  services,
  t,
}: BottomPanelProps): React.ReactElement {
  const ActiveView = feature?.view
  // 自带头部的面板（如 Git 的页签栏）隐藏默认标题栏，避免两条标题栏叠在一起
  const hideHeader = feature?.hideHeader === true

  return (
    <div className="flex min-h-0 flex-col border-t border-line1 bg-surface1" style={{ height }}>
      {!hideHeader && (
        <div className="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-line1 pl-3 pr-2">
          {/* 当前底部面板的名称，必须与左侧列中被选中的图标一致 */}
          <span className="truncate text-xs text-primary">
            {feature !== null ? t(`${feature.id}.title`) : t('shell.bottomPanelTitle')}
          </span>

          {/* 收起面板；只隐藏视图，面板内的进程不因此结束 */}
          <button
            type="button"
            title={t('shell.closeBottomPanel')}
            onClick={onClose}
            className="rounded px-1 text-xs text-secondary transition-colors hover:bg-surface2 hover:text-primary"
          >
            ×
          </button>
        </div>
      )}

      <div className={hideHeader ? 'min-h-0 flex-1 overflow-hidden' : 'min-h-0 flex-1 overflow-auto'}>
        {ActiveView !== undefined && feature !== null ? (
          <ActiveView t={boundTranslate(t, feature.id)} sessionId={sessionId} services={services} />
        ) : (
          <div className="p-3 text-xs text-secondary">{t('shell.emptyBottomPanel')}</div>
        )}
      </div>
    </div>
  )
}

/**
 * 把外壳翻译函数绑定到某个 feature 的前缀。
 *
 * 底部面板按 feature 渲染，feature 内的文案 key 不带前缀，这里就地补上，
 * 避免每个 feature 自己再拼一次字符串。
 * @param t 外壳翻译函数
 * @param featureId feature id
 * @returns 只查该 feature 命名空间的翻译函数
 */
function boundTranslate(t: Translate, featureId: string): Translate {
  return (key: string) => t(`${featureId}.${key}`)
}
