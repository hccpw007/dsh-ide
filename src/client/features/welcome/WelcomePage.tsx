/**
 * 欢迎页。
 *
 * 编辑器区没有打开文件时的默认页面：最近打开的文件、设置入口、项目树入口。
 * 最近文件按会话记在设置里（跨会话共享），最多显示 20 条。
 */
import React from 'react'

import type { FeatureViewProps } from '../../shell/contract'

/** 最近文件数上限。 */
const RECENT_LIMIT = 20

/**
 * 渲染欢迎页。
 * @param props 见 FeatureViewProps
 * @returns 最近文件与快捷入口
 */
export function WelcomePage({ t, services }: FeatureViewProps): React.ReactElement {
  const recent = services.settings().recentFiles.slice(0, RECENT_LIMIT)

  return (
    <div className="flex h-full items-start justify-center overflow-auto p-8">
      <div className="w-full max-w-lg">
        {/* 欢迎页标题 */}
        <div className="mb-1 text-base text-primary">{t('title')}</div>

        {/* 欢迎页说明 */}
        <div className="mb-6 text-xs text-secondary">{t('subtitle')}</div>

        <div className="mb-6 flex gap-2">
          {/* 打开 IDE 设置 */}
          <button
            type="button"
            onClick={() => services.openPage('settings')}
            className="rounded border border-line2 px-2.5 py-1 text-xs text-primary hover:bg-layer2"
          >
            {t('openSettings')}
          </button>

          {/* 展开项目树 */}
          <button
            type="button"
            onClick={() => services.openToolWindow('projectTree')}
            className="rounded border border-line2 px-2.5 py-1 text-xs text-primary hover:bg-layer2"
          >
            {t('openProject')}
          </button>
        </div>

        {/* 最近打开的文件分组标题 */}
        <div className="mb-1 text-xs font-medium text-secondary">{t('recentFiles')}</div>

        {recent.length === 0 ? (
          <div className="text-xs text-secondary">{t('noRecent')}</div>
        ) : (
          <ul>
            {recent.map((path) => (
              <li key={path}>
                {/* 最近文件条目：点击打开 */}
                <button
                  type="button"
                  onClick={() => services.openFile(path)}
                  className="w-full truncate rounded px-1.5 py-1 text-left text-xs text-primary hover:bg-layer2"
                >
                  {path}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
