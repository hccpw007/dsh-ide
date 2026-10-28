/**
 * Git 底部面板。
 *
 * 按 IDEA 的 Git 工具窗口组织：顶部三个页签（本地变更 / 日志 / 控制台），
 * 页签内部再按需要左右分栏。本 feature 注册在 bottomPanel 槽位，由左侧工具条
 * 下方的 Git 图标打开，不再占用上方工具窗口。
 */
import React, { useState } from 'react'

import { cn } from '../../../common/cn'
import type { FeatureViewProps } from '../../shell/contract'

import { GitConsole } from './GitConsole'
import { GitLog } from './GitLog'
import { LocalChanges } from './LocalChanges'

/** 页签标识。 */
type GitTab = 'local' | 'log' | 'console'

/** 页签顺序与标题；标题只存语言 key，由 t 补齐前缀。 */
const TABS: ReadonlyArray<{ id: GitTab; label: string }> = [
  { id: 'local', label: 'tabLocalChanges' },
  { id: 'log', label: 'tabLog' },
  { id: 'console', label: 'tabConsole' },
]

/**
 * 渲染 Git 面板。
 * @param props 见 FeatureViewProps
 * @returns 页签栏与当前页签内容
 */
export function GitPanel({ t, sessionId, services }: FeatureViewProps): React.ReactElement {
  const [tab, setTab] = useState<GitTab>('local')

  return (
    <div className="flex h-full min-h-0 flex-col bg-base">
      {/* 页签栏：与 IDEA 的 Git 工具窗口一致，三个页签常驻 */}
      <div role="tablist" className="flex h-8 shrink-0 items-stretch border-b border-line1 bg-layer1 px-1">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              'relative px-3 text-xs transition-colors',
              tab === item.id ? 'text-primary' : 'text-secondary hover:text-primary',
            )}
          >
            {/* 页签名称 */}
            {t(item.label)}

            {/* 选中页签的下划线 */}
            {tab === item.id && <span className="absolute inset-x-2 bottom-0 h-0.5 bg-info" />}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1">
        {tab === 'local' && <LocalChanges t={t} sessionId={sessionId} services={services} />}
        {tab === 'log' && <GitLog t={t} sessionId={sessionId} services={services} />}
        {tab === 'console' && <GitConsole t={t} />}
      </div>
    </div>
  )
}
