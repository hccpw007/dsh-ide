/**
 * 编辑器区。
 *
 * 负责标签页条与正文：标签可拖拽排序、中键关闭、右键菜单，未保存时关闭需二次确认。
 * 正文按标签类型分派：文件走 `editor` 槽位，差异、欢迎页、设置各自注册为编辑器 feature，
 * 因此外壳不需要认识任何一种具体内容。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { cn } from '../../common/cn'
import type { Translate } from '../../types/plugin'
import { editorFeatures } from '../features/registry'
import type { DiffSource, EditorTab, FeatureViewProps } from './contract'
import {
  diffSourceId,
  diffTab,
  fileTab,
  loadEditorState,
  saveEditorState,
  serializeTabKey,
  type StoredEditorState,
} from './editor-store'
import { WorkbenchServices } from './services'

/** 编辑器区对外暴露的动作通道。 */
export interface EditorActions {
  /** 打开文件，已打开时聚焦。 */
  openFile(path: string): void
  /** 打开差异。 */
  openDiff(source: DiffSource): void
  /** 打开内置页面。 */
  openPage(kind: 'welcome' | 'settings'): void
  /** 打开冲突解决视图。 */
  openConflict(path: string): void
  /** 跳到指定行。 */
  revealLine(path: string, line: number): void
  /** 当前活动文件的相对路径。 */
  activeFile(): string | null
}

/** 编辑器区 props。 */
export interface EditorAreaProps {
  /** 外壳翻译函数。 */
  t: Translate
  /** 当前会话 id。 */
  sessionId: string
  /** 工作台服务总线。 */
  services: WorkbenchServices
  /** 由外壳持有、由本组件填充的动作通道。 */
  actions: React.MutableRefObject<EditorActions>
  /** 活动文件变化回调。 */
  onActiveFileChange(path: string | null): void
}

/**
 * 把标签地址与渲染类型对上。
 * @param tab 标签
 * @returns 渲染所需地址；没有对应类型时为空串
 */
function addressOf(tab: EditorTab): string {
  if (tab.key.kind === 'file') return `file:${tab.path ?? tab.key.id}`
  if (tab.key.kind === 'diff') return `diff:${tab.key.id}`

  return `${tab.key.kind}:${tab.key.id}`
}

/**
 * 渲染编辑器区。
 * @param props 见 EditorAreaProps
 * @returns 标签条与正文
 */
