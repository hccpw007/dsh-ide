/**
 * 工作台外壳。
 *
 * 三个承载面（主区视图、右侧栏页签、右侧栏浮窗）共用这一个组件：布局由外层容器
 * 给的尺寸决定，不写多套。这里只做骨架——工具条、工具窗口、编辑区、底部面板、
 * 状态栏，具体功能一律由 feature 提供。
 */
import React, { useCallback } from 'react'

import type { Translate } from '../../types/plugin'
import { bottomPanelFeatures, toolWindowFeatures } from '../features/registry'
import { BottomPanel } from './BottomPanel'
import { EditorArea } from './EditorArea'
import { SplitHandle } from './SplitHandle'
import { StatusBar } from './StatusBar'
import { ToolWindowBar } from './ToolWindowBar'
import { clampLayoutSize, useWorkbenchLayout } from './use-workbench-layout'

/** 工作台 props。 */
export interface WorkbenchProps {
  /** 当前会话 id；承载面未绑定会话时是空串。 */
  sessionId: string
  /** 外壳翻译函数；feature 文案已带 `<id>.` 前缀。 */
  t: Translate
  /** 承载形态，只用于状态栏文案，不影响布局。 */
  surface?: 'main' | 'sidebar'
}

/**
 * 渲染工作台。
 * @param props 见 WorkbenchProps
 * @returns 工作台根节点
 */
export function Workbench({ sessionId, t, surface = 'main' }: WorkbenchProps): React.ReactElement {
  const { layout, update } = useWorkbenchLayout(sessionId)
  const activeToolWindow = toolWindowFeatures.find((feature) => feature.id === layout.toolWindowActive)
  const ActiveToolView = activeToolWindow?.view

  const toggleToolWindow = useCallback(
    (id: string) => {
      // 再点同一个按钮即收起，与 IDEA 的工具窗口行为一致
      update({ toolWindowActive: layout.toolWindowActive === id ? null : id })
    },
    [layout.toolWindowActive, update],
  )

  const selectBottomPanel = useCallback(
    (id: string) => {
      update({ bottomPanelActive: id, bottomPanelOpen: true })
    },
    [update],
  )

  return (
    <div className="dsh-ide-root">
      <div className="flex min-h-0 flex-1">
        <ToolWindowBar
          features={toolWindowFeatures}
          activeId={layout.toolWindowActive}
          onToggle={toggleToolWindow}
          t={t}
        />

        {ActiveToolView !== undefined && activeToolWindow !== undefined && (
          <>
            {/* 工具窗口正文：宽度由布局状态决定，可拖拽调整 */}
            <div
              className="flex min-h-0 shrink-0 flex-col border-r border-line1 bg-layer1"
              style={{ width: layout.toolWindowWidth }}
            >
              <div className="flex h-9 shrink-0 items-center border-b border-line1 px-3 text-xs text-primary">
                {t(`${activeToolWindow.id}.title`)}
              </div>
              <div className="min-h-0 flex-1 overflow-auto">
                <ActiveToolView t={bindFeatureTranslate(t, activeToolWindow.id)} sessionId={sessionId} />
              </div>
            </div>

            <SplitHandle
              orientation="vertical"
              current={() => layout.toolWindowWidth}
              onResize={(next) => update({ toolWindowWidth: clampLayoutSize('toolWindowWidth', next) })}
            />
          </>
        )}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <EditorArea t={t} />

          {layout.bottomPanelOpen && (
            <>
              <SplitHandle
                orientation="horizontal"
                current={() => layout.bottomPanelHeight}
                onResize={(next) => update({ bottomPanelHeight: clampLayoutSize('bottomPanelHeight', next) })}
              />
              <BottomPanel
                features={bottomPanelFeatures}
                activeId={layout.bottomPanelActive}
                height={layout.bottomPanelHeight}
                onSelect={selectBottomPanel}
                sessionId={sessionId}
                t={t}
              />
            </>
          )}
        </div>
      </div>

      <StatusBar sessionId={sessionId} surface={surface} t={t} />
    </div>
  )
}

/**
 * 把外壳翻译函数绑定到某个 feature 的前缀。
 * @param t 外壳翻译函数
 * @param featureId feature id
 * @returns 只查该 feature 命名空间的翻译函数
 */
function bindFeatureTranslate(t: Translate, featureId: string): Translate {
  return (key: string) => t(`${featureId}.${key}`)
}
