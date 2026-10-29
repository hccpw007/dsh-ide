/**
 * 运行面板左侧的配置树。
 *
 * 结构照 IDEA 的 Services 面板：顶部一行新建入口，下面平铺各条配置，配置下挂它跑
 * 出来的实例。选中实例时右侧显示它的输出。
 */
import React from 'react'

import { cn } from '../../../common/cn'
import type { Translate } from '../../../types/plugin'

import { pencilIcon, trashIcon } from '../git/icons'

import type { RunConfig, RunProcess } from './api'

/** 配置树 props。 */
export interface RunTreeProps {
  /** 全部配置。 */
  configs: RunConfig[]
  /** 全部实例。 */
  processes: RunProcess[]
  /** 当前选中的实例 id。 */
  activeId: string
  /** 选中实例。 */
  onSelect(id: string): void
  /** 右键配置：运行、编辑、删除。 */
  onConfigMenu(config: RunConfig, event: React.MouseEvent): void
  /** 行尾编辑按钮。 */
  onEdit(config: RunConfig): void
  /** 行尾删除按钮。 */
  onDelete(config: RunConfig): void
  /** 新建配置。 */
  onNew(): void
  /** 翻译函数。 */
  t: Translate
}

/**
 * 渲染配置树。
 * @param props 见 RunTreeProps
 * @returns 左侧树
 */
export function RunTree({
  configs,
  processes,
  activeId,
  onSelect,
  onConfigMenu,
  onEdit,
  onDelete,
  onNew,
  t,
}: RunTreeProps): React.ReactElement {
  return (
    <div className="py-1">
      {/* 新建入口放在列表上方，和 IDEA 的「+」位置一致 */}
      <button
        type="button"
        onClick={onNew}
        className="flex w-full items-center gap-2 px-2 py-1 text-left text-sm leading-5 text-secondary transition-colors hover:bg-surface2 hover:text-primary"
      >
        {plusIcon()}

        <span className="truncate">{t('newConfig')}</span>
      </button>

      {configs.length === 0 && <div className="px-2 py-2 text-xs text-secondary">{t('noConfigs')}</div>}

      {configs.map((config) => {
        // 一个配置始终只占一行：优先指向运行中的实例，否则指向最后一次运行
        const instances = processes.filter((item) => item.configId === config.id)
        const instance = instances.find((item) => item.state === 'running') ?? instances[instances.length - 1] ?? null
        const selected = instance !== null && instance.id === activeId
        const running = instance !== null && instance.state === 'running'

        return (
          <div
            key={config.id}
            role="button"
            tabIndex={0}
            onClick={() => instance !== null && onSelect(instance.id)}
            onContextMenu={(event) => onConfigMenu(config, event)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && instance !== null) onSelect(instance.id)
            }}
            title={config.command}
            className={cn(
              'group flex w-full items-center gap-2 px-2 py-1 text-left text-sm leading-5 transition-colors',
              selected ? 'bg-info/35 text-primary' : 'text-primary hover:bg-surface2',
              instance === null && 'cursor-default',
            )}
          >
            {/* 运行中显示停止按钮，其余显示空心播放三角；文字一律不用灰色 */}
            <span
              className={cn(
                'flex w-5 shrink-0 items-center justify-center',
                running ? 'text-danger' : 'text-success',
                instance !== null && !running && 'opacity-55',
              )}
            >
              {running ? stopIcon() : playIcon()}
            </span>

            <span className="min-w-0 flex-1 truncate">{config.name}</span>

            {/* 行尾动作：与顶部配置下拉的编辑/删除保持一致 */}
            <span className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                title={t('edit')}
                aria-label={t('edit')}
                onClick={(event) => {
                  event.stopPropagation()
                  onEdit(config)
                }}
                className="flex h-6 w-6 items-center justify-center rounded text-secondary opacity-70 transition hover:bg-surface3 hover:opacity-100"
              >
                {pencilIcon(16)}
              </button>

              <button
                type="button"
                title={t('delete')}
                aria-label={t('delete')}
                onClick={(event) => {
                  event.stopPropagation()
                  onDelete(config)
                }}
                className="flex h-6 w-6 items-center justify-center rounded text-danger opacity-70 transition hover:bg-surface3 hover:opacity-100"
              >
                {trashIcon(16)}
              </button>
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** 新建入口前的加号。 */
function plusIcon(): React.ReactNode {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M8 3.4v9.2M3.4 8h9.2" />
    </svg>
  )
}

/** 未运行时的播放标记：空心三角，比实心小一号。 */
function playIcon(): React.ReactNode {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5.2 3.4 12.4 8 5.2 12.6z" />
    </svg>
  )
}

/** 运行中的停止按钮：红底圆角方块里套一个白色空心方框。 */
function stopIcon(): React.ReactNode {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="1" y="1" width="14" height="14" rx="3.6" fill="currentColor" />
      <rect
        x="4.7"
        y="4.7"
        width="6.6"
        height="6.6"
        rx="1.2"
        fill="none"
        stroke="var(--dsw-static-neutral-bluish-00)"
        strokeWidth="1.3"
      />
    </svg>
  )
}
