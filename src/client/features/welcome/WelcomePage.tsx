/**
 * 欢迎页。
 *
 * 编辑器区没有打开文件时的默认页面：设置入口与项目树入口。
 */
import React from 'react'

import type { FeatureViewProps } from '../../shell/contract'

/**
 * 渲染欢迎页。
 * @param props 见 FeatureViewProps
 * @returns 快捷入口
 */
export function WelcomePage({ t, services }: FeatureViewProps): React.ReactElement {
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
            className="rounded border border-line2 px-2.5 py-1 text-xs text-primary hover:bg-surface2"
          >
            {t('openSettings')}
          </button>

          {/* 展开项目树 */}
          <button
            type="button"
            onClick={() => services.openToolWindow('projectTree')}
            className="rounded border border-line2 px-2.5 py-1 text-xs text-primary hover:bg-surface2"
          >
            {t('openProject')}
          </button>
        </div>
      </div>
    </div>
  )
}
