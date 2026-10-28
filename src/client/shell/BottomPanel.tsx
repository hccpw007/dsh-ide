/**
 * 底部面板。
 *
 * 页签顺序由 feature 的 order 决定；内容区按激活的 feature 渲染其 view。
 * P0 阶段没有已注册的面板 feature，因此显示空态，但页签条与内容区结构已经就位。
 */
import React from 'react'

import { cn } from '../../common/cn'
import type { Translate } from '../../types/plugin'
import type { IdeFeature } from './contract'

/** 底部面板 props。 */
export interface BottomPanelProps {
  /** 已注册的底部面板 feature。 */
  features: IdeFeature[]
  /** 当前激活的 feature id；null 表示全部未选。 */
  activeId: string | null
  /** 面板高度（px），由外壳的布局状态提供。 */
  height: number
  /** 点击页签时切换激活项。 */
  onSelect(id: string): void
  /** 会话 id，透传给面板内容。 */
  sessionId: string
  /** 外壳翻译函数；feature 文案已带 `<id>.` 前缀。 */
  t: Translate
}

/**
 * 渲染底部面板。
 * @param props 见 BottomPanelProps
 * @returns 页签条与内容区
 */
export function BottomPanel({
  features,
  activeId,
  height,
  onSelect,
  sessionId,
  t,
}: BottomPanelProps): React.ReactElement {
  const active = features.find((feature) => feature.id === activeId) ?? features[0]
  const ActiveView = active?.view

  return (
    <div className="flex min-h-0 flex-col border-t border-line1 bg-layer1" style={{ height }}>
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-line1 px-2">
        {features.map((feature) => {
          const selected = feature.id === active?.id

          return (
            <button
              key={feature.id}
              type="button"
              // 面板页签名称
              aria-pressed={selected}
              onClick={() => onSelect(feature.id)}
              className={cn(
                'rounded px-2 py-1 text-xs transition-colors',
                selected
                  ? 'bg-layer2 text-primary'
                  : 'bg-transparent text-secondary hover:bg-layer2 hover:text-primary',
              )}
            >
              {t(`${feature.id}.title`)}
            </button>
          )
        })}

        {features.length === 0 && <span className="text-xs text-secondary">{t('shell.bottomPanelTitle')}</span>}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {ActiveView !== undefined && active !== undefined ? (
          <ActiveView t={boundTranslate(t, active.id)} sessionId={sessionId} />
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
