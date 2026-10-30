/**
 * 顶部主工具栏。
 *
 * 对应 IDEA 新 UI 顶部的主工具条，从左到右依次是：运行配置下拉、运行/调试/更多、
 * 目标配置、当前分支，以及一排 Git 与视图动作。工作台没有 IDEA 的「部署目标」
 * 概念，那一格用当前工程名代替，位置与观感保持一致。
 *
 * 外壳只做接线：按钮要么转成服务总线上的意图，要么调只读接口；工具栏自身不保存
 * 业务状态。分支名与运行配置走各自的轻量请求，与底部面板共用同一份宿主数据。
 */
import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

import { cn } from '../../common/cn'
import { openIdeContextMenu } from '../../common/context-menu'
import { ConfirmDialog, type ConfirmRequest } from '../common/ConfirmDialog'
import type { Translate } from '../../types/plugin'

import { readRefs } from '../features/git/api'
import { BranchPopup } from '../features/git/BranchPopup'
import {
  branchIcon,
  chevronDownIcon,
  clockIcon,
  gearIcon,
  kebabIcon,
  nodeLineIcon,
  pencilIcon,
  pushIcon,
  refreshIcon,
  rollbackIcon,
  searchIcon,
  trashIcon,
  updateIcon,
} from '../features/git/icons'
import { ContextMenu, type MenuItem, type MenuState } from '../features/git/menu'
import { deleteRunConfig, readRunConfigs, startRun, type RunConfig } from '../features/run/api'
import type { WorkbenchServices } from './services'

