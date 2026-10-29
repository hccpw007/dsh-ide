/**
 * 运行面板左侧的配置树。
 *
 * 结构照 IDEA 的 Services 面板：顶部一行新建入口，下面平铺各条配置，配置下挂它跑
 * 出来的实例。选中实例时右侧显示它的输出。
 */
import React from 'react'

import { cn } from '../../../common/cn'
import type { Translate } from '../../../types/plugin'

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
export function RunTree({ configs, processes, activeId, onSelect, onConfigMenu, onNew, t }: RunTreeProps): React.ReactElement {
  return (
    <div className="py-1">
      {/* 新建入口放在列表上方，和 IDEA 的「+」位置一致 */}
      <button
        type="button"
        onClick={onNew}
        className="flex w-full items-center gap-1.5 px-2 py-[3px] text-left text-xs text-secondary transition-colors hover:bg-surface2 hover:text-primary"
      >
        {plusIcon()}

        <span className="truncate">{t('newConfig')}</span>
      </button>

      {configs.length === 0 && <div className="px-2 py-2 text-xs text-secondary">{t('noConfigs')}</div>}

      {configs.map((config) => {
        // 一个配置可能跑出多个实例；没有实例时只显示配置本身
        const instances = processes.filter((item) => item.configId === config.id)
        const rows = instances.length === 0 ? [null] : instances

        return rows.map((instance) => {
          const selected = instance !== null && instance.id === activeId

          return (
            <button
              key={`${config.id}:${instance?.id ?? 'idle'}`}
              type="button"
              onClick={() => instance !== null && onSelect(instance.id)}
              onContextMenu={(event) => onConfigMenu(config, event)}
              title={config.command}
              className={cn(
                'flex w-full items-center gap-1.5 px-2 py-[3px] text-left text-xs transition-colors',
                selected ? 'bg-info/35 text-primary' : 'text-primary hover:bg-surface2',
                instance === null && 'cursor-default opacity-50',
              )}
            >
              {/* 运行中用绿色播放标记，已结束用灰色，和 IDEA 的服务状态一致 */}
              <span
                className={cn(
                  'shrink-0',
                  instance === null
                    ? 'text-secondary'
                    : instance.state === 'running'
                      ? 'text-success'
                      : 'text-secondary',
                )}
              >
                {runMarkIcon()}
              </span>

              <span className="min-w-0 flex-1 truncate">{config.name}</span>

              {instance !== null && instance.state !== 'running' && (
                <span className="shrink-0 text-[10px] text-secondary">{instance.exitCode ?? '–'}</span>
              )}
            </button>
          )
        })
      })}
    </div>
  )
}

/** 新建入口前的加号。 */
function plusIcon(): React.ReactNode {
  return (
    <svg
      width="12"
      height="12"
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

/** 实例前的播放标记。 */
function runMarkIcon(): React.ReactNode {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M4.8 3 12.4 8l-7.6 5z" />
    </svg>
  )
}
