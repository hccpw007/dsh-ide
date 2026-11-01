/**
 * Log 页签右侧：提交文件树与提交详情。
 *
 * 上半部分是所选提交的改动文件（按目录分组），默认占三分之二；下半部分是提交
 * 元信息，默认占三分之一。文件行单击只选中，双击才在编辑器区打开该提交的差异，
 * 避免误点就把面板变成第二个差异视图；工具栏按钮都作用于选中的那个文件。
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { cn } from '../../../common/cn'
import { SplitHandle } from '../../../common/split-handle'
import type { Translate } from '../../../types/plugin'
import { ConfirmDialog, type ConfirmRequest } from '../../common/ConfirmDialog'
import type { IdeServices } from '../../shell/contract'

import { restoreFrom, type GitCommitDetail } from './api'
import { statusTone } from './commit-model'
import {
  chevronDownIcon,
  chevronRightIcon,
  clockIcon,
  diffIcon,
  eyeIcon,
  pencilIcon,
  popupMarkIcon,
  undoArrowIcon,
} from './icons'
import { ContextMenu, type MenuItem, type MenuState } from './menu'
import { fileIcon } from '../project-tree/file-icons'
import { collapseAllIcon, expandAllIcon, folderIcon } from '../project-tree/icons'

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
  /** 文件相对父提交的状态字母；目录为空串。 */
  status: string
}

/** 提交详情区高度上下限：太矮看不全提交信息，太高会把文件树挤没。
 * 下限取三行正文的高度，面板较矮时三分之一才不会被抬成四成。 */
const MIN_DETAIL_HEIGHT = 56
const MAX_DETAIL_HEIGHT = 520

/** 容器高度还没测量出来时的详情区高度兜底值。 */
const DEFAULT_DETAIL_HEIGHT = 200

/** 详情区默认占侧栏高度的比例：文件树三分之二、详情三分之一，与 IDEA 一致。 */
const DETAIL_RATIO = 1 / 3

/**
 * 把详情区高度收进合法区间。
 * @param next 待设置的高度（px）
 * @returns 合法高度
 */
function clampDetailHeight(next: number): number {
  return Math.min(Math.max(next, MIN_DETAIL_HEIGHT), MAX_DETAIL_HEIGHT)
}

/** 侧栏 props。 */
export interface CommitSidebarProps {
  /** 已绑定 git 前缀的翻译函数。 */
  t: Translate
  /** 工作台服务总线。 */
  services: IdeServices
  /** 当前提交详情；null 时显示占位。 */
  detail: GitCommitDetail | null
  /** 工作区根：既用于取仓库目录名，也是回滚命令的执行目录。 */
  root: string
}

/**
 * 把文件列表构建成目录树。
 * @param files 提交内文件
 * @returns 根节点
 */