/** 下拉菜单宽度：要放得下长配置名，比右键菜单宽。 */
const CONFIG_MENU_WIDTH = 260

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
  const [configs, setConfigs] = useState<RunConfig[]>([])
  /** 当前选中的运行配置 id；空串表示没有配置可选。 */
  const [configId, setConfigId] = useState('')
  const [menu, setMenu] = useState<MenuState | null>(null)
  /** 待确认的危险操作；非空时弹出确认框。 */
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null)
  /** 分支弹窗的位置；null 表示关闭。 */
  const [branchPopup, setBranchPopup] = useState<{ x: number; y: number } | null>(null)

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

  /** 读取运行配置；宿主按工作目录分组，切换会话后要重读。 */
  const loadConfigs = useCallback(async (): Promise<void> => {
    // 配置按工作空间隔离：切换工作目录后必须重读，不能沿用上一份
    if (root === '') {
      setConfigs([])
      setConfigId('')

      return
    }

    const result = await readRunConfigs(root)

    if (!result.ok) {
      // 读不到配置不影响工具栏其它按钮，留空即可
      setConfigs([])

      return
    }

    setConfigs(result.value.configs)
    setConfigId((previous) => {
      // 选中的配置被删掉时回落到第一条，避免下拉显示空白
      if (result.value.configs.some((item) => item.id === previous)) return previous

      return result.value.configs[0]?.id ?? ''
    })
  }, [root])

  useEffect(() => {
    void loadBranch()
    void loadConfigs()
  }, [loadBranch, loadConfigs])

  // 面板里的写操作（提交、切换分支、增删配置）后分支与配置都可能变，跟着重读
  useEffect(() => services.subscribeGitStatus(() => void loadBranch()), [loadBranch, services])
  useEffect(() => services.subscribeInvalidate(() => void loadConfigs()), [loadConfigs, services])

  const activeConfig = configs.find((item) => item.id === configId) ?? null

  /**
   * 删除一条运行配置。
   * @param config 待删除的配置
   */
  const removeConfig = useCallback(
    (config: RunConfig): void => {
      setConfirm({
        title: t('shell.deleteConfigurationTitle'),
        message: t('shell.deleteConfigurationConfirm').replace('{name}', config.name),
        confirmLabel: t('shell.deleteConfiguration'),
        cancelLabel: t('shell.cancel'),
        danger: true,
        run: () => {
          void deleteRunConfig(root, config.id).then((result) => {
            if (!result.ok) {
              services.notify('error', result.error.message)

              return
            }

            void loadConfigs()
          })
        },
      })
    },
    [loadConfigs, root, services, t],
  )

  /**
   * 打开运行配置下拉。
   * @param event 鼠标事件
   */
  const openConfigMenu = useCallback(
    (event: React.MouseEvent): void => {
      const { left, bottom } = event.currentTarget.getBoundingClientRect()
      const items: MenuItem[] = configs.map((config) => ({
        id: config.id,
        label: config.name,
        // 当前选中的那条换成勾选标记，和 IDEA 的下拉一致
        icon: config.id === configId ? checkIcon() : configIcon(),
        run: () => setConfigId(config.id),
        actions: [
          {
            id: 'edit',
            title: t('shell.editConfiguration'),
            icon: pencilIcon(16),
            // 交给运行面板带出表单，避免在工具栏里再造一套编辑界面
            run: () => services.requestRunConfigEdit(config.id),
          },
          {
            id: 'delete',
            title: t('shell.deleteConfiguration'),
            icon: trashIcon(16),
            danger: true,
            run: () => void removeConfig(config),
          },
        ],
      }))

      items.push({
        id: 'add',
        label: t('shell.addConfiguration'),
        highlight: true,
        separatorBefore: true,
        // 打开运行面板并直接进入新建表单
        run: () => services.requestRunConfigCreate(),
      })

      setMenu({ x: left, y: bottom + 4, items, minWidth: CONFIG_MENU_WIDTH })
    },
    [configId, configs, removeConfig, services, t],
  )

  /** 运行当前配置；没有配置时直接打开运行面板去创建。 */
  const runActiveConfig = useCallback((): void => {
    if (activeConfig === null) {
      services.openBottomPanel('run')

      return
    }

    void startRun(root, activeConfig.id).then((result) => {
      if (!result.ok) {
        services.notify('error', result.error.message)

        return
      }

      services.openBottomPanel('run')
    })
  }, [activeConfig, root, services])

  /**
   * 打开运行相关的更多操作。
   * @param event 鼠标事件
   */
  const openMoreMenu = useCallback(
    (event: React.MouseEvent): void => {
      const items: MenuItem[] = [
        { id: 'run', label: t('shell.run'), run: runActiveConfig },
        { id: 'configs', label: t('shell.addConfiguration'), run: () => services.openBottomPanel('run') },
        {
          id: 'refresh',
          label: t('shell.refresh'),
          separatorBefore: true,
          run: () => {
            void loadBranch()
            void loadConfigs()
            services.refreshGitStatus()
          },
        },
      ]

      setMenu({ x: event.clientX, y: event.clientY + 24, items })
    },
    [loadBranch, loadConfigs, runActiveConfig, services, t],
  )

  return (
    <div
      className="flex h-9 shrink-0 items-center gap-0.5 border-b border-line1 bg-surface1 pl-2 pr-2"
      // 工具栏右键：前几项对应 IDEA 的工具栏自定义，当前不可用，先保留结构
      onContextMenu={(event) =>
        openIdeContextMenu(event, services, [
          { id: 'customizeToolbar', label: t('shell.menuCustomizeToolbar') },
          { id: 'showToolbar', label: t('shell.menuShowToolbar') },
          { id: 'hideToolbar', label: t('shell.menuHideToolbar') },
          {
            id: 'settings',
            label: t('shell.settings'),
            shortcut: '⌘,',
            separatorBefore: true,
            run: () => services.openPage('settings'),
          },
        ])
      }
    >
      {/* 运行配置下拉：IDEA 顶栏的第一格 */}
      <button
        type="button"
        title={t('shell.runConfiguration')}
        onClick={openConfigMenu}
        className="flex h-6 max-w-64 items-center gap-1.5 rounded px-1.5 text-xs text-primary transition-colors hover:bg-surface2"
      >
        {configIcon()}

        <span className="truncate">{activeConfig?.name ?? t('shell.noConfiguration')}</span>

        {chevronDownIcon()}
      </button>

      <ToolButton label={t('shell.run')} onClick={runActiveConfig} tone="success">
        {playIcon()}
      </ToolButton>

      <ToolButton label={t('shell.moreActions')} onClick={openMoreMenu}>
        {kebabIcon()}
      </ToolButton>

      <Divider />

      {/* 当前分支：点开 IDEA 式的分支选择弹窗 */}
      <button
        type="button"
        title={t('shell.selectBranch')}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          setBranchPopup({ x: rect.left, y: rect.bottom + 4 })
        }}
        className="flex h-6 max-w-56 items-center gap-1.5 rounded px-1.5 text-xs text-primary transition-colors hover:bg-surface2"
      >
        {branchIcon()}

        <span className="truncate font-medium">{branch === '' ? t('shell.detachedHead') : branch}</span>

        {chevronDownIcon()}
      </button>

      <Divider />

      {/* Git 与视图动作，顺序照截图 */}
      <ToolButton label={t('shell.add')} onClick={() => services.openBottomPanel('git')}>
        {plusIcon()}
      </ToolButton>

      <ToolButton
        label={busy ? t('shell.refreshing') : t('shell.updateProject')}
        onClick={() => {
          void loadBranch()
          services.refreshGitStatus()
        }}
      >
        {updateIcon()}
      </ToolButton>

      <ToolButton label={t('shell.push')} onClick={() => services.openBottomPanel('git')}>
        {pushIcon()}
      </ToolButton>

      <ToolButton label={t('shell.commit')} onClick={() => services.openBottomPanel('git')}>
        {nodeLineIcon()}
      </ToolButton>

      <ToolButton label={t('shell.showDiff')} onClick={() => services.openBottomPanel('git')}>
        {swapArrowsIcon()}
      </ToolButton>

      {/* 回滚：与相邻按钮一样先跳到 Git 面板，由面板按选中项执行回滚 */}
      <ToolButton label={t('shell.rollback')} onClick={() => services.openBottomPanel('git')}>
        {rollbackIcon()}
      </ToolButton>

      <ToolButton label={t('shell.showHistory')} onClick={() => services.openBottomPanel('git')}>
        {clockIcon()}
      </ToolButton>

      <Divider />

      <div className="flex items-center gap-0.5">
        <ToolButton
          label={t('shell.refresh')}
          onClick={() => {
            void loadBranch()
            void loadConfigs()
            services.refreshGitStatus()
          }}
        >
          {refreshIcon()}
        </ToolButton>
      </div>

      <span className="flex-1" />

      <ToolButton label={t('shell.commandPalette')} onClick={() => services.openPage('settings')}>
        {searchIcon()}
      </ToolButton>

      <ToolButton label={t('shell.settings')} onClick={() => services.openPage('settings')}>
        {gearIcon()}
      </ToolButton>

      {menu !== null && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}

      {/* 分支选择弹窗：定位在分支按钮下方，切换成功后刷新工具栏上的分支名 */}
      {branchPopup !== null && (
        <BranchPopup
          t={t}
          services={services}
          head={branch}
          anchor={branchPopup}
          onClose={() => setBranchPopup(null)}
          onCheckedOut={() => void loadBranch()}
        />
      )}

      {confirm !== null && <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />}
    </div>
  )
}

