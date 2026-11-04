/**
 * Log 页签左侧的分支树。
 *
 * 与 IDEA 的 Log 左树一致：搜索框、HEAD 入口、Local / Remote / Tags 分组。
 * 当前分支与收藏分支用 IDEA 的黄色标记（当前分支是标签图标，收藏是星；两者同时
 * 成立时以当前分支为准），其余本地分支与远端分支统一用灰色分支图标；行高比项目树更紧凑。
 * 选中行用项目树同一块选中蓝。单击只高亮，双击才切换日志范围，右键交给外层弹菜单。
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'

import { cn } from '../../../common/cn'
import type { Translate } from '../../../types/plugin'

import type { GitRef, GitRefs } from './api'
import { chevronDownIcon, chevronRightIcon, searchIcon } from './icons-ui'
import { bookmarkIcon, branchIcon, starIcon } from './icons-vcs'
import { folderIcon } from '../project-tree/icons'

/** 树行高度；分支树比项目树更紧凑（IDEA 的分支树行距也小于文件树）。 */
const ROW_HEIGHT = 20

/** 分支树 props。 */
export interface BranchTreeProps {
  /** 已绑定 git 前缀的翻译函数。 */
  t: Translate
  /** 分支、远程与标签；未读取到时为 null。 */
  refs: GitRefs | null
  /** 当前高亮的引用名；null 表示没有选中行，空串表示 HEAD。单击只改高亮，双击才切换提交范围。 */
  active: string | null
  /** 搜索内容。 */
  search: string
  /** 搜索变化。 */
  onSearchChange(value: string): void
  /** 单击选中分支（只改高亮，不切换提交范围）。 */
  onSelect(branch: string): void
  /** 双击应用分支过滤（切换中间提交列表的范围）。 */
  onActivate(branch: string): void
  /** 右键分支；target 为引用短名。 */
  onContextMenu(event: React.MouseEvent, target: string): void
  /** 树宽度（px），由与提交列表之间的分隔条拖动改变。 */
  width: number
  /** 收藏的引用短名。 */
  favorites: ReadonlySet<string>
  /** 折叠全部分组的信号；每次递增触发一次折叠。 */
  collapseSignal: number
  /** 展开全部分组的信号；每次递增触发一次展开。 */
  expandSignal: number
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
  onActivate,
  onContextMenu,
  width,
  favorites,
  collapseSignal,
  expandSignal,
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
    const groups = new Map<string, GitRef[]>()

    for (const branch of refs?.remote ?? []) {
      if (keyword !== '' && !branch.name.toLowerCase().includes(keyword)) continue

      const slash = branch.name.indexOf('/')
      // 没有分支名段的裸引用（如 `origin`）不是可检出的分支，跳过：
      // 按远端名分组再截短名会得到空串，树里就会出现只有图标的空行
      if (slash < 0) continue

      const remote = branch.name.slice(0, slash)
      const list = groups.get(remote) ?? []
      list.push(branch)
      groups.set(remote, list)
    }

