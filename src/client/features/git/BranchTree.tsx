/**
 * 日志页签左侧的分支树。
 *
 * 与 IDEA 的 Log 左树对应：顶部搜索框，下面是 HEAD、Local、Remote（按远端名
 * 二级分组）与 Tags。点击分支把日志切换到该分支，右键交给外层弹菜单。
 */
import React, { useMemo, useState } from 'react'

import { cn } from '../../../common/cn'
import type { Translate } from '../../../types/plugin'

import type { GitRefs } from './api'

/** 分支树 props。 */
export interface BranchTreeProps {
  /** 已绑定 git 前缀的翻译函数。 */
  t: Translate
  /** 分支、远程与标签；未读取到时为 null。 */
  refs: GitRefs | null
  /** 当前过滤的分支名；空串表示 HEAD（当前分支）。 */
  active: string
  /** 搜索框内容，由外层持有以便同时过滤提交列表。 */
  search: string
  /** 搜索框变化。 */
  onSearchChange(value: string): void
  /** 选择分支。 */
  onSelect(branch: string): void
  /** 右键某个分支。 */
  onContextMenu(event: React.MouseEvent, branch: string): void
  /** 新建分支入口。 */
  onCreate(): void
  /** 操作进行中时禁用交互。 */
  disabled: boolean
}

/**
 * 渲染分支树。
 * @param props 见 BranchTreeProps
 * @returns 搜索框、HEAD、本地/远程/标签分组
 */
