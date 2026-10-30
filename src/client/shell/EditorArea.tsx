/**
 * 编辑器区。
 *
 * 负责标签页条与正文：标签可拖拽排序、中键关闭、右键菜单，未保存时关闭需二次确认。
 * 正文按标签类型分派：文件走 `editor` 槽位，差异、欢迎页、设置各自注册为编辑器 feature，
 * 因此外壳不需要认识任何一种具体内容。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

import { cn } from '../../common/cn'
import { openIdeContextMenu } from '../../common/context-menu'
import type { Translate } from '../../types/plugin'
import { fileIcon } from '../features/project-tree/file-icons'
import { gitTone } from '../features/project-tree/tree-row'
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
  openPage(kind: 'settings'): void
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
  /** 工作区的 Git 状态，用来给标签标题上色，与项目树保持同一套配色 */
  const gitStatus = useSyncExternalStore(
    (listener) => services.subscribeGitStatus(listener),
    () => services.gitStatus(),
    () => services.gitStatus(),
  )

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
          title: t('shell.settingsTitle'),
        }),
      openConflict: (path) =>
        openTab({ key: { kind: 'conflict', id: path }, title: `Conflict: ${path.slice(path.lastIndexOf('/') + 1)}` }),
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

  /*
   * 正文 feature 的翻译函数必须稳定。
   *
   * 每次渲染新建一个匿名函数，会让 FileEditor 的加载回调跟着换新引用，进而触发它
   * 「打开文件」副作用重跑——保存这类重渲染会把编辑器打回加载态，内核销毁重建，
   * 界面闪一下。用 useMemo 绑到 t 与 feature id 上，只有真正换文件时才变。
   */
  const activeTranslate = useMemo(
    () => (key: string) => t(`${ActiveEditor?.id ?? ''}.${key}`),
    [ActiveEditor?.id, t],
  )

  /**
   * 打开标签的右键菜单。
   *
   * 批量关闭时保留有未保存改动的标签：一次右键操作丢掉多份改动无法撤销，
   * 用户改完再单独关闭即可。
   * @param event 右键事件
   * @param tab 被右键的标签
   */
  const openTabMenu = useCallback(
    (event: React.MouseEvent, tab: EditorTab): void => {
      const key = serializeTabKey(tab.key)
      const index = tabs.findIndex((item) => serializeTabKey(item.key) === key)
      const others = tabs.filter((item) => serializeTabKey(item.key) !== key)
      const left = tabs.slice(0, Math.max(0, index))
      const right = tabs.slice(index + 1)

      /**
       * 关闭一批标签，跳过未保存的标签。
       * @param batch 待关闭的标签
       */
      const closeBatch = (batch: EditorTab[]): void => {
        const dirty = batch.filter((item) => item.dirty === true)

        for (const item of batch) {
          if (item.dirty !== true) closeTab(item)
        }

        if (dirty.length > 0) services.notify('info', t('shell.menuDirtyKept'))
      }

      const copyPath =
        tab.path === undefined
          ? undefined
          : (): void => {
              void navigator.clipboard.writeText(tab.path ?? '').catch((error: unknown) => {
                console.error('[dsh-ide] 复制标签路径失败:', error)
                services.notify('error', t('shell.menuCopyPathFailed'))
              })
            }

      openIdeContextMenu(event, services, [
        { id: 'close', label: t('shell.menuClose'), shortcut: '⌘W', run: () => requestClose(tab) },
        { id: 'closeOthers', label: t('shell.menuCloseOthers'), run: () => closeBatch(others) },
        { id: 'closeAll', label: t('shell.menuCloseAll'), run: () => closeBatch(tabs) },
        { id: 'closeLeft', label: t('shell.menuCloseLeft'), run: () => closeBatch(left) },
        { id: 'closeRight', label: t('shell.menuCloseRight'), run: () => closeBatch(right) },
        // 固定标签与分屏暂时没有对应能力，保留 IDEA 的结构以便后续点亮
        { id: 'pinTab', label: t('shell.menuPinTab'), separatorBefore: true },
        { id: 'splitRight', label: t('shell.menuSplitRight'), submenu: true, separatorBefore: true },
        { id: 'splitDown', label: t('shell.menuSplitDown') },
        { id: 'localHistory', label: t('shell.menuLocalHistory'), separatorBefore: true },
        { id: 'copyPath', label: t('shell.menuCopyPath'), ...(copyPath === undefined ? {} : { run: copyPath }) },
      ])
    },
    [closeTab, requestClose, services, t, tabs],
  )

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-base">
      {/* 标签条：横向滚动，不换行；与 IDEA 一致，标签栏最暗，活动标签用强调色描边抬起 */}
      {/* pb-[3px] 留出 3px 底边：标签背景不与正文区连成一片 */}
      <div
        className="flex h-8 shrink-0 items-stretch overflow-x-auto bg-tabbar px-1 pb-[3px] pt-1"
        // 标签条空白处的右键：批量关闭与设置入口
        onContextMenu={(event) => {
          if (event.defaultPrevented) return

          openIdeContextMenu(event, services, [
            {
              id: 'closeAll',
              label: t('shell.menuCloseAll'),
              ...(tabs.length === 0
                ? {}
                : {
                    run: () => {
                      for (const item of tabs) {
                        if (item.dirty !== true) closeTab(item)
                      }
                    },
                  }),
            },
            {
              id: 'settings',
              label: t('shell.settings'),
              shortcut: '⌘,',
              separatorBefore: true,
              run: () => services.openPage('settings'),
            },
          ])
        }}
      >
        {tabs.length === 0 && (
          <div className="flex items-center px-2 text-xs text-secondary">{t('shell.editorTitle')}</div>
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
              // 右键先把该标签设为活动，再在指针位置弹出菜单，与 IDEA 的行为一致
              onContextMenu={(event) => {
                setState((previous) => ({ ...previous, active: key }))
                openTabMenu(event, tab)
              }}
              className={cn(
                'group flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs',
                active
                  ? 'bg-tabactive text-tablabel ring-1 ring-tabline'
                  : 'text-secondary hover:bg-tabactive/50 hover:text-tablabel',
              )}
            >
              {/* 文件标签带类型图标，与项目树共用同一套 IDEA 彩色图标；页面类标签不画 */}
              {tab.key.kind === 'file' && fileIcon(tab.title)}

              {/* 标签标题：文件名按 Git 状态着色，与项目树同一套配色 */}
              <span
                className={cn(
                  'max-w-40 truncate',
                  // 只有文件标签有 Git 状态可查，页面类标签保持原色
                  tab.key.kind === 'file' ? gitTone(gitStatus.get(tab.path ?? '')) : '',
                )}
              >
                {tab.title}
              </span>

              {/* 未保存标记：有改动时显示圆点，悬停变关闭按钮 */}
              {tab.dirty === true && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />}

              {/* 关闭标签：常显低透明度，悬停加深，与 IDEA 的标签关闭钮一致 */}
              <button
                type="button"
                title={t('shell.closeTab')}
                onClick={(event) => {
                  event.stopPropagation()
                  requestClose(tab)
                }}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-secondary opacity-70 transition-opacity hover:bg-surface2 hover:text-primary hover:opacity-100"
              >
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3.2 3.2l9.6 9.6M12.8 3.2l-9.6 9.6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          )
        })}
      </div>

      {/* 正文：由标签类型对应的 feature 渲染；底色与 IDEA 的编辑区一致，比标签栏亮一级 */}
      <div className="min-h-0 flex-1 overflow-hidden bg-code">
        {ActiveRender !== undefined && activeTab !== undefined ? (
          <ActiveRender
            // 编辑器 feature 的文案 key 不带前缀，与工具窗口一致由外壳补上 id
            t={activeTranslate}
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
        <div className="shrink-0 border-t border-line1 bg-surface1 p-3 text-xs">
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
              className="rounded border border-line2 px-2 py-1 text-primary hover:bg-surface2"
            >
              {t('shell.discardAndClose')}
            </button>

            {/* 取消关闭，保留标签 */}
            <button
              type="button"
              onClick={() => setPendingClose(null)}
              className="rounded border border-line2 px-2 py-1 text-primary hover:bg-surface2"
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
 * 空编辑区：没有打开任何标签时的占位。
 * @param props 翻译函数与工作台服务总线（右键菜单要用）
 * @returns 居中空态
 */
function EmptyEditor({ t, services }: { t: Translate; services: WorkbenchServices }): React.ReactElement {
  return (
    <div
      className="flex h-full items-center justify-center p-6"
      // 空编辑区右键：接管浏览器菜单，只保留设置入口
      onContextMenu={(event) =>
        openIdeContextMenu(event, services, [
          {
            id: 'settings',
            label: t('shell.settings'),
            shortcut: '⌘,',
            run: () => services.openPage('settings'),
          },
        ])
      }
    >
      <div className="w-full max-w-md text-center">
        {/* 空态主文案 */}
        <div className="text-sm text-primary">{t('shell.emptyEditor')}</div>
        {/* 空态说明 */}
        <div className="mt-1 text-xs text-secondary">{t('shell.emptyEditorHint')}</div>
      </div>
    </div>
  )
}

/** 供外部构造差异标签时复用。 */
export { diffSourceId }
export type { FeatureViewProps }
