/**
 * 工作台外壳。
 *
 * 三个承载面（主区视图、右侧栏页签、右侧栏浮窗）共用这一个组件：布局由外层容器
 * 给的尺寸决定，不写多套。这里只做骨架——工具条、工具窗口、编辑区、底部面板、
 * 状态栏，具体功能一律由 feature 提供。底部面板与 IDEA 一致：左侧工具条贯穿全高，
 * 面板横跨工具窗口与编辑区下方。
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
  // 新会话默认展开第一个工具窗口（当前是项目树）；外壳只认「第一个」，不知道具体 feature id
  const defaultToolWindowId = toolWindowFeatures[0]?.id ?? null
  const { layout, update } = useWorkbenchLayout(sessionId, defaultToolWindowId)
  const activeToolWindow = toolWindowFeatures.find((feature) => feature.id === layout.toolWindowActive)
  const ActiveToolView = activeToolWindow?.view
  // 底部面板未选过（或选中的 feature 已被移除）时回落到第一个，保证打开即有内容
  const bottomPanel =
    bottomPanelFeatures.find((feature) => feature.id === layout.bottomPanelActive) ?? bottomPanelFeatures[0]
  // 没有底部面板功能时不占高度，把空间留给编辑区；后续接入终端等面板后自动恢复
  const showBottomPanel = layout.bottomPanelOpen && bottomPanel !== undefined

  const toggleToolWindow = useCallback(
    (id: string) => {
      // 再点同一个按钮即收起，与 IDEA 的工具窗口行为一致
      update({ toolWindowActive: layout.toolWindowActive === id ? null : id })
    },
    [layout.toolWindowActive, update],
  )

  const toggleBottomPanel = useCallback(
    (id: string) => {
      // 已展开且点的就是当前面板时收起，否则切换到该面板 —— IDEA 底部工具窗口的同款行为
      const expanded = layout.bottomPanelOpen && bottomPanel?.id === id
      update(expanded ? { bottomPanelOpen: false } : { bottomPanelActive: id, bottomPanelOpen: true })
    },
    [bottomPanel?.id, layout.bottomPanelOpen, update],
  )

  const closeBottomPanel = useCallback(() => update({ bottomPanelOpen: false }), [update])

  return (
    <div
      className="dsh-ide-root"
      // 主区承载面借用宿主的 composer overlay 契约：视图区改为满高、输入框改为浮层，
      // 工作台才能真正占满整块会话区；右侧栏没有这套结构，不挂标记
      data-conversation-composer-overlay={surface === 'main' ? '' : undefined}
      data-immersive={surface === 'main' ? '1' : undefined}
    >
      <div className="flex min-h-0 flex-1">
        <ToolWindowBar
          features={toolWindowFeatures}
          activeId={layout.toolWindowActive}
          onToggle={toggleToolWindow}
          bottomFeatures={bottomPanelFeatures}
          bottomActiveId={layout.bottomPanelOpen ? (bottomPanel?.id ?? null) : null}
          onToggleBottom={toggleBottomPanel}
          t={t}
        />

        {/* 工具条右侧的整块区域：上半是工具窗口与编辑区，下半是底部面板 */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1">
            {ActiveToolView !== undefined && activeToolWindow !== undefined && (
              <>
                {/* 工具窗口正文：宽度由布局状态决定，可拖拽调整；标题栏由 feature 自行渲染 */}
                <div
                  className="flex min-h-0 shrink-0 flex-col border-r border-line1 bg-layer1"
                  style={{ width: layout.toolWindowWidth }}
                >
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

            <EditorArea t={t} />
          </div>

          {showBottomPanel && (
            <>
              {/* 横向分隔条同样横跨工具窗口与编辑区，拖拽只改底部面板高度 */}
              <SplitHandle
                orientation="horizontal"
                current={() => layout.bottomPanelHeight}
                onResize={(next) => update({ bottomPanelHeight: clampLayoutSize('bottomPanelHeight', next) })}
              />
              {/* 底部面板左边缘贴左侧工具条，因此落在浏览树下方而不是只占编辑区一列 */}
              <BottomPanel
                feature={bottomPanel ?? null}
                height={layout.bottomPanelHeight}
                onClose={closeBottomPanel}
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