/** 工具栏图标按钮。 */
function ToolButton({
  label,
  onClick,
  unavailable,
  tone,
  children,
}: {
  label: string
  onClick?(event: React.MouseEvent): void
  /** 不可用的原因；有值时按钮禁用，并拼进悬停提示。 */
  unavailable?: string
  /** 强调色调：运行按钮用绿色，回滚等危险动作用红色。 */
  tone?: 'success' | 'danger'
  children: React.ReactNode
}): React.ReactElement {
  const disabled = unavailable !== undefined

  return (
    <button
      type="button"
      title={disabled ? `${label} — ${unavailable}` : label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded transition-colors',
        disabled
          ? 'cursor-default text-secondary/40'
          : tone === 'success'
            ? 'text-success hover:bg-surface2'
            : tone === 'danger'
              ? 'text-danger hover:bg-surface2'
              : 'text-secondary hover:bg-surface2 hover:text-primary',
      )}
    >
      {children}
    </button>
  )
}

/** 分组之间的细竖线。 */
function Divider(): React.ReactElement {
  return <span aria-hidden="true" className="mx-1 h-4 w-px bg-line1" />
}

/** 运行配置前的项目标记：一个带勾的方框。 */
function configIcon(): React.ReactNode {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M2.6 13.4V4.2h4l1.6 1.8h5.2v7.4z" />
      <path d="m5.4 9.6 1.6 1.6 3.2-3.2" />
    </svg>
  )
}

/** 运行配置下拉里当前选中项的勾选标记。 */
function checkIcon(): React.ReactNode {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="m3.4 8.4 3 3 6.2-6.4" />
    </svg>
  )
}

/** 运行：实心三角。 */
function playIcon(): React.ReactNode {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className="shrink-0">
      <path d="M4.6 2.8 13 8l-8.4 5.2z" />
    </svg>
  )
}

/** 新建：加号。 */
function plusIcon(): React.ReactNode {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M8 3v10M3 8h10" />
    </svg>
  )
}

/** 查看历史：一上一下两条带箭头的横线。 */
function swapArrowsIcon(): React.ReactNode {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M13 5.3H3M5.6 2.6 2.9 5.3l2.7 2.7" />
      <path d="M3 10.7h10M10.4 8l2.7 2.7-2.7 2.7" />
    </svg>
  )
}
