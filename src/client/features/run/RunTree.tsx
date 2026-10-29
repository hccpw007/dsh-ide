/**
 * 运行面板左侧的服务树。
 *
 * 结构照 IDEA 的 Services 面板：按命令类型分组（npm / pnpm / node / Shell），
 * 组内是配置，配置下挂它跑出来的实例。选中实例时右侧显示它的输出。
 */
import React from 'react'

import { cn } from '../../../common/cn'
import type { Translate } from '../../../types/plugin'

import type { RunConfig, RunProcess } from './api'

/** 树上的一个分组。 */
export interface RunGroup {
  /** 分组名，取自命令首词。 */
  name: string
  /** 组内配置。 */
  configs: RunConfig[]
}

/**
 * 按命令首词给配置分组。
 * @param configs 配置列表
 * @returns 分组列表，保持配置原有顺序
 */
export function groupConfigs(configs: RunConfig[]): RunGroup[] {
  const groups = new Map<string, RunConfig[]>()

  for (const config of configs) {
    const word = config.command.trim().split(/\s+/)[0] ?? ''
    const base = word.split('/').pop() ?? word
    // 认得的运行器单独成组，其余归到 Shell，避免出现一长串一次性分组名
    const name = ['npm', 'pnpm', 'yarn', 'node', 'npx', 'bun'].includes(base) ? base : 'Shell'
    const bucket = groups.get(name)

    if (bucket === undefined) {
      groups.set(name, [config])

      continue
    }

    bucket.push(config)
  }

  return Array.from(groups, ([name, items]) => ({ name, configs: items }))
}

/** 服务树 props。 */
export interface RunTreeProps {
  /** 分组后的配置。 */
  groups: RunGroup[]
  /** 全部实例。 */
  processes: RunProcess[]
  /** 当前选中的实例 id。 */
  activeId: string
  /** 选中实例。 */
  onSelect(id: string): void
  /** 折叠分组。 */
  onToggleGroup(name: string): void
  /** 右键配置：编辑、删除等。 */
  onConfigMenu(config: RunConfig, event: React.MouseEvent): void
  /** 已折叠的分组名。 */
  collapsed: ReadonlySet<string>
  /** 翻译函数。 */
  t: Translate
}

/**
 * 渲染服务树。
 * @param props 见 RunTreeProps
 * @returns 左侧树
 */
export function RunTree({
  groups,
  processes,
  activeId,
  onSelect,
  onToggleGroup,
  onConfigMenu,
  collapsed,
  t,
}: RunTreeProps): React.ReactElement {
  if (groups.length === 0) {
    return <div className="px-3 py-2 text-xs text-secondary">{t('noConfigs')}</div>
  }

  return (
    <div className="py-1">
      {groups.map((group) => {
        const isCollapsed = collapsed.has(group.name)

        return (
          <div key={group.name}>
            {/* 分组头：箭头 + 图标 + 名称 */}
            <button
              type="button"
              onClick={() => onToggleGroup(group.name)}
              className="flex w-full items-center gap-1 px-1.5 py-[3px] text-left text-xs text-primary transition-colors hover:bg-surface2"
            >
              {chevronIcon(!isCollapsed)}

              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-info/15">
                {nodeIcon()}
              </span>

              <span className="truncate font-medium">{group.name}</span>
            </button>

            {!isCollapsed &&
              group.configs.map((config) =>
                // 一个配置可能跑出多个实例；没有实例时只显示配置本身
                (() => {
                  const instances = processes.filter((item) => item.configId === config.id)
                  const rows = instances.length === 0 ? [null] : instances

                  return rows.map((instance) => {
                    const key = `${config.id}:${instance?.id ?? 'idle'}`
                    const selected = instance !== null && instance.id === activeId

                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => instance !== null && onSelect(instance.id)}
                        onContextMenu={(event) => onConfigMenu(config, event)}
                        title={config.command}
                        className={cn(
                          'flex w-full items-center gap-1.5 py-[3px] pl-6 pr-2 text-left text-xs transition-colors',
                          selected
                            ? 'bg-info/35 text-primary'
                            : 'text-primary hover:bg-surface2',
                          instance === null && 'cursor-default opacity-50',
                        )}
                      >
                        {/* 运行中用绿色的播放标记，已结束用灰色，和 IDEA 的服务状态一致 */}
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
                })(),
              )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * 分组前的折叠箭头。
 * @param expanded 是否展开
 * @returns 图标
 */
function chevronIcon(expanded: boolean): React.ReactNode {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn('shrink-0 text-secondary', !expanded && '-rotate-90')}
    >
      <path d="m4 6.5 4 4 4-4" />
    </svg>
  )
}

/** 分组前的运行器标记。 */
function nodeIcon(): React.ReactNode {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M8 2.2 13.4 5v6L8 13.8 2.6 11V5z" />
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
