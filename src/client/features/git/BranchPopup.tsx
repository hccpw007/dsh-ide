/**
 * 分支选择弹窗。
 *
 * 主工具栏点击当前分支后弹出，结构与 IDEA 的 Branches 弹窗一致：顶部是搜索框与两个
 * 图标按钮，中间是 Update / Commit / Push / New Branch / Checkout Tag 固定动作，下面
 * 按 Recent / Local / Remote 分组列出分支。搜索同时过滤动作与分支；点击分支走
 * `/git/exec` 的 checkout，成功后由调用方刷新工具栏上的分支名。
 *
 * 文案走 Git 面板的语言包（`git.` 前缀）：产品要求 Git 相关界面固定英文，因此这里
 * 的 key 与截图里的英文界面一一对应。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { cn } from '../../../common/cn'
import type { IdeServices } from '../../shell/contract'
import type { Translate } from '../../../types/plugin'

import { checkout, readRefs, type GitBranch, type GitRefs } from './api'
import {
  bookmarkIcon,
  branchFilterIcon,
  chevronDownIcon,
  chevronRightIcon,
  folderIcon,
  gearIcon,
  nodeLineIcon,
  plusIcon,
  pushIcon,
  searchIcon,
  starIcon,
  updateIcon,
} from './icons'

/** 弹窗宽度：与 IDEA 的分支弹窗一致，够放下「origin/main」这类上游名。 */
const POPUP_WIDTH = 500

/** 弹窗高度：IDEA 的分支弹窗固定高度，分支多时在列表内滚动。 */
const POPUP_HEIGHT = 700

/** 弹窗贴边时保留的视口边距。 */
const VIEWPORT_MARGIN = 8

/** 一条固定动作。 */
interface ActionItem {
  /** 唯一标识。 */
  id: string
  /** 已翻译文案。 */
  label: string
  /** 左侧图标；缺省时该行只留缩进。 */
  icon?: React.ReactNode
  /** 右侧快捷键提示。 */
  shortcut?: string
  /** 点击执行。 */
  run(): void
}

/** 分支弹窗 props。 */
export interface BranchPopupProps {
  /** 外壳翻译函数；key 带 `git.` 前缀。 */
  t: Translate
  /** 工作台服务：读取工作区根、弹通知、打开面板与设置。 */
  services: IdeServices
  /** 当前分支名；空串表示游离 HEAD。 */
  head: string
  /** 弹窗左上角的视口坐标。 */
  anchor: { x: number; y: number }
  /** 关闭弹窗。 */
  onClose(): void
  /** 切换分支成功后的回调，用于刷新工具栏上的分支名。 */
  onCheckedOut(): void
}

/**
 * 渲染分支弹窗。
 * @param props 见 BranchPopupProps
 * @returns 搜索框、固定动作与分支树
 */