export function BranchTree({
  t,
  refs,
  active,
  search,
  onSearchChange,
  onSelect,
  onContextMenu,
  onCreate,
  disabled,
}: BranchTreeProps): React.ReactElement {
  const [localOpen, setLocalOpen] = useState(true)
  const [remoteOpen, setRemoteOpen] = useState(true)
  const [tagsOpen, setTagsOpen] = useState(false)
  /** 已收起的远端名；默认全部展开，避免打开面板要逐级点开。 */
  const [closedRemotes, setClosedRemotes] = useState<ReadonlySet<string>>(() => new Set())

  const keyword = search.trim().toLowerCase()
  const local = useMemo(
    () => (refs?.local ?? []).filter((branch) => keyword === '' || branch.name.toLowerCase().includes(keyword)),
    [keyword, refs],
  )
  const tags = useMemo(
    () => (refs?.tags ?? []).filter((tag) => keyword === '' || tag.name.toLowerCase().includes(keyword)),
    [keyword, refs],
  )

  /** 远程分支按远端名分组；名字里没有 `/` 的归到「其它」。 */
  const remotes = useMemo(() => {
    const groups = new Map<string, { name: string; hash: string; subject: string }[]>()

    for (const branch of refs?.remote ?? []) {
      if (keyword !== '' && !branch.name.toLowerCase().includes(keyword)) continue

      const slash = branch.name.indexOf('/')
      const remote = slash < 0 ? 'origin' : branch.name.slice(0, slash)

      groups.set(remote, [...(groups.get(remote) ?? []), branch])
    }

    return [...groups.entries()]
  }, [keyword, refs])

  return (
    <aside className="flex w-[250px] shrink-0 flex-col border-r border-line1">
      {/* 分支搜索：同时过滤左侧树与右侧提交列表 */}
      <div className="shrink-0 border-b border-line1 p-1">
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={t('branchSearchPlaceholder')}
          className="w-full rounded border border-line2 bg-base px-1.5 py-0.5 text-xs text-primary outline-none focus:border-line4"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto py-1">
        {/* 当前分支入口：等价于不带分支参数的 HEAD 日志 */}
        <button
          type="button"
          onClick={() => onSelect('')}
          className={cn(
            'flex w-full items-center gap-1 px-2 py-0.5 text-left text-xs',
            active === '' ? 'bg-layer2 text-primary' : 'text-primary hover:bg-layer2',
          )}
        >
          <span className="w-3 shrink-0 text-center text-success">●</span>
          <span className="min-w-0 flex-1 truncate">{t('headCurrent')}</span>
        </button>

        {/* 本地分支分组 */}
        <GroupHeader
          label={t('groupLocal')}
          count={local.length}
          open={localOpen}
          onToggle={() => setLocalOpen((previous) => !previous)}
        />

        {localOpen &&
          local.map((branch) => (
            <button
              key={branch.name}
              type="button"
              onClick={() => onSelect(branch.name)}
              onContextMenu={(event) => {
                event.preventDefault()
                onContextMenu(event, branch.name)
              }}
              title={branch.subject}
              className={cn(
                'flex w-full items-center gap-1 py-0.5 pl-5 pr-2 text-left text-xs',
                active === branch.name ? 'bg-layer2 text-primary' : 'text-primary hover:bg-layer2',
              )}
            >
              {/* 当前分支用实心圆点，其余留空对齐 */}
              <span className={cn('w-2 shrink-0 text-[10px]', branch.isHead ? 'text-success' : 'text-transparent')}>●</span>
              <span className="min-w-0 flex-1 truncate">{branch.name}</span>

              {/* 领先 / 落后上游的提交数 */}
              {(branch.ahead > 0 || branch.behind > 0) && (
                <span className="shrink-0 text-[11px] text-secondary">
                  {branch.ahead > 0 ? `↑${branch.ahead}` : ''}
                  {branch.behind > 0 ? `↓${branch.behind}` : ''}
                </span>
              )}
            </button>
          ))}

        {/* 远程分支分组 */}
        <GroupHeader
          label={t('groupRemote')}
          count={remotes.reduce((total, [, items]) => total + items.length, 0)}
          open={remoteOpen}
          onToggle={() => setRemoteOpen((previous) => !previous)}
        />

        {remoteOpen &&
          remotes.map(([remote, branches]) => {
            const open = !closedRemotes.has(remote)

            return (
              <div key={remote}>
                <button
                  type="button"
                  onClick={() =>
                    setClosedRemotes((previous) => {
                      const next = new Set(previous)
                      if (next.has(remote)) next.delete(remote)
                      else next.add(remote)

                      return next
                    })
                  }
                  className="flex w-full items-center gap-1 py-0.5 pl-4 pr-2 text-left text-xs text-secondary hover:bg-layer2 hover:text-primary"
                >
                  {/* 二级分组的展开标记 */}
                  <span className="w-3 shrink-0 text-center">{open ? '▾' : '▸'}</span>
                  <span className="min-w-0 flex-1 truncate">{remote}</span>
                </button>

                {open &&
                  branches.map((branch) => (
                    <button
                      key={branch.name}
                      type="button"
                      onClick={() => onSelect(branch.name)}
                      title={branch.subject}
                      className={cn(
                        'flex w-full items-center gap-1 py-0.5 pl-9 pr-2 text-left text-xs',
                        active === branch.name ? 'bg-layer2 text-primary' : 'text-primary hover:bg-layer2',
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{branch.name}</span>
                    </button>
                  ))}
              </div>
            )
          })}

        {/* 标签分组：点击标签同样可以看该标签的日志 */}
        <GroupHeader
          label={t('groupTags')}
          count={tags.length}
          open={tagsOpen}
          onToggle={() => setTagsOpen((previous) => !previous)}
        />

        {tagsOpen &&
          tags.map((tag) => (
            <button
              key={tag.name}
              type="button"
              onClick={() => onSelect(tag.name)}
              className={cn(
                'flex w-full items-center gap-1 py-0.5 pl-5 pr-2 text-left text-xs',
                active === tag.name ? 'bg-layer2 text-primary' : 'text-primary hover:bg-layer2',
              )}
            >
              <span className="min-w-0 flex-1 truncate">{tag.name}</span>
            </button>
          ))}
      </div>

      {/* 新建分支入口 */}
      <div className="shrink-0 border-t border-line1 p-1">
        <button
          type="button"
          disabled={disabled}
          onClick={onCreate}
          className="w-full rounded border border-line2 px-1.5 py-0.5 text-xs text-primary hover:bg-layer2 disabled:opacity-40"
        >
          {t('newBranch')}
        </button>
      </div>
    </aside>
  )
}

/** 分组标题行。 */
interface GroupHeaderProps {
  /** 分组名称。 */
  label: string
  /** 条目数量。 */
  count: number
  /** 是否展开。 */
  open: boolean
  onToggle(): void
}

/**
 * 渲染可折叠的分组标题。
 * @param props 见 GroupHeaderProps
 * @returns 一行标题
 */
function GroupHeader({ label, count, open, onToggle }: GroupHeaderProps): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="mt-1 flex w-full items-center gap-1 px-2 py-0.5 text-left text-xs text-secondary hover:text-primary"
    >
      {/* 展开 / 收起标记 */}
      <span className="w-3 shrink-0 text-center">{open ? '▾' : '▸'}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="shrink-0 text-[11px]">{count}</span>
    </button>
  )
}