    return [...groups.entries()]
  }, [refs, keyword])

  /** 收藏且当前引用列表里存在的项；按名称排序，搜索时同样按关键字收窄。 */
  const favoriteRefs = useMemo(() => {
    if (refs === null) return []

    const seen = new Set<string>()
    const list = [...refs.local, ...refs.remote, ...refs.tags].filter((ref) => {
      if (!favorites.has(ref.name) || seen.has(ref.name)) return false

      seen.add(ref.name)

      return keyword === '' || ref.name.toLowerCase().includes(keyword)
    })

    return list.sort((left, right) => left.name.localeCompare(right.name))
  }, [favorites, keyword, refs])

  /** 全部分组键：工具栏的「折叠全部」把它们一次收进折叠集合。 */
  const allGroupKeys = useMemo(
    () => ['local', 'favorites', 'remote', 'tags', ...remotes.map(([remote]) => `remote:${remote}`)],
    [remotes],
  )

  /** 上次处理过的折叠信号；只在信号变化时折叠，分支列表刷新不该把树重新收起。 */
  const handledCollapse = useRef(0)

  useEffect(() => {
    if (collapseSignal === handledCollapse.current) return

    handledCollapse.current = collapseSignal
    setClosed(new Set(allGroupKeys))
  }, [allGroupKeys, collapseSignal])

  /** 上次处理过的展开信号，作用与折叠信号相同。 */
  const handledExpand = useRef(0)

  useEffect(() => {
    if (expandSignal === handledExpand.current) return

    handledExpand.current = expandSignal
    setClosed(new Set())
  }, [expandSignal])

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
        <div className="flex h-7 items-center gap-1.5 rounded border border-line1 bg-base px-2">
          <span className="text-secondary">{searchIcon()}</span>
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t('branchOrTag')}
            className="min-w-0 flex-1 bg-transparent text-[12px] text-primary outline-none placeholder:text-secondary"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto py-1">
        {/* HEAD 入口：看当前检出分支的日志；与 IDEA 一样只留文字，不占图标位 */}
        <button
          type="button"
          onClick={() => onSelect('')}
          onDoubleClick={() => onActivate('')}
          onContextMenu={(event) => {
            event.preventDefault()
            // 空串代表 HEAD，由外层换算成当前检出分支，右键菜单与那条本地分支一致
            onContextMenu(event, '')
          }}
          style={{ height: ROW_HEIGHT }}
          className={cn(
            'flex w-full items-center pl-5 pr-2 text-left text-xs',
            active === '' ? 'bg-treeselected text-white' : 'text-primary hover:bg-surface2/70',
          )}
        >
          <span className="truncate">{t('headCurrent')}</span>
        </button>

        <GroupHeader label={t('local')} open={isOpen('local')} onToggle={() => toggle('local')} />

        {isOpen('local') &&
          locals.map((branch) => {
            const favorite = favorites.has(branch.name)

            return (
              <button
                key={branch.name}
                type="button"
                title={branch.subject}
                onClick={() => onSelect(branch.name)}
                onDoubleClick={() => onActivate(branch.name)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  onContextMenu(event, branch.name)
                }}
                style={{ height: ROW_HEIGHT }}
                className={cn(
                  'flex w-full items-center gap-1.5 pl-8 pr-2 text-left text-xs',
                  active === branch.name ? 'bg-treeselected text-white' : 'text-primary hover:bg-surface2/70',
                )}
              >
                {/* 当前分支用黄书签，优先于收藏分支的黄星；其余与远端一样用灰色分支图标 */}
                <span
                  className={cn(
                    'flex w-[16px] shrink-0 justify-center',
                    favorite || branch.isHead ? 'text-warn' : 'text-secondary',
                  )}
                >
                  {branch.isHead ? bookmarkIcon() : favorite ? starIcon() : branchIcon(13)}
                </span>
                <span className="min-w-0 truncate">{branch.name}</span>

                {/* 领先/落后上游的数量，与 IDEA 的箭头一致 */}
                {(branch.ahead > 0 || branch.behind > 0) && (
                  <span className={cn('shrink-0 text-[10px]', active === branch.name ? 'text-white/80' : 'text-secondary')}>
                    {branch.ahead > 0 ? `↑${String(branch.ahead)}` : ''}
                    {branch.behind > 0 ? `↓${String(branch.behind)}` : ''}
                  </span>
                )}
              </button>
            )
          })}

        {/* Favorites 分组：收藏的引用在这里再列一份；原分组里仍保留，按位置找分支不受影响 */}
        {favoriteRefs.length > 0 && (
          <>
            <GroupHeader label={t('favorites')} open={isOpen('favorites')} onToggle={() => toggle('favorites')} />

            {isOpen('favorites') &&
              favoriteRefs.map((ref) => (
                <button
                  key={`favorite:${ref.name}`}
                  type="button"
                  title={ref.subject}
                  onClick={() => onSelect(ref.name)}
                  onDoubleClick={() => onActivate(ref.name)}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    onContextMenu(event, ref.name)
                  }}
                  style={{ height: ROW_HEIGHT }}
                  className={cn(
                    'flex w-full items-center gap-1.5 pl-8 pr-2 text-left text-xs',
                    active === ref.name ? 'bg-treeselected text-white' : 'text-primary hover:bg-surface2/70',
                  )}
                >
                  {/* 当前分支在本分组同样优先显示书签，其余收藏项才是星；远程引用与标签没有 isHead 字段 */}
                  <span className="flex w-[16px] shrink-0 justify-center text-warn">
                    {'isHead' in ref && ref.isHead ? bookmarkIcon() : starIcon()}
                  </span>
                  <span className="min-w-0 truncate">{ref.name}</span>
                </button>
              ))}
          </>
        )}

        <GroupHeader label={t('remote')} open={isOpen('remote')} onToggle={() => toggle('remote')} />

        {isOpen('remote') &&
          remotes.map(([remote, branches]) => (
            <div key={remote}>
              <button
                type="button"
                onClick={() => toggle(`remote:${remote}`)}
                style={{ height: ROW_HEIGHT }}
                className="flex w-full items-center gap-1 pl-8 pr-2 text-left text-xs text-primary hover:bg-surface2/70"
              >
                <span className="flex w-3.5 shrink-0 justify-center text-secondary">
                  {isOpen(`remote:${remote}`) ? chevronDownIcon() : chevronRightIcon()}
                </span>
                {/* 目录图标统一用项目树的那一套，远端在 IDEA 里就画成文件夹 */}
                <span className="shrink-0 text-secondary">{folderIcon(isOpen(`remote:${remote}`))}</span>
                <span className="min-w-0 truncate">{remote}</span>
              </button>

              {isOpen(`remote:${remote}`) &&
                branches.map((branch) => {
                  const short = branch.name.slice(remote.length + 1)
                  const favorite = favorites.has(branch.name)

                  return (
                    <button
                      key={branch.name}
                      type="button"
                      title={branch.subject}
                      onClick={() => onSelect(branch.name)}
                      onDoubleClick={() => onActivate(branch.name)}
                      onContextMenu={(event) => {
                        event.preventDefault()
                        onContextMenu(event, branch.name)
                      }}
                      style={{ height: ROW_HEIGHT }}
                      className={cn(
                        'flex w-full items-center gap-1.5 pl-12 pr-2 text-left text-xs',
                        active === branch.name ? 'bg-treeselected text-white' : 'text-primary hover:bg-surface2/70',
                      )}
                    >
                      <span className={cn('flex w-[16px] shrink-0 justify-center', favorite ? 'text-warn' : 'text-secondary')}>
                        {favorite ? starIcon() : branchIcon(13)}
                      </span>
                      <span className="min-w-0 truncate">{short}</span>
                    </button>
                  )
                })}
            </div>
          ))}

        <GroupHeader label={t('tags')} open={isOpen('tags')} onToggle={() => toggle('tags')} />

        {isOpen('tags') &&
          tags.map((tag) => {
            const favorite = favorites.has(tag.name)

            return (
              <button
                key={tag.name}
                type="button"
                title={tag.subject}
                onClick={() => onSelect(tag.name)}
                onDoubleClick={() => onActivate(tag.name)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  onContextMenu(event, tag.name)
                }}
                style={{ height: ROW_HEIGHT }}
                className={cn(
                  'flex w-full items-center gap-1.5 pl-8 pr-2 text-left text-xs',
                  active === tag.name ? 'bg-treeselected text-white' : 'text-primary hover:bg-surface2/70',
                )}
              >
                <span className={cn('flex w-[16px] shrink-0 justify-center', favorite ? 'text-warn' : 'text-secondary')}>
                  {favorite ? starIcon() : bookmarkIcon()}
                </span>
                <span className="min-w-0 truncate">{tag.name}</span>
              </button>
            )
          })}
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
      style={{ height: ROW_HEIGHT }}
      className="mt-1 flex w-full items-center gap-1 pl-2 pr-2 text-left text-xs text-primary"
    >
      <span className="flex w-3.5 justify-center text-secondary">{open ? chevronDownIcon() : chevronRightIcon()}</span>
      <span className="truncate">{label}</span>
    </button>
  )
}
