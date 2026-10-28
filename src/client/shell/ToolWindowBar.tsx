/**
 * 左侧工具窗口条。
 *
 * 与 IDEA 一致：竖排图标按钮，点击展开对应工具窗口，再次点击同一个即收起。
 * 同一时刻只有一个工具窗口可见，避免中区被两侧夹成窄条。
 */
import React from 'react'

import { cn } from '../../common/cn'
import type { Translate } from '../../types/plugin'
import type { IdeFeature } from './contract'

/** 工具条 props。 */
export interface ToolWindowBarProps {
  /** 已注册的工具窗口 feature，顺序即从上到下的按钮顺序。 */
  features: IdeFeature[]
  /** 当前展开的 feature id；null 表示全部收起。 */
  activeId: string | null
  /** 点击按钮时切换该工具窗口的展开状态。 */
  onToggle(id: string): void
  /** 外壳翻译函数；feature 文案已带 `<id>.` 前缀。 */
  t: Translate
}

/**
 * 渲染工具窗口条。
 * @param props 见 ToolWindowBarProps
 * @returns 竖排按钮条
 */
export function ToolWindowBar({ features, activeId, onToggle, t }: ToolWindowBarProps): React.ReactElement {
  return (
    <div className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-line1 bg-layer1 py-2">
      {features.map((feature) => {
        const active = feature.id === activeId

        return (
          <button
            key={feature.id}
            type="button"
            // 工具窗口名称，同时作为悬停提示
            title={t(`${feature.id}.title`)}
            aria-pressed={active}
            onClick={() => onToggle(feature.id)}
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-md border text-xs transition-colors',
              active
                ? 'border-line4 bg-layer2 text-primary'
                : 'border-transparent bg-transparent text-secondary hover:bg-layer2 hover:text-primary',
            )}
          >
            {feature.icon?.() ?? feature.id.slice(0, 1).toUpperCase()}
          </button>
        )
      })}
    </div>
  )
}
