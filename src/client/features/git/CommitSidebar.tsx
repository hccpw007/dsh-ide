/**
 * Log 页签右侧：提交文件树与提交详情。
 *
 * 上半部分是所选提交的改动文件（按目录分组），下半部分是提交元信息。点击文件在
 * 编辑器区打开该提交的差异，避免把面板本身变成第二个差异视图。
 */
import React, { useCallback, useMemo, useState } from 'react'

import { cn } from '../../../common/cn'
import { SplitHandle } from '../../../common/split-handle'
import type { Translate } from '../../../types/plugin'
import type { IdeServices } from '../../shell/contract'

import type { GitCommitDetail } from './api'
import {
  arrowDownIcon,
  arrowUpIcon,
  branchIcon,
  chevronDownIcon,
  chevronRightIcon,
  closeIcon,
  eyeIcon,
  gearIcon,
} from './icons'
import { ContextMenu, type MenuItem, type MenuState } from './menu'
import { fileIcon } from '../project-tree/file-icons'
import { folderIcon } from '../project-tree/icons'

/** 文件树节点。 */
interface TreeNode {
  /** 节点名。 */
  name: string
  /** 相对仓库根的完整路径。 */
  path: string
  /** 是否目录。 */
  directory: boolean
  /** 子节点；文件为空数组。 */
  children: TreeNode[]
  /** 目录下的文件总数。 */
  fileCount: number
  /** 文件新增行数；目录恒为 0。 */
  added: number
  /** 文件删除行数；目录恒为 0。 */
  removed: number
}

/** 提交详情区高度上下限：太矮看不全提交信息，太高会把文件树挤没。 */
const MIN_DETAIL_HEIGHT = 84
const MAX_DETAIL_HEIGHT = 520

/** 首次打开时的详情区高度，与 IDEA 提交详情的默认占比一致。 */
const DEFAULT_DETAIL_HEIGHT = 200

/** 侧栏 props。 */
export interface CommitSidebarProps {
  /** 已绑定 git 前缀的翻译函数。 */
  t: Translate
  /** 工作台服务总线。 */
  services: IdeServices
  /** 当前提交详情；null 时显示占位。 */
  detail: GitCommitDetail | null
  /** 工作区根，仅用于取仓库目录名。 */
  root: string
  /** 关闭侧栏内容（清空选中提交）。 */
  onClose(): void
}

/**
 * 把文件列表构建成目录树。
 * @param files 提交内文件
 * @returns 根节点
 */
function buildTree(files: { path: string; added: number; removed: number }[]): TreeNode {
  const root: TreeNode = { name: '', path: '', directory: true, children: [], fileCount: 0, added: 0, removed: 0 }
  const stats = new Map(files.map((file) => [file.path, file]))

  for (const file of files) {
    const parts = file.path.split('/').filter((part) => part !== '')
    let node = root

    for (let index = 0; index < parts.length; index += 1) {
      const name = parts[index] ?? ''
      const last = index === parts.length - 1
      const path = parts.slice(0, index + 1).join('/')
      let child = node.children.find((item) => item.name === name && item.directory === !last)

      if (child === undefined) {
        const entry = stats.get(path)

        child = {
          name,
          path,
          directory: !last,
          children: [],
          fileCount: 0,
          added: entry?.added ?? 0,
          removed: entry?.removed ?? 0,
        }
        node.children.push(child)
      }

      node = child
    }
  }

  /**
   * 递归统计目录文件数，并把目录排在文件前面。
   * @param node 目录节点
   * @returns 该目录下的文件数
   */
  const count = (node: TreeNode): number => {
    if (!node.directory) return 1

    node.children.sort((left, right) => {
      if (left.directory !== right.directory) return left.directory ? -1 : 1

      return left.name.localeCompare(right.name)
    })

    node.fileCount = node.children.reduce((total, child) => total + count(child), 0)

    return node.fileCount
  }

  count(root)
  compress(root)

  return root
}

