/**
 * 状态栏。
 *
 * 左侧是工作台标识与承载形态，右侧是各 feature 贡献的条目：Git 分支与变更数、
 * 光标位置、运行中的进程、诊断计数。条目一律可点击，点了就跳到对应工具窗口。
 */
import React, { useSyncExternalStore } from 'react'

import { cn } from '../../common/cn'
import type { Translate } from '../../types/plugin'
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
 * 渲染状态栏。
 * @param props 见 StatusBarProps
 * @returns 底部一条细状态栏
 */
export function StatusBar({ sessionId, surface, services, t }: StatusBarProps): React.ReactElement {
  const gitStatus = useGitStatus(services)
  const activeFile = useActiveFile(services)

  return (
    <div className="flex h-6 shrink-0 items-center gap-3 border-t border-line1 bg-layer1 px-3 text-xs text-secondary">
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

      {/* 当前活动文件；没有时显示未打开 */}
      <span className="max-w-60 truncate">{activeFile ?? t('shell.noFile')}</span>

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
