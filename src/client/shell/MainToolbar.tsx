/**
 * 顶部主工具栏。
 *
 * 对应 IDEA 新 UI 顶部的主工具条：左侧是当前分支入口，随后是 Git 的常用动作，
 * 右侧是全局视图开关。外壳只做接线——按钮点了要么转成服务总线上的意图，要么
 * 调 Git 的只读方法；工具栏自身不保存业务状态。
 *
 * 分支名走独立的轻量请求：状态栏的 gitStatus 只带「路径 → 状态字母」，回答不了
 * 「当前在哪个分支」，而工具栏每次挂载都要显示它。
 */
import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'

import { cn } from '../../common/cn'
import type { Translate } from '../../types/plugin'

import { readRefs } from '../features/git/api'
import { branchIcon, chevronDownIcon, gearIcon, refreshIcon, searchIcon, sortIcon } from '../features/git/icons'
import type { WorkbenchServices } from './services'

/** 主工具栏 props。 */
export interface MainToolbarProps {
  /** 工作台服务总线。 */
  services: WorkbenchServices
  /** 外壳翻译函数。 */
  t: Translate
}

/**
 * 渲染主工具栏。
 * @param props 见 MainToolbarProps
 * @returns 顶部一条工具条
 */
export function MainToolbar({ services, t }: MainToolbarProps): React.ReactElement {
  const root = useSyncExternalStore(
    (listener) => services.subscribeRoot(listener),
    () => services.root,
    () => services.root,
  )
  const [branch, setBranch] = useState('')
  const [busy, setBusy] = useState(false)

  /** 读取当前分支名；不是仓库时留空，工具栏照常显示。 */
  const loadBranch = useCallback(async (): Promise<void> => {
    if (root === '') {
      setBranch('')

      return
    }

    setBusy(true)

    try {
      const result = await readRefs(root)
      setBranch(result.ok ? result.value.head : '')
    } finally {
      setBusy(false)
    }
  }, [root])

  useEffect(() => {
    void loadBranch()
  }, [loadBranch])

  // 面板里的写操作（提交、切换分支）后分支会变，跟着重读
  useEffect(() => services.subscribeGitStatus(() => void loadBranch()), [loadBranch, services])

  // 工作区目录名比完整路径更适合放在工具栏上，和 IDEA 的项目名位置一致
  const projectName = useMemo(() => {
    if (root === '') return t('shell.noProject')

    const parts = root.split('/').filter((part) => part !== '')

    return parts.length === 0 ? root : (parts[parts.length - 1] ?? root)
  }, [root, t])

  return (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line1 bg-surface1 pl-3 pr-2">
      {/* 项目名：IDEA 里这里放运行配置下拉，工作台只有工程维度 */}
      <span className="max-w-40 truncate text-xs text-secondary">{projectName}</span>

      <Divider />

      {/* 当前分支：点开进入 Git 的提交历史 */}
      <button
        type="button"
        title={t('shell.showLog')}
        onClick={() => services.openBottomPanel('git')}
        className="flex h-6 items-center gap-1 rounded px-1.5 text-xs text-primary transition-colors hover:bg-surface2"
      >
        {branchIcon()}

        <span className="max-w-40 truncate font-medium">{branch === '' ? t('shell.detachedHead') : branch}</span>

        {chevronDownIcon()}
      </button>

      <Divider />

      {/* Git 常用动作：刷新工作区状态，其余入口都落在 Git 面板的对应页签 */}
      <ToolButton
        label={busy ? t('shell.refreshing') : t('shell.refresh')}
        onClick={() => {
          void loadBranch()
          services.refreshGitStatus()
        }}
      >
        {refreshIcon()}
      </ToolButton>

      <ToolButton label={t('shell.commit')} onClick={() => services.openBottomPanel('git')}>
        {sortIcon()}
      </ToolButton>

      <span className="flex-1" />

      {/* 全局视图开关 */}
      <ToolButton label={t('shell.commandPalette')} onClick={() => services.openPage('settings')}>
        {searchIcon()}
      </ToolButton>

      <ToolButton label={t('shell.settings')} onClick={() => services.openPage('settings')}>
        {gearIcon()}
      </ToolButton>
    </div>
  )
}

/** 工具栏图标按钮。 */
function ToolButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick(): void
  children: React.ReactNode
}): React.ReactElement {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded text-secondary transition-colors',
        'hover:bg-surface2 hover:text-primary',
      )}
    >
      {children}
    </button>
  )
}

/** 分组之间的细竖线。 */
function Divider(): React.ReactElement {
  return <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-line1" />
}