function buildTree(files: { path: string; added: number; removed: number; status: string }[]): TreeNode {
  const root: TreeNode = {
    name: '',
    path: '',
    directory: true,
    children: [],
    fileCount: 0,
    added: 0,
    removed: 0,
    status: '',
  }
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
          status: entry?.status ?? '',
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
export function CommitSidebar({ t, services, detail, root }: CommitSidebarProps): React.ReactElement {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  /** 当前选中的文件路径；单击文件行只选中，双击才打开差异。 */
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [grouped, setGrouped] = useState(true)
  // 与 IDEA 一致：文件树默认展示增删统计，齿轮菜单的 Show Change Statistics 默认勾选
  const [showStats, setShowStats] = useState(true)
  const [menu, setMenu] = useState<MenuState | null>(null)
  /** Revert Selected Changes 的二次确认请求；非空时渲染确认框。 */
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null)
  /** 提交详情区高度（px），由文件树与详情之间的分隔条拖动改变。 */
  const [detailHeight, setDetailHeight] = useState(DEFAULT_DETAIL_HEIGHT)
  /** 侧栏根节点，用来按容器高度算详情区默认占比。 */
  const rootRef = useRef<HTMLDivElement>(null)
  /** 用户拖动过详情区之后，不再按容器高度自动重算比例。 */
  const detailPinnedRef = useRef(false)

  // 未手动调整前，详情区始终占下三分之一：容器高度变化（面板拖高、窗口缩放）后跟随
  useLayoutEffect(() => {
    const element = rootRef.current
    if (element === null) return

    /** 按容器高度重算详情区高度。 */
    const sync = (): void => {
      if (detailPinnedRef.current) return
      setDetailHeight(clampDetailHeight(element.clientHeight * DETAIL_RATIO))
    }

    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(element)

    return () => observer.disconnect()
  }, [])

  /** 把拖拽得到的详情高度收进合法区间。 */
  const resizeDetail = useCallback((next: number): void => {
    detailPinnedRef.current = true
    setDetailHeight(clampDetailHeight(next))
  }, [])

  const tree = useMemo(() => buildTree(detail?.files ?? []), [detail])

  /** 当前提交 hash；只按它判断提交是否换了，详情刷新不算换提交。 */
  const commitHash = detail?.commit.hash ?? ''

  // 切换提交后旧选中不再属于当前文件列表，直接清空；同一提交的详情重读时保留选中
  useEffect(() => {
    setSelectedPath(null)
  }, [commitHash])

  /** 当前选中文件；文件已不在本提交里时视为没有选中。 */
  const selection = useMemo(
    () =>
      selectedPath !== null && detail !== null && detail.files.some((file) => file.path === selectedPath)
        ? selectedPath
        : null,
    [detail, selectedPath],
  )

  /** 是否有可展开/折叠的文件行。 */
  const hasFiles = detail !== null && detail.files.length > 0

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

  /** 在编辑器里打开选中的文件：显示工作区里的当前内容。 */
  const openInEditor = useCallback((): void => {
    if (selection === null) return

    services.openFile(selection)
  }, [selection, services])

  /** 在编辑器区打开选中文件在该提交中的差异。 */
  const showDiff = useCallback((): void => {
    if (selection === null) return

    openFileDiff(selection)
  }, [openFileDiff, selection])

  /** 按选中的文件打开 History 页签。 */
  const showHistory = useCallback((): void => {
    if (selection === null) return

    services.requestFileHistory(selection)
  }, [selection, services])

  /**
   * 把选中文件恢复到该提交之前的状态。
   * @param path 文件路径
   * @param parent 该提交的父提交
   */
  const revertToParent = useCallback(
    async (path: string, parent: string): Promise<void> => {
      try {
        const result = await restoreFrom(root, parent, [path])

        if (!result.ok) {
          services.toast('error', result.error.message)

          return
        }

        // 索引与工作区都变了：Git 状态、项目树和差异视图都要按新的内容重读
        services.refreshGitStatus()
        services.invalidate(path)
        services.toast('success', t('revertSelectedDone'))
      } catch (revertError: unknown) { // 网络失败时同样要告诉用户回滚没有执行
        console.error('[dsh-ide] Failed to revert selected changes:', revertError)
        services.toast('error', String(revertError))
      }
    },
    [root, services, t],
  )

  /** 打开回滚确认框：回滚会改写工作区，确认之后才真正执行。 */
  const requestRevert = useCallback((): void => {
    if (selection === null || detail === null) return

    const parent = detail.commit.parents[0]

    // 根提交没有父提交，没有可回滚到的版本
    if (parent === undefined) {
      services.toast('info', t('noParentCommit'))

      return
    }

    const path = selection

    setConfirm({
      title: t('revertSelectedChanges'),
      message: t('revertSelectedMessage').replace('{path}', path).replace('{hash}', detail.commit.shortHash),
      confirmLabel: t('rollback'),
      cancelLabel: t('cancel'),
      danger: true,
      run: () => void revertToParent(path, parent),
    })
  }, [detail, revertToParent, selection, services, t])

  /**
   * 打开文件树设置菜单：按目录分组与增删统计。
   *
   * 展开与折叠已经由工具栏上独立的两个按钮承担，这里不再重复这两项。
   * @param event 鼠标事件
   */
  const openSettingsMenu = useCallback(
    (event: React.MouseEvent): void => {
      setMenu({
        x: event.clientX - 180,
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
    },
    [grouped, showStats, t],
  )

  /** 全部展开：清空折叠集合即可。 */
  const expandAll = useCallback((): void => {
    setCollapsed(new Set())
  }, [])

  /** 全部折叠：把每个目录都收起来。 */
  const collapseAll = useCallback((): void => {
    setCollapsed(new Set(collectDirectories(tree)))
  }, [tree])

  return (
    <div ref={rootRef} className="flex h-full min-h-0 flex-col">
      {/* 工具栏：文件级动作在最左，文件树的全部展开/折叠在最右 */}
      <div className="flex h-[30px] shrink-0 items-center gap-0.5 border-b border-line1 px-2">
        {/* 在编辑器中打开：显示工作区里的该文件 */}
        <SideButton title={t('openInEditor')} disabled={selection === null} onClick={openInEditor}>
          {pencilIcon(16)}
        </SideButton>

        {/* 显示差异：在编辑器区打开选中文件在该提交中的差异 */}
        <SideButton title={t('showDiff')} disabled={selection === null} onClick={showDiff}>
          {diffIcon(16)}
        </SideButton>

        {/* 回滚选中文件：恢复到该提交之前的状态 */}
        <SideButton title={t('revertSelectedChanges')} disabled={selection === null} onClick={requestRevert}>
          {undoArrowIcon(16)}
        </SideButton>

        {/* 查看历史：按选中文件打开 History 页签 */}
        <SideButton title={t('showHistory')} disabled={selection === null} onClick={showHistory}>
          {clockIcon(16)}
        </SideButton>

        {/* 差异设置：小三角与主按钮都打开同一个菜单，Show Change Statistics 默认勾选 */}
        <SideButton
          title={t('diffSettings')}
          disabled={detail === null}
          onClick={openSettingsMenu}
          popupTitle={t('diffSettings')}
          onPopup={openSettingsMenu}
        >
          {eyeIcon(16)}
        </SideButton>

        <span className="flex-1" />

        {/* 全部展开：把提交文件树的目录全部打开 */}
        <SideButton title={t('expandAll')} disabled={!hasFiles} onClick={expandAll}>
          {expandAllIcon(16)}
        </SideButton>

        {/* 全部折叠：把提交文件树的目录全部收起 */}
        <SideButton title={t('collapseAll')} disabled={!hasFiles} onClick={collapseAll}>
          {collapseAllIcon(16)}
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
            <div className="flex h-5 items-center gap-1.5 pl-2 pr-2 text-xs">
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
                selectedPath={selection}
                onToggle={(path) =>
                  setCollapsed((previous) => {
                    const next = new Set(previous)
                    if (next.has(path)) next.delete(path)
                    else next.add(path)

                    return next
                  })
                }
                onSelect={setSelectedPath}
                onFile={openFileDiff}
                onFileMenu={openFileMenu}
              />
            ) : (
              detail.files.map((file) => (
                <button
                  key={file.path}
                  type="button"
                  title={file.path}
                  onClick={() => setSelectedPath(file.path)}
                  onDoubleClick={() => openFileDiff(file.path)}
                  onContextMenu={(event) => openFileMenu(event, file.path)}
                  className={cn(
                    'flex h-5 w-full items-center gap-1.5 pl-6 pr-2 text-left text-xs text-primary',
                    selection === file.path ? 'bg-treeselected' : 'hover:bg-surface2/60',
                  )}
                >
                  {fileIcon(file.path)}
                  {/* 文件名色调表示该提交内相对父提交的状态，与 Local Changes、Push 共用同一套 VCS 色 */}
                  <span className={cn('min-w-0 flex-1 truncate', statusTone(file.status))}>{file.path}</span>
                  {showStats && <FileStats added={file.added} removed={file.removed} />}
                </button>
              ))
            )}
          </>
        )}
      </div>

      {/* 文件树与提交详情之间的分隔条：拖动改变上下占比，尺寸属于下方详情区 */}
      <SplitHandle orientation="horizontal" anchor="back" current={() => detailHeight} onResize={resizeDetail} />

      {/* 提交详情：元信息与完整提交信息；与 IDEA 一致不画小标题，内容直接铺开。
          整块放开文本选择，提交说明与分支信息都要能整段复制出去 */}
      <div
        className="ide-selectable min-h-0 shrink overflow-auto px-3 py-2 text-[11px] leading-[17px]"
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

            {/* 完整提交信息：紧跟作者之后，保留原始换行 */}
            <div className="mt-2 whitespace-pre-wrap text-primary">
              {detail.commit.body !== undefined && detail.commit.body !== ''
                ? detail.commit.body
                : detail.commit.subject}
            </div>

            {/* 包含该提交的分支；HEAD 优先显示 */}
            {detail.branches.length > 0 && (
              <div className="mt-2 text-secondary">
                {t('inBranches').replace('{count}', String(detail.branches.length))}{' '}
                {detail.branches.join(', ')}
              </div>
            )}
          </>
        )}
      </div>

      {menu !== null && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}

      {/* 回滚确认框：改写工作区之前让用户确认受影响的文件与提交 */}
      {confirm !== null && (
        <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} dialogSizes={services.dialogSizes} />
      )}
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
  selectedPath,
  onToggle,
  onSelect,
  onFile,
  onFileMenu,
}: {
  t: Translate
  node: TreeNode
  depth: number
  collapsed: ReadonlySet<string>
  showStats: boolean
  /** 当前选中的文件路径；与它相等的行高亮。 */
  selectedPath: string | null
  onToggle(path: string): void
  onSelect(path: string): void
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
              onClick={() => onSelect(child.path)}
              onDoubleClick={() => onFile(child.path)}
              onContextMenu={(event) => onFileMenu(event, child.path)}
              style={{ paddingLeft: indent + 18 }}
              className={cn(
                'flex h-5 w-full items-center gap-1.5 pr-2 text-left text-xs',
                selectedPath === child.path ? 'bg-treeselected' : 'hover:bg-surface2/60',
              )}
            >
              {fileIcon(child.name)}
              {/* 文件名色调表示该提交内相对父提交的状态，与 Local Changes、Push 共用同一套 VCS 色 */}
              <span className={cn('min-w-0 flex-1 truncate', statusTone(child.status))}>{child.name}</span>
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
              className="flex h-5 w-full items-center gap-1.5 pr-2 text-left text-xs text-primary hover:bg-surface2/60"
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
                selectedPath={selectedPath}
                onToggle={onToggle}
                onSelect={onSelect}
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
  disabled = false,
  onClick,
  popupTitle,
  onPopup,
  children,
}: {
  title: string
  /** 没有可操作对象时禁用：按钮变灰且不响应点击。 */
  disabled?: boolean
  onClick(event: React.MouseEvent): void
  /** 右下角弹出菜单的提示；与 onPopup 同时给出时才渲染角标。 */
  popupTitle?: string
  onPopup?(event: React.MouseEvent): void
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        title={title}
        aria-label={title}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          'flex h-[22px] w-[22px] items-center justify-center rounded-[3px] transition-colors',
          disabled ? 'text-secondary/40' : 'text-secondary hover:bg-surface2 hover:text-primary',
        )}
      >
        {children}
      </button>

      {/* 右下角小三角：贴着按钮的右下角外侧，提示该按钮还带弹出菜单 */}
      {popupTitle !== undefined && onPopup !== undefined && (
        <button
          type="button"
          title={popupTitle}
          aria-label={popupTitle}
          disabled={disabled}
          onClick={onPopup}
          className="absolute -bottom-px -right-px flex h-[6px] w-[6px] items-end justify-end text-primary hover:text-info disabled:text-secondary/40"
        >
          {popupMarkIcon()}
        </button>
      )}
    </div>
  )
}
