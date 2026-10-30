/**
 * Log 页签左侧的分支树。
 *
 * 与 IDEA 的 Log 左树一致：搜索框、HEAD 入口、Local / Remote / Tags 分组。
 * 点击分支切换日志范围，右键交给外层弹菜单。
 */
import React, { useMemo, useState } from 'react'

import { cn } from '../../../common/cn'
import type { Translate } from '../../../types/plugin'

import type { GitRefs } from './api'
import { branchIcon, chevronDownIcon, chevronRightIcon, searchIcon, starIcon } from './icons'

/** 分支树 props。 */
export interface BranchTreeProps {
  /** 已绑定 git 前缀的翻译函数。 */
  t: Translate
  /** 分支、远程与标签；未读取到时为 null。 */
  refs: GitRefs | null
  /** 当前过滤的分支名；空串表示 HEAD。 */
  active: string
  /** 搜索内容。 */
  search: string
  /** 搜索变化。 */
  onSearchChange(value: string): void
  /** 选择分支。 */
  onSelect(branch: string): void
  /** 右键分支；target 为分支短名。 */
  onContextMenu(event: React.MouseEvent, target: string): void
  /** 树宽度（px），由与提交列表之间的分隔条拖动改变。 */
  width: number
}

/**
 * 渲染分支树。
 * @param props 见 BranchTreeProps
 * @returns 搜索框与分组树
 */