/**
 * 压缩只含单个目录子节点的目录链，与 Commit 弹窗的变更树一致。
 *
 * 一路只含一个子目录的路径（如 src / components / ProductConfigModal）逐行展开会
 * 白白占掉侧栏的大半高度，合并成 `src/components/ProductConfigModal` 一行才像 IDEA。
 * @param node 目录节点
 */
function compress(node: TreeNode): void {
  if (!node.directory) return

  for (const child of node.children) compress(child)

  // 根节点保留仓库名；其后只有一个目录分支时把子目录并上来
  const only = node.children.length === 1 ? node.children[0] : undefined

  if (node.path !== '' && only !== undefined && only.directory) {
    node.name = `${node.name}/${only.name}`
    node.children = only.children
    node.path = only.path
  }
}

/**
 * 把 ISO 时间格式化成提交详情里的日期。
 * @param iso ISO 时间
 * @returns `2026/10/28 at 17:13`
 */
function formatFullDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso

  const pad = (value: number): string => String(value).padStart(2, '0')

  return `${String(date.getFullYear())}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} at ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * 渲染文件树与提交详情。
 * @param props 见 CommitSidebarProps
 * @returns 上半文件树、下半提交信息
 */
export function CommitSidebar({ t, services, detail, root, onClose }: CommitSidebarProps): React.ReactElement {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const [grouped, setGrouped] = useState(true)
  const [showStats, setShowStats] = useState(false)
  const [menu, setMenu] = useState<MenuState | null>(null)
  /** 提交详情区高度（px），由文件树与详情之间的分隔条拖动改变。 */
  const [detailHeight, setDetailHeight] = useState(DEFAULT_DETAIL_HEIGHT)

  /** 把拖拽得到的详情高度收进合法区间。 */
  const resizeDetail = useCallback((next: number): void => {
    setDetailHeight(Math.min(Math.max(next, MIN_DETAIL_HEIGHT), MAX_DETAIL_HEIGHT))
  }, [])

  const tree = useMemo(() => buildTree(detail?.files ?? []), [detail])

  const repoName = root.split('/').filter((part) => part !== '').pop() ?? root

  /**
   * 打开文件在该提交中的差异。
   * @param path 文件路径
   */
  const openFileDiff = useCallback(
    (path: string): void => {
      if (detail === null) return

      // 根提交没有父提交，用自身与自己比较，差异为空而不是报错
      const from = detail.commit.parents[0] ?? detail.commit.hash
      services.openDiff({ kind: 'commits', from, to: detail.commit.hash, path })
    },
    [detail, services],
  )

  /**
   * 打开文件右键菜单。
   * @param event 鼠标事件
   * @param path 文件路径
   */
  const openFileMenu = useCallback(
    (event: React.MouseEvent, path: string): void => {
      event.preventDefault()

      const items: MenuItem[] = [
        { id: 'diff', label: t('showDiff'), run: () => openFileDiff(path) },
        {
          id: 'copy',
          label: t('copyPath'),
          run: () => {
            void navigator.clipboard.writeText(path).then(
              () => services.toast('success', t('copied')),
              (copyError: unknown) => {
                console.error('[dsh-ide] Failed to copy path:', copyError)
                services.toast('error', t('copyFailed'))
              },
            )
          },
        },
      ]

      setMenu({ x: event.clientX, y: event.clientY, items })
    },
    [openFileDiff, services, t],
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 文件树工具栏：分组、统计、全展开/收起、设置与关闭 */}
      <div className="flex h-9 shrink-0 items-center gap-0.5 border-b border-line1 px-2">
        <SideButton title={t('groupByDirectory')} active={grouped} onClick={() => setGrouped((previous) => !previous)}>
          {branchIcon()}
        </SideButton>

        <SideButton title={t('showFileStats')} active={showStats} onClick={() => setShowStats((previous) => !previous)}>
          {eyeIcon()}
        </SideButton>

        <SideButton
          title={t('collapseAll')}
          onClick={() => setCollapsed(new Set(collectDirectories(tree)))}
        >
          {arrowUpIcon()}
        </SideButton>

        <SideButton title={t('expandAll')} onClick={() => setCollapsed(new Set())}>
          {arrowDownIcon()}
        </SideButton>

        <SideButton
          title={t('diffSettings')}
          onClick={(event) => {
            setMenu({
              x: event.clientX - 160,
              y: event.clientY + 12,
              items: [
                {
                  id: 'group',
                  label: `${grouped ? '✓ ' : ''}${t('groupByDirectory')}`,
                  run: () => setGrouped((previous) => !previous),
                },
                {
                  id: 'stats',
                  label: `${showStats ? '✓ ' : ''}${t('showFileStats')}`,
                  run: () => setShowStats((previous) => !previous),
                },
              ],
            })
          }}
        >
          {gearIcon()}
        </SideButton>

        <span className="flex-1" />

        <SideButton title={t('closePanel')} onClick={onClose}>
          {closeIcon()}
        </SideButton>
      </div>

      {/* 文件树 */}
      <div className="min-h-0 flex-1 overflow-auto py-1">
        {detail !== null && detail.files.length === 0 && (
          <div className="px-3 py-2 text-xs text-secondary">{t('noFiles')}</div>
        )}

        {detail !== null && detail.files.length > 0 && (
          <>
            {/* 根目录行：显示仓库名与改动文件数 */}
            <div className="flex h-6 items-center gap-1.5 pl-2 pr-2 text-xs">
              <span className="flex w-4 justify-center text-secondary">{folderIcon(true)}</span>
              <span className="truncate text-primary">{repoName}</span>
              <span className="text-[10px] text-secondary">
                {detail.files.length} {t('files')}
              </span>
            </div>

            {grouped ? (
              <TreeRows
                t={t}
                node={tree}
                depth={0}
                collapsed={collapsed}
                showStats={showStats}
                onToggle={(path) =>
                  setCollapsed((previous) => {
                    const next = new Set(previous)
                    if (next.has(path)) next.delete(path)
                    else next.add(path)

                    return next
                  })
                }
                onFile={openFileDiff}
                onFileMenu={openFileMenu}
              />
            ) : (
              detail.files.map((file) => (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => openFileDiff(file.path)}
                  onContextMenu={(event) => openFileMenu(event, file.path)}
                  className="flex h-6 w-full items-center gap-1.5 pl-6 pr-2 text-left text-xs text-primary hover:bg-surface2/60"
                >
                  {fileIcon(file.path)}
                  <span className="min-w-0 flex-1 truncate text-info">{file.path}</span>
                  {showStats && <FileStats added={file.added} removed={file.removed} />}
                </button>
              ))
            )}
          </>
        )}
      </div>

      {/* 文件树与提交详情之间的分隔条：拖动改变上下占比，尺寸属于下方详情区 */}
      <SplitHandle orientation="horizontal" anchor="back" current={() => detailHeight} onResize={resizeDetail} />

      {/* 提交详情：元信息与完整提交信息；与 IDEA 一致不画小标题，内容直接铺开 */}
      <div
        className="min-h-0 shrink overflow-auto px-3 py-2 text-[11px] leading-[17px]"
        style={{ height: detailHeight }}
      >
        {detail === null ? (
          <div className="text-secondary">{t('selectCommit')}</div>
        ) : (
          <>
            {/* 提交人与时间 */}
            <div>
              <span className="font-mono text-info">{detail.commit.shortHash}</span>{' '}
              <span className="text-primary">{detail.commit.author}</span>{' '}
              <span className="text-secondary">&lt;{detail.commit.email}&gt;</span>{' '}
              <span className="text-secondary">
                {t('on')} {formatFullDate(detail.commit.date)}
              </span>
            </div>

            {/* 包含该提交的分支；HEAD 优先显示 */}
            {detail.branches.length > 0 && (
              <div className="mt-1 text-secondary">
                {t('inBranches').replace('{count}', String(detail.branches.length))}{' '}
                {detail.branches.join(', ')}
              </div>
            )}

            {/* 完整提交信息：标题加正文，保留原始换行；提交说明属于可复制内容，单独放开选中 */}
            <div className="ide-selectable mt-3 whitespace-pre-wrap text-primary">
              {detail.commit.body !== undefined && detail.commit.body !== ''
                ? detail.commit.body
                : detail.commit.subject}
            </div>
          </>
        )}
      </div>

      {menu !== null && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </div>
  )
}

/** 递归渲染目录树。 */
function TreeRows({
  t,
  node,
  depth,
  collapsed,
  showStats,
  onToggle,
  onFile,
  onFileMenu,
}: {
  t: Translate
  node: TreeNode
  depth: number
  collapsed: ReadonlySet<string>
  showStats: boolean
  onToggle(path: string): void
  onFile(path: string): void
  onFileMenu(event: React.MouseEvent, path: string): void
}): React.ReactElement {
  return (
    <>
      {node.children.map((child) => {
        const open = !collapsed.has(child.path)
        const indent = 8 + depth * 14

        if (!child.directory) {
          return (
            <button
              key={child.path}
              type="button"
              title={child.path}
              onClick={() => onFile(child.path)}
              onContextMenu={(event) => onFileMenu(event, child.path)}
              style={{ paddingLeft: indent + 18 }}
              className="flex h-6 w-full items-center gap-1.5 pr-2 text-left text-xs text-info hover:bg-surface2/60"
            >
              {fileIcon(child.name)}
              <span className="min-w-0 flex-1 truncate">{child.name}</span>
              {showStats && <FileStats added={child.added} removed={child.removed} />}
            </button>
          )
        }

        return (
          <div key={child.path}>
            <button
              type="button"
              onClick={() => onToggle(child.path)}
              style={{ paddingLeft: indent }}
              className="flex h-6 w-full items-center gap-1.5 pr-2 text-left text-xs text-primary hover:bg-surface2/60"
            >
              <span className="flex w-3 justify-center text-secondary">
                {open ? chevronDownIcon() : chevronRightIcon()}
              </span>
              <span className="flex justify-center text-secondary">{folderIcon(open)}</span>
              <span className="min-w-0 truncate">{child.name}</span>
              <span className="shrink-0 text-[10px] text-secondary">
                {child.fileCount} {child.fileCount === 1 ? t('file') : t('files')}
              </span>
            </button>

            {open && (
              <TreeRows
                t={t}
                node={child}
                depth={depth + 1}
                collapsed={collapsed}
                showStats={showStats}
                onToggle={onToggle}
                onFile={onFile}
                onFileMenu={onFileMenu}
              />
            )}
          </div>
        )
      })}
    </>
  )
}

/** 文件的增删统计。 */
function FileStats({ added, removed }: { added: number; removed: number }): React.ReactElement {
  return (
    <span className="flex shrink-0 gap-1 font-mono text-[10px]">
      {added > 0 && <span className="text-success">+{added}</span>}
      {removed > 0 && <span className="text-danger">−{removed}</span>}
    </span>
  )
}

/** 收集所有目录路径，用于「全部收起」。 */
function collectDirectories(node: TreeNode): string[] {
  const paths: string[] = []

  for (const child of node.children) {
    if (!child.directory) continue

    paths.push(child.path, ...collectDirectories(child))
  }

  return paths
}

/** 侧栏工具栏按钮。 */
function SideButton({
  title,
  active = false,
  onClick,
  children,
}: {
  title: string
  active?: boolean
  onClick(event: React.MouseEvent): void
  children: React.ReactNode
}): React.ReactElement {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex h-6 w-6 items-center justify-center rounded transition-colors',
        active ? 'bg-info/25 text-primary' : 'text-secondary hover:bg-surface2 hover:text-primary',
      )}
    >
      {children}
    </button>
  )
}
