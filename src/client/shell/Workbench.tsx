/**
 * 工作台外壳。
 *
 * 三个承载面（主区视图、右侧栏页签、右侧栏浮窗）共用这一个组件：布局由外层容器
 * 给的尺寸决定，不写多套。这里只做骨架——工具条、工具窗口、编辑区、底部面板、
 * 状态栏、通知条，具体功能一律由 feature 提供。底部面板与 IDEA 一致：左侧工具条
 * 贯穿全高，面板横跨工具窗口与编辑区下方。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

import { apiPost } from '../../common/api'
import type { Translate } from '../../types/plugin'
import { bottomPanelFeatures, toolWindowFeatures } from '../features/registry'
import { BottomPanel } from './BottomPanel'
import { CommandPalette } from './CommandPalette'
import { EditorArea } from './EditorArea'
import { NoticeStrip } from './NoticeStrip'
import { MainToolbar } from './MainToolbar'
import { SplitHandle } from './SplitHandle'
import { StatusBar } from './StatusBar'
import { ToolWindowBar } from './ToolWindowBar'
import { WorkbenchServices } from './services'
import { readSessionCwd } from './session-cwd'
import { clampLayoutSize, useWorkbenchLayout } from './use-workbench-layout'

/** 窄容器阈值：低于它就把工具窗口改成顶部分段控件，把宽度留给编辑区。 */
const COMPACT_THRESHOLD = 768

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

  /** 编辑器区的动作通道：编辑器标签状态在 EditorArea 内，外壳只转发意图。 */
  const editorActions = useRef<{
    openFile(path: string): void
    openDiff(source: import('./contract').DiffSource): void
    openPage(kind: 'settings'): void
    openConflict(path: string): void
    revealLine(path: string, line: number): void
    activeFile(): string | null
  }>({
    openFile: () => undefined,
    openDiff: () => undefined,
    openPage: () => undefined,
    openConflict: () => undefined,
    revealLine: () => undefined,
    activeFile: () => null,
  })

  const [root, setRoot] = useState(() => readSessionCwd(sessionId))
  /** 容器宽度是否窄于降级阈值：窄容器隐藏左侧工具条，工具窗口改为顶部分段控件。 */
  const [compact, setCompact] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  // 会话在首条消息后才绑定 cwd，因此每次渲染都重读一次；订阅由入口统一挂
  useEffect(() => {
    setRoot(readSessionCwd(sessionId))
  }, [sessionId])

  /**
   * 展开底部面板。
   *
   * 声明了首选高度的面板（如左右分栏的 Git）在当前高度不够时一并抬高；
   * 用户拖拽过的高度只要不低于首选值就不会被覆盖。
   */
  const openBottomPanel = useCallback(
    (id: string) => {
      const feature = bottomPanelFeatures.find((item) => item.id === id)
      const preferred = feature?.preferredPanelHeight ?? 0
      const taller = preferred > layout.bottomPanelHeight

      update({
        bottomPanelActive: id,
        bottomPanelOpen: true,
        ...(taller ? { bottomPanelHeight: clampLayoutSize('bottomPanelHeight', preferred) } : {}),
      })
    },
    [layout.bottomPanelHeight, update],
  )

  const services = useMemo(
    () =>
      new WorkbenchServices({
        openFile: (path) => editorActions.current.openFile(path),
        openDiff: (source) => editorActions.current.openDiff(source),
        openPage: (kind) => editorActions.current.openPage(kind),
        openConflict: (path) => editorActions.current.openConflict(path),
        revealLine: (path, line) => editorActions.current.revealLine(path, line),
        // 底部面板与工具窗口的开关属于外壳布局，直接改布局状态
        openBottomPanel,
        closeBottomPanel: () => update({ bottomPanelOpen: false }),
        openToolWindow: (id) => update({ toolWindowActive: id }),
      }),
    [openBottomPanel, update],
  )

  // 工作区根变化时同步给总线，并让 Git 状态重新拉取
  useEffect(() => {
    services.setRoot(root)
  }, [root, services])

  // 宽度主导的降级：容器窄于 768px 时隐藏左侧工具条与工具窗口的并排布局
  useEffect(() => {
    const element = rootRef.current
    if (element === null || typeof ResizeObserver !== 'function') return undefined

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0
      setCompact(width < COMPACT_THRESHOLD)
    })

    observer.observe(element)

    return () => observer.disconnect()
  }, [])

  // 工作台挂载时读设置与 Git 状态；两者都是轻量请求，失败只记日志
  useEffect(() => {
    void services.loadSettings()
    services.refreshGitStatus()
    // 清理超过保留期的回收站，失败不影响使用
    void apiPost('/fs/trash-purge').then((result) => {
      if (!result.ok) console.error('[dsh-ide] 清理回收站失败:', result.error)
    })
  }, [services])

  const activeToolWindow = toolWindowFeatures.find((feature) => feature.id === layout.toolWindowActive)
  const ActiveToolView = activeToolWindow?.view
  // 底部面板未选过（或选中的 feature 已被移除）时回落到第一个，保证打开即有内容
  const bottomPanel =
    bottomPanelFeatures.find((feature) => feature.id === layout.bottomPanelActive) ?? bottomPanelFeatures[0]
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

      if (expanded) update({ bottomPanelOpen: false })
      else openBottomPanel(id)
    },
    [bottomPanel?.id, layout.bottomPanelOpen, openBottomPanel, update],
  )

  const closeBottomPanel = useCallback(() => update({ bottomPanelOpen: false }), [update])

  // 配色由设置决定：跟随宿主时不挂 data-ide-theme，让令牌原样继承；强制配色由 CSS 覆盖
  const ideTheme = useSyncExternalStore(
    (listener) => services.subscribeSettings(listener),
    () => services.settings().theme,
    () => services.settings().theme,
  )
  // 宿主的实际深浅：跟随模式下要据此选择终端色板等与「明暗」相关的取值
  const [hostDark, setHostDark] = useState(() => document.body.hasAttribute('data-ds-dark-theme'))

  useEffect(() => {
    const observer = new MutationObserver(() => setHostDark(document.body.hasAttribute('data-ds-dark-theme')))

    observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })

    return () => observer.disconnect()
  }, [])

  const scheme = ideTheme === 'system' ? (hostDark ? 'dark' : 'light') : ideTheme

  return (
    <div
      ref={rootRef}
      className="dsh-ide-root"
      // 主区承载面借用宿主的 composer overlay 契约：视图区改为满高、输入框改为浮层，
      // 工作台才能真正占满整块会话区；右侧栏没有这套结构，不挂标记
      data-conversation-composer-overlay={surface === 'main' ? '' : undefined}
      data-immersive={surface === 'main' ? '1' : undefined}
      data-ide-theme={ideTheme === 'system' ? undefined : ideTheme}
      data-ide-scheme={scheme}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <MainToolbar services={services} t={t} />

        <div className="flex min-h-0 flex-1">
          {!compact && (
            <ToolWindowBar
              features={toolWindowFeatures}
              activeId={layout.toolWindowActive}
              onToggle={toggleToolWindow}
              bottomFeatures={bottomPanelFeatures}
              bottomActiveId={layout.bottomPanelOpen ? (bottomPanel?.id ?? null) : null}
              onToggleBottom={toggleBottomPanel}
              t={t}
            />
          )}

          {/* 工具条右侧的整块区域：上半是工具窗口与编辑区，下半是底部面板 */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {/* 窄容器：左侧工具条收起，改用一条横向分段控件 */}
            {compact && (
              <div className="flex h-8 shrink-0 items-center gap-1 overflow-x-auto border-b border-line1 bg-surface1 px-2">
                {toolWindowFeatures.map((feature) => (
                  <button
                    key={feature.id}
                    type="button"
                    onClick={() => toggleToolWindow(feature.id)}
                    title={t(`${feature.id}.title`)}
                    className={
                      layout.toolWindowActive === feature.id
                        ? 'shrink-0 rounded border border-line4 bg-surface2 px-1.5 py-0.5 text-xs text-primary'
                        : 'shrink-0 rounded border border-transparent px-1.5 py-0.5 text-xs text-secondary hover:bg-surface2'
                    }
                  >
                    {t(`${feature.id}.title`)}
                  </button>
                ))}

                <span className="flex-1" />

                {bottomPanelFeatures.map((feature) => (
                  <button
                    key={feature.id}
                    type="button"
                    onClick={() => toggleBottomPanel(feature.id)}
                    title={t(`${feature.id}.title`)}
                    className="shrink-0 rounded border border-transparent px-1.5 py-0.5 text-xs text-secondary hover:bg-surface2"
                  >
                    {t(`${feature.id}.title`)}
                  </button>
                ))}
              </div>
            )}
            <div className={compact ? 'flex min-h-0 flex-1 flex-col' : 'flex min-h-0 flex-1'}>
              {ActiveToolView !== undefined && activeToolWindow !== undefined && (
                <>
                  {/* 工具窗口正文：宽度由布局状态决定，可拖拽调整；窄容器下改为全宽叠放 */}
                  <div
                    className="flex min-h-0 shrink-0 flex-col border-r border-line1 bg-surface1"
                    style={compact ? { width: '100%', maxHeight: '45%' } : { width: layout.toolWindowWidth }}
                  >
                    <div className="min-h-0 flex-1 overflow-auto">
                      <ActiveToolView
                        t={bindFeatureTranslate(t, activeToolWindow.id)}
                        sessionId={sessionId}
                        services={services}
                      />
                    </div>
                  </div>

                  {!compact && (
                    <SplitHandle
                      orientation="vertical"
                      current={() => layout.toolWindowWidth}
                      onResize={(next) => update({ toolWindowWidth: clampLayoutSize('toolWindowWidth', next) })}
                    />
                  )}
                </>
              )}

              <EditorArea
                t={t}
                sessionId={sessionId}
                services={services}
                actions={editorActions}
                onActiveFileChange={(path) => services.setActiveFile(path)}
              />
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
                  services={services}
                  t={t}
                />
              </>
            )}
          </div>
        </div>
      </div>

      <NoticeStrip t={t} services={services} />
      <CommandPalette
        t={t}
        layout={layout}
        update={update}
        openSettings={() => editorActions.current.openPage('settings')}
      />
      <StatusBar sessionId={sessionId} surface={surface} t={t} services={services} />
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

/**
 * 绑定 feature 前缀的翻译函数（供 BottomPanel 等处复用）。
 * @param t 外壳翻译函数
 * @param featureId feature id
 * @returns 只查该 feature 命名空间的翻译函数
 */
export function featureTranslate(t: Translate, featureId: string): Translate {
  return bindFeatureTranslate(t, featureId)
}
