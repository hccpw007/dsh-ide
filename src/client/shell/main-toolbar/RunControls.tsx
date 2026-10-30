/**
 * 顶部工具栏的运行配置区。
 *
 * 从左到右是 IDEA 顶栏第一格的三件套：运行配置下拉、运行按钮、更多操作。
 * 配置列表来自宿主的运行配置服务，按工作目录隔离；本组件只负责读取、选中与启动，
 * 新建和编辑交给运行面板，避免在工具栏里再造一套表单。
 */
import React, { useCallback, useEffect, useState } from 'react'

import type { Translate } from '../../../types/plugin'
import { ConfirmDialog, type ConfirmRequest } from '../../common/ConfirmDialog'
import { chevronDownIcon, kebabIcon, pencilIcon, trashIcon } from '../../features/git/icons'
import { ContextMenu, type MenuItem, type MenuState } from '../../features/git/menu'
import { deleteRunConfig, readRunConfigs, startRun, type RunConfig } from '../../features/run/api'
import type { WorkbenchServices } from '../services'

import { checkIcon, configIcon, playIcon } from './icons'
import { ToolButton } from './ToolButton'

/** 下拉菜单宽度：要放得下长配置名，比右键菜单宽。 */
const CONFIG_MENU_WIDTH = 260

/** 运行配置区 props。 */
export interface RunControlsProps {
  /** 外壳翻译函数。 */
  t: Translate
  /** 工作台服务总线。 */
  services: WorkbenchServices
  /** 工作区根。 */
  root: string
}

/**
 * 渲染运行配置下拉、运行按钮与更多操作。
 * @param props 见 RunControlsProps
 * @returns 工具栏左侧的一组运行控件
 */
export function RunControls({ t, services, root }: RunControlsProps): React.ReactElement {
  const [configs, setConfigs] = useState<RunConfig[]>([])
  /** 当前选中的运行配置 id；空串表示没有配置可选。 */
  const [configId, setConfigId] = useState('')
  const [menu, setMenu] = useState<MenuState | null>(null)
  /** 待确认的危险操作；非空时弹出确认框。 */
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null)

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
    void loadConfigs()
  }, [loadConfigs])

  // 面板里的写操作（增删配置）后配置列表会变，跟着重读
  useEffect(() => services.subscribeInvalidate(() => void loadConfigs()), [loadConfigs, services])

  const activeConfig = configs.find((item) => item.id === configId) ?? null

  /**
   * 删除一条运行配置。
   * @param config 待删除的配置
   */
  const removeConfig = useCallback(
    (config: RunConfig): void => {
      setConfirm({
        // 确认框标题：删除运行配置
        title: t('shell.deleteConfigurationTitle'),
        message: t('shell.deleteConfigurationConfirm').replace('{name}', config.name),
        // 确认按钮：删除配置
        confirmLabel: t('shell.deleteConfiguration'),
        // 取消按钮：放弃删除
        cancelLabel: t('shell.cancel'),
        danger: true,
        run: () => {
          void deleteRunConfig(root, config.id).then((result) => {
            if (!result.ok) {
              services.toast('error', result.error.message)

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
        services.toast('error', result.error.message)

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
        // 运行当前配置
        { id: 'run', label: t('shell.run'), run: runActiveConfig },
        // 新建运行配置：打开运行面板
        { id: 'configs', label: t('shell.addConfiguration'), run: () => services.openBottomPanel('run') },
        {
          // 刷新分支与配置
          id: 'refresh',
          label: t('shell.refresh'),
          separatorBefore: true,
          run: () => {
            void loadConfigs()
            services.refreshGitStatus()
          },
        },
      ]

      setMenu({ x: event.clientX, y: event.clientY + 24, items })
    },
    [loadConfigs, runActiveConfig, services, t],
  )

  return (
    <>
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

      {/* 运行当前配置 */}
      <ToolButton label={t('shell.run')} onClick={runActiveConfig} tone="success">
        {playIcon()}
      </ToolButton>

      {/* 更多运行操作 */}
      <ToolButton label={t('shell.moreActions')} onClick={openMoreMenu}>
        {kebabIcon()}
      </ToolButton>

      {menu !== null && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}

      {confirm !== null && <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />}
    </>
  )
}