export function BranchPopup({
  t,
  services,
  head,
  anchor,
  onClose,
  onCheckedOut,
}: BranchPopupProps): React.ReactElement {
  const root = services.root
  const [refs, setRefs] = useState<GitRefs | null>(null)
  const [search, setSearch] = useState('')
  /** 已折叠的分组键；首次打开全部展开，与 IDEA 一致。 */
  const [closedGroups, setClosedGroups] = useState<ReadonlySet<string>>(() => new Set())
  /** 是否显示远程分支分组。 */
  const [showRemote, setShowRemote] = useState(true)
  /** 正在检出的分支名；非空时禁用列表，避免连点重复执行。 */
  const [pending, setPending] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  // 打开即聚焦搜索框：IDEA 的弹窗支持直接输入过滤
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // 每次打开重读分支；弹窗生命周期很短，不值得为期间的仓库变化做实时订阅
  useEffect(() => {
    let cancelled = false

    void readRefs(root).then((result) => {
      if (cancelled) return

      // 读不到分支时动作区仍可用，因此只提示不阻断
      if (!result.ok) {
        console.error('[dsh-ide] 读取分支失败:', result.error)
        services.notify('error', t('git.branchPopupLoadFailed'))

        return
      }

      setRefs(result.value)
    })

    return () => {
      cancelled = true
    }
  }, [root, services, t])

  // Esc 关闭：与桌面 IDE 的弹窗习惯一致
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown, true)

    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [onClose])

  const keyword = search.trim().toLowerCase()

  /**
   * 判断一段文案是否命中搜索。
   * @param text 待匹配的文案
   * @returns 命中时返回 true
   */
  const matches = useCallback(
    (text: string): boolean => keyword === '' || text.toLowerCase().includes(keyword),
    [keyword],
  )

  /** 动作一律先关弹窗再跳到 Git 面板：这些操作都要在面板里继续。 */
  const openGitPanel = useCallback((): void => {
    onClose()
    services.openBottomPanel('git')
  }, [onClose, services])

  /** 远端同步动作：Update / Commit / Push。 */
  const syncActions: ActionItem[] = [
    { id: 'update', label: t('git.branchPopupUpdate'), icon: updateIcon(), run: openGitPanel },
    { id: 'commit', label: t('git.branchPopupCommit'), icon: nodeLineIcon(), run: openGitPanel },
    { id: 'push', label: t('git.branchPopupPush'), icon: pushIcon(), shortcut: '⇧⌘K', run: openGitPanel },
  ]

  /** 本地分支动作：New Branch / Checkout Tag。 */
  const branchActions: ActionItem[] = [
    { id: 'newBranch', label: t('git.branchPopupNewBranch'), icon: plusIcon(), shortcut: '⌥⌘N', run: openGitPanel },
    { id: 'checkoutTag', label: t('git.branchPopupCheckoutTag'), run: openGitPanel },
  ]

  /** 两组动作各自按搜索过滤；整组为空时连分隔线一起省掉。 */
  const actionGroups = [syncActions, branchActions]
    .map((group) => group.filter((action) => matches(action.label)))
    .filter((group) => group.length > 0)

  const locals = useMemo(
    () => (refs?.local ?? []).filter((branch) => matches(branch.name)),
    [refs, matches],
  )

  /** 当前分支：Recent 分组用它列出「最近使用」的那一条。 */
  const headBranch = useMemo<GitBranch | null>(
    () => (refs?.local ?? []).find((branch) => branch.isHead) ?? null,
    [refs],
  )

  /** 远程分支按 `origin/` 这样的前缀分组，与 IDEA 的 Remote 层级一致。 */
  const remoteGroups = useMemo(() => {
    const groups = new Map<string, GitRefs['remote']>()

    for (const branch of refs?.remote ?? []) {
      // origin/HEAD 是符号引用：git 把它的短名给成 "origin"，两种形态都要跳过
      if (!branch.name.includes('/') || branch.name.endsWith('/HEAD')) continue

      if (!matches(branch.name)) continue

      const remote = branch.name.slice(0, branch.name.indexOf('/'))
      groups.set(remote, [...(groups.get(remote) ?? []), branch])
    }

    return [...groups.entries()]
  }, [refs, matches])

  /**
   * 切换一个分组的展开状态。
   * @param key 分组键
   */
  const toggleGroup = (key: string): void => {
    setClosedGroups((previous) => {
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
  const isOpen = (key: string): boolean => !closedGroups.has(key)

  /** 检出分支：成功后关弹窗并让调用方刷新分支名。 */
  const select = useCallback(
    (ref: string): void => {
      if (pending !== '') return

      setPending(ref)

      void checkout(root, ref).then((result) => {
        setPending('')

        if (!result.ok) {
          console.error('[dsh-ide] 切换分支失败:', result.error)
          services.notify('error', `${t('git.branchPopupCheckoutFailed')}: ${result.error.message}`)

          return
        }

        services.refreshGitStatus()
        onCheckedOut()
        onClose()
      })
    },
    [onCheckedOut, onClose, pending, root, services, t],
  )

  // 弹窗按实测尺寸收进视口，避免贴边时被裁掉
  const width = Math.min(POPUP_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2)
  const height = Math.min(POPUP_HEIGHT, window.innerHeight - VIEWPORT_MARGIN * 2)
  const left = Math.max(VIEWPORT_MARGIN, Math.min(anchor.x, window.innerWidth - width - VIEWPORT_MARGIN))
  const top = Math.max(VIEWPORT_MARGIN, Math.min(anchor.y, window.innerHeight - height - VIEWPORT_MARGIN))

  return (
    <>
      {/* 透明覆盖层：点击弹窗之外关闭 */}
      <div className="fixed inset-0 z-[9998]" onClick={onClose} />

      <div
        role="dialog"
        aria-label={t('git.title')}
        className="fixed z-[9999] flex flex-col overflow-hidden rounded-[10px] border border-line2 bg-[var(--ide-menu-bg)] shadow-2xl"
        style={{ left, top, width, height }}
        // 弹窗内右键保持弹窗打开，不再叠一层工作台兜底菜单
        onContextMenu={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
      >
        {/* 搜索行：输入框与右侧两个图标按钮，与 IDEA 的分支弹窗同排 */}
        <div className="flex shrink-0 items-center gap-1 px-4 pt-4">
          <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-[var(--ide-popup-border)] px-2">
            <span className="text-secondary">{searchIcon()}</span>

            <input
              ref={inputRef}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('git.branchPopupSearch')}
              className="min-w-0 flex-1 bg-transparent text-xs text-primary outline-none placeholder:text-secondary"
            />
          </div>

          {/* 切换远程分支分组显示 */}
          <PopupIconButton
            title={t('git.branchPopupToggleRemote')}
            active={showRemote}
            onClick={() => setShowRemote((previous) => !previous)}
          >
            {branchFilterIcon()}
          </PopupIconButton>

          {/* 打开 Git 设置 */}
          <PopupIconButton
            title={t('git.branchPopupSettings')}
            onClick={() => {
              onClose()
              services.openPage('settings')
            }}
          >
            {gearIcon()}
          </PopupIconButton>
        </div>

        <div className="mx-4 mt-2 h-px shrink-0 bg-line1" />

        <div className="min-h-0 flex-1 overflow-auto px-2 py-1">
          {/* 固定动作：两组之间画一条分隔线，与 IDEA 的分组一致 */}
          {actionGroups.map((group, index) => (
            <React.Fragment key={group[0].id}>
              {index > 0 && <Separator />}

              {group.map((action) => (
                <ActionRow
                  key={action.id}
                  icon={action.icon}
                  label={action.label}
                  shortcut={action.shortcut}
                  onClick={action.run}
                />
              ))}
            </React.Fragment>
          ))}

          {(actionGroups.length > 0 || locals.length > 0) && <Separator />}

          {/* 最近使用：IDEA 把当前分支放在 Recent 里，方便快速回到它 */}
          {headBranch !== null && matches(headBranch.name) && (
            <>
              <GroupRow
                label={t('git.branchPopupRecent')}
                open={isOpen('recent')}
                onToggle={() => toggleGroup('recent')}
              />

              {isOpen('recent') && (
                <BranchRow
                  label={headBranch.name}
                  icon={bookmarkIcon()}
                  upstream={headBranch.upstream}
                  indent={1}
                  selected={headBranch.name === head}
                  disabled={pending !== ''}
                  onClick={() => select(headBranch.name)}
                />
              )}
            </>
          )}

          {/* 本地分支：当前分支高亮，行尾显示上游分支 */}
          <GroupRow label={t('git.branchPopupLocal')} open={isOpen('local')} onToggle={() => toggleGroup('local')} />

          {isOpen('local') &&
            locals.map((branch) => (
              <BranchRow
                key={`local:${branch.name}`}
                label={branch.name}
                icon={bookmarkIcon()}
                upstream={branch.upstream}
                indent={1}
                selected={branch.isHead}
                disabled={pending !== ''}
                onClick={() => select(branch.name)}
              />
            ))}

          {/* 远程分支：按 remote 名再分一层，与 IDEA 的 Remote 树一致 */}
          {showRemote && remoteGroups.length > 0 && (
            <>
              <GroupRow
                label={t('git.branchPopupRemote')}
                open={isOpen('remote')}
                onToggle={() => toggleGroup('remote')}
              />

              {isOpen('remote') &&
                remoteGroups.map(([remote, branches]) => (
                  <React.Fragment key={`remote:${remote}`}>
                    <GroupRow
                      label={remote}
                      icon={folderIcon()}
                      indent={1}
                      open={isOpen(`remote:${remote}`)}
                      onToggle={() => toggleGroup(`remote:${remote}`)}
                    />

                    {isOpen(`remote:${remote}`) &&
                      branches.map((branch) => (
                        <BranchRow
                          key={`remote:${branch.name}`}
                          label={branch.name.slice(remote.length + 1)}
                          icon={starIcon()}
                          indent={2}
                          selected={branch.name === head}
                          disabled={pending !== ''}
                          onClick={() => select(branch.name)}
                        />
                      ))}
                  </React.Fragment>
                ))}
            </>
          )}
        </div>
      </div>
    </>
  )
}

/** 搜索行右侧的图标按钮。 */
function PopupIconButton({
  title,
  active,
  onClick,
  children,
}: {
  title: string
  /** 是否处于开启状态；开启时用主文字色，关闭时压暗。 */
  active?: boolean
  onClick(): void
  children: React.ReactNode
}): React.ReactElement {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn(
        'flex h-9 w-8 shrink-0 items-center justify-center rounded transition-colors hover:bg-surface3',
        active === false ? 'text-secondary/60' : 'text-secondary hover:text-primary',
      )}
    >
      {children}
    </button>
  )
}

