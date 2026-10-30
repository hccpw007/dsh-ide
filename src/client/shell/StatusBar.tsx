/**
 * 状态栏。
 *
 * 左侧是工作台标识与承载形态，右侧是各 feature 贡献的条目：Git 分支与变更数、
 * 光标位置、运行中的进程、诊断计数。条目一律可点击，点了就跳到对应工具窗口。
 */
import React, { useSyncExternalStore } from 'react'

import { cn } from '../../common/cn'
import { openIdeContextMenu } from '../../common/context-menu'
import type { Translate } from '../../types/plugin'
import { fileIcon } from '../features/project-tree/file-icons'
import { folderIcon } from '../features/project-tree/icons'
import { statusBarFeatures } from '../features/registry'
import type { WorkbenchServices } from './services'

/** 状态栏 props。 */
export interface StatusBarProps {
  /** 当前会话 id；空串表示承载面未绑定会话。 */
  sessionId: string
  /** 承载形态，用于区分主区视图与右侧栏。 */
  surface: 'main' | 'sidebar'
  /** 工作台服务总线。 */
  services: WorkbenchServices
  /** 外壳翻译函数。 */
  t: Translate
}

/**
 * 订阅 Git 状态映射。
 * @param services 服务总线
 * @returns 当前映射
 */
function useGitStatus(services: WorkbenchServices): ReadonlyMap<string, string> {
  return useSyncExternalStore(
    (listener) => services.subscribeGitStatus(listener),
    () => services.gitStatus(),
    () => services.gitStatus(),
  )
}

/**
 * 订阅活动文件。
 * @param services 服务总线
 * @returns 活动文件相对路径
 */
function useActiveFile(services: WorkbenchServices): string | null {
  return useSyncExternalStore(
    (listener) => services.subscribeActiveFile(listener),
    () => services.activeFile(),
    () => services.activeFile(),
  )
}

/**
 * 订阅工作区根路径。
 * @param services 服务总线
 * @returns 工作区绝对路径；空串表示尚未绑定
 */
function useRoot(services: WorkbenchServices): string {
  return useSyncExternalStore(
    (listener) => services.subscribeRoot(listener),
    () => services.root,
    () => services.root,
  )
}

/**
 * 渲染状态栏。
 * @param props 见 StatusBarProps
 * @returns 底部一条细状态栏
 */
export function StatusBar({ sessionId, surface, services, t }: StatusBarProps): React.ReactElement {
  const gitStatus = useGitStatus(services)
  const activeFile = useActiveFile(services)
  const root = useRoot(services)

  return (
    <div
      className="flex h-[22px] shrink-0 items-center gap-3 border-t border-line1 bg-surface1 px-2.5 text-[11px] text-secondary"
      // 状态栏右键：IDEA 只有显示/隐藏状态栏与设置两项
      onContextMenu={(event) => {
        if (event.defaultPrevented) return

        openIdeContextMenu(event, services, [
          { id: 'showStatusBar', label: t('shell.menuShowStatusBar') },
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
      {/* 工作台标识，说明当前这块区域是什么 */}
      <span className="text-primary">{t('shell.statusLabel')}</span>

      {/* 当前承载形态：主区视图或右侧栏 */}
      <span>{surface === 'main' ? t('shell.surfaceMain') : t('shell.surfaceSidebar')}</span>

      {/* 变更数量：点开底部 Git 面板 */}
      {gitStatus.size > 0 && (
        <button
          type="button"
          onClick={() => services.openBottomPanel('git')}
          className="bg-transparent text-warn hover:underline"
        >
          {t('shell.changes')} {gitStatus.size}
        </button>
      )}

      <span className="flex-1" />

      {/* 当前活动文件的路径面包屑：工作区名 + 逐级目录 + 文件名；没有打开文件时整块不占位 */}
      {activeFile !== null && <FileBreadcrumb root={root} path={activeFile} />}

      {/* 各 feature 贡献的状态条目 */}
      {statusBarFeatures.map((feature) => {
        const Status = feature.status
        if (Status === undefined) return null

        return (
          <span key={feature.id} className={cn('flex items-center')}>
            <Status t={(key) => t(`${feature.id}.${key}`)} sessionId={sessionId} services={services} />
          </span>
        )
      })}

      {/* 会话标识，未绑定会话时明确说明 */}
      <span>{sessionId === '' ? t('shell.noSession') : sessionId.slice(0, 8)}</span>
    </div>
  )
}

/**
 * 当前文件的路径面包屑。
 *
 * 状态栏只有 22px 高，因此只保留「工作区名 + 各级目录 + 文件名」三段式结构：
 * 目录多了会挤掉右侧的运行与诊断计数，所以整体限宽并可截断。
 * @param props 工作区绝对路径与当前文件相对路径
 * @returns 面包屑
 */
function FileBreadcrumb({ root, path }: { root: string; path: string }): React.ReactElement {
  // 工作区名取根路径最后一段；根为空时用仓库图标占位，避免出现空节点
  const workspace = root.split('/').filter((part) => part !== '').pop() ?? ''
  const segments = path.split('/').filter((part) => part !== '')

  return (
    <span className="flex min-w-0 max-w-96 items-center gap-1" title={path}>
      {workspace !== '' && (
        <>
          <span className="flex shrink-0 items-center gap-1">
            {folderIcon(true)}
            <span className="truncate">{workspace}</span>
          </span>
        </>
      )}

      {segments.map((segment, index) => {
        const last = index === segments.length - 1

        return (
          <span key={`${index}:${segment}`} className="flex min-w-0 items-center gap-1">
            <span className="shrink-0 opacity-50">›</span>

            {/* 只有文件名带类型图标，目录名保持纯文本，避免一行里图标过多 */}
            {last && <span className="flex shrink-0 items-center">{fileIcon(path)}</span>}

            <span className={cn('truncate', last ? 'text-primary' : '')}>{segment}</span>
          </span>
        )
      })}
    </span>
  )
}