export function BranchTree({
  t,
  refs,
  active,
  search,
  onSearchChange,
  onSelect,
  onContextMenu,
  width,
}: BranchTreeProps): React.ReactElement {
  const [closed, setClosed] = useState<ReadonlySet<string>>(() => new Set())

  const keyword = search.trim().toLowerCase()

  const locals = useMemo(
    () => (refs?.local ?? []).filter((branch) => keyword === '' || branch.name.toLowerCase().includes(keyword)),
    [refs, keyword],
  )
  const tags = useMemo(
    () => (refs?.tags ?? []).filter((tag) => keyword === '' || tag.name.toLowerCase().includes(keyword)),
    [refs, keyword],
  )
  const remotes = useMemo(() => {
    const groups = new Map<string, { name: string; hash: string }[]>()

    for (const branch of refs?.remote ?? []) {
      if (keyword !== '' && !branch.name.toLowerCase().includes(keyword)) continue

      const slash = branch.name.indexOf('/')
      const remote = slash < 0 ? 'origin' : branch.name.slice(0, slash)
      const list = groups.get(remote) ?? []
      list.push(branch)
      groups.set(remote, list)
    }

    return [...groups.entries()]
  }, [refs, keyword])

  /**
   * 折叠/展开一个分组。
   * @param key 分组键
   */
  const toggle = (key: string): void => {
    setClosed((previous) => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)

      return next
    })
  }

  /**
   * 判断分组是否展开。
   * @param key 分组键
   * @returns 展开时返回 true
   */
  const isOpen = (key: string): boolean => !closed.has(key)

  return (
    <aside className="flex shrink-0 flex-col border-r border-line1" style={{ width }}>
      {/* 分支搜索：只过滤左侧树，提交列表有独立的文本搜索 */}
      <div className="shrink-0 border-b border-line1 p-1.5">
        <div className="flex h-6 items-center gap-1 rounded border border-line1 bg-base px-1.5">
          <span className="text-secondary">{searchIcon()}</span>
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t('branchOrTag')}
            className="min-w-0 flex-1 bg-transparent text-[11px] text-primary outline-none placeholder:text-secondary"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto py-1">
        {/* HEAD 入口：看当前检出分支的日志 */}
        <button
          type="button"
          onClick={() => onSelect('')}
          className={cn(
            'flex h-6 w-full items-center gap-1.5 pl-2 pr-2 text-left text-xs',
            active === '' ? 'bg-info/25 text-primary' : 'text-primary hover:bg-surface2/70',
          )}
        >
          <span className="flex w-4 justify-center text-success">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
              <circle cx="8" cy="8" r="5" />
              <circle cx="8" cy="8" r="1.6" fill="currentColor" stroke="none" />
            </svg>
          </span>
          <span className="truncate">{t('headCurrent')}</span>
        </button>

        <GroupHeader label={t('local')} open={isOpen('local')} onToggle={() => toggle('local')} />

        {isOpen('local') &&
          locals.map((branch) => (
            <button
              key={branch.name}
              type="button"
              title={branch.subject}
              onClick={() => onSelect(branch.name)}
              onContextMenu={(event) => {
                event.preventDefault()
                onContextMenu(event, branch.name)
              }}
              className={cn(
                'flex h-6 w-full items-center gap-1.5 pl-5 pr-2 text-left text-xs',
                active === branch.name ? 'bg-info/25 text-primary' : 'text-primary hover:bg-surface2/70',
              )}
            >
              <span className={cn('flex w-3.5 justify-center', branch.isHead ? 'text-info' : 'text-secondary')}>
                {branchIcon()}
              </span>
              <span className="min-w-0 truncate">{branch.name}</span>

              {/* 领先/落后上游的数量，与 IDEA 的箭头一致 */}
              {(branch.ahead > 0 || branch.behind > 0) && (
                <span className="shrink-0 text-[10px] text-secondary">
                  {branch.ahead > 0 ? `↑${String(branch.ahead)}` : ''}
                  {branch.behind > 0 ? `↓${String(branch.behind)}` : ''}
                </span>
              )}
            </button>
          ))}

        <GroupHeader label={t('remote')} open={isOpen('remote')} onToggle={() => toggle('remote')} />

        {isOpen('remote') &&
          remotes.map(([remote, branches]) => (
            <div key={remote}>
              <button
                type="button"
                onClick={() => toggle(`remote:${remote}`)}
                className="flex h-6 w-full items-center gap-1 pl-4 pr-2 text-left text-xs text-secondary hover:bg-surface2/70 hover:text-primary"
              >
                <span className="flex w-3.5 justify-center">
                  {isOpen(`remote:${remote}`) ? chevronDownIcon() : chevronRightIcon()}
                </span>
                <span className="truncate">{remote}</span>
              </button>

              {isOpen(`remote:${remote}`) &&
                branches.map((branch) => {
                  const short = branch.name.slice(remote.length + 1)
                  const currentRemote = refs?.head !== undefined && short === refs.head

                  return (
                    <button
                      key={branch.name}
                      type="button"
                      onClick={() => onSelect(branch.name)}
                      onContextMenu={(event) => {
                        event.preventDefault()
                        onContextMenu(event, branch.name)
                      }}
                      className={cn(
                        'flex h-6 w-full items-center gap-1.5 pl-9 pr-2 text-left text-xs',
                        active === branch.name ? 'bg-info/25 text-primary' : 'text-primary hover:bg-surface2/70',
                      )}
                    >
                      <span className="min-w-0 truncate">{short}</span>

                      {/* 当前分支对应的远程分支打星，和 IDEA 一致 */}
                      {currentRemote && <span className="shrink-0 text-warn">{starIcon()}</span>}
                    </button>
                  )
                })}
            </div>
          ))}

        <GroupHeader label={t('tags')} open={isOpen('tags')} onToggle={() => toggle('tags')} />

        {isOpen('tags') &&
          tags.map((tag) => (
            <button
              key={tag.name}
              type="button"
              onClick={() => onSelect(tag.name)}
              onContextMenu={(event) => {
                event.preventDefault()
                onContextMenu(event, tag.name)
              }}
              className={cn(
                'flex h-6 w-full items-center gap-1.5 pl-5 pr-2 text-left text-xs',
                active === tag.name ? 'bg-info/25 text-primary' : 'text-primary hover:bg-surface2/70',
              )}
            >
              <span className="min-w-0 truncate">{tag.name}</span>
            </button>
          ))}
      </div>
    </aside>
  )
}

/** 分组标题行。 */
function GroupHeader({
  label,
  open,
  onToggle,
}: {
  label: string
  open: boolean
  onToggle(): void
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="mt-1 flex h-6 w-full items-center gap-1 px-2 text-left text-xs text-secondary hover:text-primary"
    >
      <span className="flex w-3.5 justify-center">{open ? chevronDownIcon() : chevronRightIcon()}</span>
      <span className="truncate">{label}</span>
    </button>
  )
}