/** 弹窗里的一条固定动作。 */
function ActionRow({
  icon,
  label,
  shortcut,
  onClick,
}: {
  /** 左侧图标；缺省时留出同宽空位，文案与其它行左对齐。 */
  icon?: React.ReactNode
  label: string
  shortcut?: string
  onClick(): void
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-[26px] w-full items-center gap-2 rounded px-2 text-left text-xs text-primary transition-colors hover:bg-surface3"
    >
      <span className="flex w-4 shrink-0 items-center justify-center text-secondary">{icon}</span>

      <span className="min-w-0 flex-1 truncate">{label}</span>

      {shortcut !== undefined && <span className="shrink-0 pl-6 text-[11px] text-secondary">{shortcut}</span>}
    </button>
  )
}

/** 分组标题行：chevron 加分组名，点击折叠。 */
function GroupRow({
  label,
  icon,
  indent = 0,
  open,
  onToggle,
}: {
  label: string
  /** 分组前的图标；Remote 的 remote 名用文件夹。 */
  icon?: React.ReactNode
  /** 缩进层级，每级 16px。 */
  indent?: number
  open: boolean
  onToggle(): void
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex h-[26px] w-full items-center gap-2 rounded pr-2 text-left text-xs text-primary transition-colors hover:bg-surface3"
      // 缩进随层级变化，无法用静态类名表达
      style={{ paddingLeft: 8 + indent * 16 }}
    >
      <span className="flex w-4 shrink-0 items-center justify-center text-secondary">
        {open ? chevronDownIcon() : chevronRightIcon()}
      </span>

      {icon !== undefined && (
        <span className="flex w-4 shrink-0 items-center justify-center text-secondary">{icon}</span>
      )}

      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  )
}