export function EditorArea({
  t,
  sessionId,
  services,
  actions,
  onActiveFileChange,
}: EditorAreaProps): React.ReactElement {
  const [state, setState] = useState<StoredEditorState>(() => loadEditorState(sessionId))
  /** 正在拖拽的标签下标。 */
  const draggingIndex = useRef<number | null>(null)
  /** 关闭前确认的目标。 */
  const [pendingClose, setPendingClose] = useState<EditorTab | null>(null)

  const tabs = state.tabs
  const activeKey = state.active

  // 会话切换时换用该会话自己的标签集合
  useEffect(() => {
    setState(loadEditorState(sessionId))
  }, [sessionId])

  // 标签变化后落盘；活动文件同步给服务总线，项目树据此高亮
  useEffect(() => {
    saveEditorState(sessionId, state)

    const active = state.tabs.find((tab) => serializeTabKey(tab.key) === state.active)

    onActiveFileChange(active?.key.kind === 'file' ? (active.path ?? null) : null)
  }, [onActiveFileChange, sessionId, state])

  /**
   * 打开或聚焦一个标签。
   * @param tab 待打开的标签
   */
  const openTab = useCallback((tab: EditorTab): void => {
    const key = serializeTabKey(tab.key)

    setState((previous) => {
      const exists = previous.tabs.some((item) => serializeTabKey(item.key) === key)

      return {
        tabs: exists ? previous.tabs : [...previous.tabs, tab],
        active: key,
      }
    })
  }, [])

  /**
   * 关闭一个标签。
   * @param tab 待关闭的标签
   */
  const closeTab = useCallback((tab: EditorTab): void => {
    const key = serializeTabKey(tab.key)

    setState((previous) => {
      const index = previous.tabs.findIndex((item) => serializeTabKey(item.key) === key)
      const tabsNext = previous.tabs.filter((item) => serializeTabKey(item.key) !== key)
      // 关掉的是当前标签时，优先激活右侧邻居，其次左侧
      const active =
        previous.active === key
          ? (tabsNext[index] ?? tabsNext[index - 1])?.key
          : undefined

      return { tabs: tabsNext, active: active === undefined ? (previous.active === key ? '' : previous.active) : serializeTabKey(active) }
    })
  }, [])

  /**
   * 请求关闭标签；脏标签先弹确认。
   * @param tab 待关闭标签
   */
  const requestClose = useCallback(
    (tab: EditorTab): void => {
      if (tab.dirty === true) {
        setPendingClose(tab)

        return
      }

      closeTab(tab)
    },
    [closeTab],
  )

  // 把动作通道交给外壳：工具窗口与其他 feature 通过这些入口打开内容
  useEffect(() => {
    actions.current = {
      openFile: (path) => openTab(fileTab(path)),
      openDiff: (source) => openTab(diffTab(source)),
      openPage: (kind) =>
        openTab({
          key: { kind, id: kind },
          title: kind === 'welcome' ? t('shell.welcomeTitle') : t('shell.settingsTitle'),
        }),
      openConflict: (path) =>
        openTab({ key: { kind: 'conflict', id: path }, title: `冲突：${path.slice(path.lastIndexOf('/') + 1)}` }),
      revealLine: (path, line) => {
        // 先把文件打开（已在则聚焦），再发布跳转请求；编辑器标签消费后自己 scrollIntoView
        openTab(fileTab(path))
        services.publishRevealLine(path, line)
      },
      activeFile: () => {
        const active = tabs.find((tab) => serializeTabKey(tab.key) === activeKey)

        return active?.key.kind === 'file' ? (active.path ?? null) : null
      },
    }
  }, [actions, activeKey, openTab, services, t, tabs])

  /**
   * 拖拽排序：把 from 位置的标签插到 to 之前。
   * @param from 源下标
   * @param to 目标下标
   */
  const reorder = useCallback((from: number, to: number): void => {
    setState((previous) => {
      if (from === to || from < 0 || to < 0 || from >= previous.tabs.length || to > previous.tabs.length) return previous

      const next = [...previous.tabs]
      const [moved] = next.splice(from, 1)
      if (moved === undefined) return previous

      next.splice(from < to ? to - 1 : to, 0, moved)

      return { ...previous, tabs: next }
    })
  }, [])

  const ActiveEditor = useMemo(() => {
    const active = tabs.find((tab) => serializeTabKey(tab.key) === activeKey)
    if (active === undefined) return undefined

    const address = addressOf(active)

    return editorFeatures.find((feature) => feature.editor?.canOpen(address) === true)
  }, [activeKey, tabs])

  const activeTab = tabs.find((tab) => serializeTabKey(tab.key) === activeKey)
  const activeAddress = activeTab === undefined ? '' : addressOf(activeTab)
  const ActiveRender = ActiveEditor?.editor?.render

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-base">
      {/* 标签条：横向滚动，不换行 */}
      <div className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-line1 bg-layer1">
        {tabs.length === 0 && (
          <div className="flex items-center px-3 text-xs text-secondary">{t('shell.editorTitle')}</div>
        )}

        {tabs.map((tab, index) => {
          const key = serializeTabKey(tab.key)
          const active = key === activeKey

          return (
            <div
              key={key}
              draggable
              onDragStart={() => {
                draggingIndex.current = index
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (draggingIndex.current !== null) reorder(draggingIndex.current, index)
                draggingIndex.current = null
              }}
              onMouseDown={(event) => {
                // 中键关闭，与多数编辑器一致
                if (event.button === 1) {
                  event.preventDefault()
                  requestClose(tab)
                }
              }}
              onClick={() => setState((previous) => ({ ...previous, active: key }))}
              className={cn(
                'group flex shrink-0 cursor-pointer items-center gap-1 border-r border-line1 px-2.5 text-xs',
                active ? 'bg-base text-primary' : 'bg-layer1 text-secondary hover:text-primary',
              )}
            >
              {/* 标签标题 */}
              <span className="max-w-40 truncate">{tab.title}</span>

              {/* 未保存标记：有改动时显示圆点，悬停变关闭按钮 */}
              {tab.dirty === true && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />}

              {/* 关闭标签 */}
              <button
                type="button"
                title={t('shell.closeTab')}
                onClick={(event) => {
                  event.stopPropagation()
                  requestClose(tab)
                }}
                className="shrink-0 rounded px-1 text-secondary opacity-0 transition-opacity hover:bg-layer2 hover:text-primary group-hover:opacity-100"
              >
                ×
              </button>
            </div>
          )
        })}

        {/* 新建入口固定在右侧：一个空格子，点开是欢迎页（最近文件） */}
        <button
          type="button"
          title={t('shell.openWelcome')}
          onClick={() => openTab({ key: { kind: 'welcome', id: 'welcome' }, title: t('shell.welcomeTitle') })}
          className="shrink-0 px-2.5 text-xs text-secondary hover:text-primary"
        >
          +
        </button>
      </div>

      {/* 正文：由标签类型对应的 feature 渲染 */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {ActiveRender !== undefined && activeTab !== undefined ? (
          <ActiveRender
            // 编辑器 feature 的文案 key 不带前缀，与工具窗口一致由外壳补上 id
            t={(key) => t(`${ActiveEditor?.id ?? ''}.${key}`)}
            sessionId={sessionId}
            services={services}
            address={activeAddress}
            source={activeTab.source}
          />
        ) : (
          <EmptyEditor t={t} services={services} />
        )}
      </div>

      {pendingClose !== null && (
        <div className="shrink-0 border-t border-line1 bg-layer1 p-3 text-xs">
          {/* 关闭未保存标签的确认说明 */}
          <div className="mb-2 text-warn">{t('shell.discardUnsaved')}</div>

          <div className="flex gap-2">
            {/* 放弃改动并关闭 */}
            <button
              type="button"
              onClick={() => {
                closeTab(pendingClose)
                setPendingClose(null)
              }}
              className="rounded border border-line2 px-2 py-1 text-primary hover:bg-layer2"
            >
              {t('shell.discardAndClose')}
            </button>

            {/* 取消关闭，保留标签 */}
            <button
              type="button"
              onClick={() => setPendingClose(null)}
              className="rounded border border-line2 px-2 py-1 text-primary hover:bg-layer2"
            >
              {t('shell.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * 空编辑区：欢迎页的轻量版本。
 * @param props 翻译函数与服务总线
 * @returns 居中空态与最近文件
 */
function EmptyEditor({ t, services }: { t: Translate; services: WorkbenchServices }): React.ReactElement {
  const recent = services.settings().recentFiles.slice(0, 12)

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        {/* 空态主文案 */}
        <div className="text-sm text-primary">{t('shell.emptyEditor')}</div>
        {/* 空态说明 */}
        <div className="mt-1 text-xs text-secondary">{t('shell.emptyEditorHint')}</div>

        {recent.length > 0 && (
          <div className="mt-4 text-left">
            {/* 最近打开的文件标题 */}
            <div className="mb-1 text-xs text-secondary">{t('shell.recentFiles')}</div>

            <ul className="space-y-0.5">
              {recent.map((path) => (
                <li key={path}>
                  {/* 最近文件条目：点击直接打开 */}
                  <button
                    type="button"
                    onClick={() => services.openFile(path)}
                    className="w-full truncate rounded px-1.5 py-0.5 text-left text-xs text-primary hover:bg-layer2"
                  >
                    {path}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

/** 供外部构造差异标签时复用。 */
export { diffSourceId }
export type { FeatureViewProps }
