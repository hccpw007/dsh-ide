/**
 * 左侧工具条。
 *
 * 与 IDEA 一致：竖排图标分上下两组，上方是工具窗口（项目树、Git…），
 * 下方贴底的是底部面板入口（终端、运行、Problems…）。底部面板不再自带图标页签，
 * 切换统一走这一列，避免同一面板出现两处入口。
 */
import React from 'react'

import { cn } from '../../common/cn'
import type { Translate } from '../../types/plugin'
import type { IdeFeature } from './contract'

/** 工具条 props。 */
export interface ToolWindowBarProps {
  /** 已注册的工具窗口 feature，顺序即从上到下的按钮顺序。 */
  features: IdeFeature[]
  /** 当前展开的工具窗口 feature id；null 表示全部收起。 */
  activeId: string | null
  /** 点击按钮时切换该工具窗口的展开状态。 */
  onToggle(id: string): void
  /** 已注册的底部面板 feature，图标固定排在左侧列的下方。 */
  bottomFeatures: IdeFeature[]
  /** 当前可见的底部面板 feature id；面板收起时为 null，用于高亮。 */
  bottomActiveId: string | null
  /** 点击底部按钮时展开该面板，再点同一个即收起。 */
  onToggleBottom(id: string): void
  /** 外壳翻译函数；feature 文案已带 `<id>.` 前缀。 */
  t: Translate
}

/**
 * 渲染工具条。
 * @param props 见 ToolWindowBarProps
 * @returns 竖排按钮列
 */
export function ToolWindowBar({
  features,
  activeId,
  onToggle,
  bottomFeatures,
  bottomActiveId,
  onToggleBottom,
  t,
}: ToolWindowBarProps): React.ReactElement {
  return (
    <div className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-line1 bg-layer1 py-2">
      {features.map((feature) => (
        <BarButton
          key={feature.id}
          // 工具窗口名称，同时作为悬停提示
          label={t(`${feature.id}.title`)}
          active={feature.id === activeId}
          onClick={() => onToggle(feature.id)}
          icon={featureGlyph(feature)}
        />
      ))}

      {bottomFeatures.length > 0 && (
        // mt-auto 把底部面板入口压到列底，位置不随上方工具窗口数量浮动
        <div className="mt-auto flex flex-col items-center gap-1">
          {bottomFeatures.map((feature) => (
            <BarButton
              key={feature.id}
              // 底部面板名称，同时作为悬停提示
              label={t(`${feature.id}.title`)}
              active={feature.id === bottomActiveId}
              onClick={() => onToggleBottom(feature.id)}
              icon={featureGlyph(feature)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** 工具条按钮：上下两组共用同一套外观，只有激活态不同。 */
interface BarButtonProps {
  /** 按钮名称，同时作为悬停提示。 */
  label: string
  /** 该按钮对应的视图当前是否可见。 */
  active: boolean
  onClick(): void
  icon: React.ReactNode
}

/**
 * 渲染单个工具条按钮。
 * @param props 见 BarButtonProps
 * @returns 方形图标按钮
 */
function BarButton({ label, active, onClick, icon }: BarButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-md border text-xs transition-colors',
        active
          ? 'border-line4 bg-layer2 text-primary'
          : 'border-transparent bg-transparent text-secondary hover:bg-layer2 hover:text-primary',
      )}
    >
      {icon}
    </button>
  )
}

/**
 * 取 feature 的图标；未提供图标时用 id 首字母兜底，保证按钮仍可点击。
 * @param feature 工具窗口或底部面板 feature
 * @returns 图标节点
 */
function featureGlyph(feature: IdeFeature): React.ReactNode {
  return feature.icon?.() ?? feature.id.slice(0, 1).toUpperCase()
}