/** 分支行：图标、分支名，行尾是上游分支与箭头。 */
function BranchRow({
  label,
  icon,
  upstream,
  indent = 0,
  selected = false,
  disabled = false,
  onClick,
}: {
  label: string
  icon: React.ReactNode
  upstream?: string
  /** 缩进层级，每级 16px。 */
  indent?: number
  selected?: boolean
  disabled?: boolean
  onClick(): void
}): React.ReactElement {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-[26px] w-full items-center gap-2 rounded pr-2 text-left text-xs transition-colors',
        selected ? 'bg-treeselected text-white' : 'text-primary hover:bg-surface3',
        disabled && 'cursor-default opacity-60',
      )}
      style={{ paddingLeft: 8 + indent * 16 }}
    >
      <span
        className={cn(
          'flex w-4 shrink-0 items-center justify-center',
          selected ? 'text-white' : 'text-[color:var(--ide-ic-amber)]',
        )}
      >
        {icon}
      </span>

      <span className="min-w-0 flex-1 truncate">{label}</span>

      {upstream !== undefined && upstream !== '' && (
        <span className={cn('shrink-0 text-[11px]', selected ? 'text-white/80' : 'text-secondary')}>{upstream}</span>
      )}

      <span className={cn('shrink-0 text-secondary', selected && 'text-white/80')}>›</span>
    </button>
  )
}

/** 动作区与分支区之间的分隔线。 */
function Separator(): React.ReactElement {
  return <div className="my-1 h-px bg-line1" />
}
