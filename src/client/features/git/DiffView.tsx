/**
 * Local Changes 右侧的内嵌差异视图。
 *
 * 与 IDEA 的 Git 差异页对齐：工具栏含差异块导航、编辑器入口、文件导航、差异数量、
 * 布局切换与设置；正文是带行号、词级高亮与折叠段的并排/行内差异。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

import { cn } from '../../../common/cn'
import type { SyntaxLines } from '../../../common/syntax-highlight'
import type { Translate } from '../../../types/plugin'
import type { IdeServices } from '../../shell/contract'
import { highlightLines } from '../../lazy/highlight'

import { readWorktreeDiff } from './api'
import { changeStarts, computeDiffRows, findFolds, type DiffRow } from './diff-model'
import {
  arrowLeftIcon,
  arrowRightIcon,
  arrowDownIcon,
  arrowUpIcon,
  closeIcon,
  gearIcon,
  lockIcon,
  pencilIcon,
} from './icons'
import { ContextMenu, type MenuItem, type MenuState } from './menu'
import { DiffTable, InlineDiff } from './DiffTable'

/** 当前查看的变更文件。 */
export interface SelectedChange {
  /** 相对仓库根的路径。 */
  path: string
  /** 右侧取索引区还是工作区。 */
  staged: boolean
}

/** 差异视图 props。 */
export interface DiffViewProps {
  /** 已绑定 git 前缀的翻译函数。 */
  t: Translate
  /** 工作台服务总线。 */
  services: IdeServices
  /** 工作区根。 */
  root: string
  /** 当前选中的文件；null 时显示空态。 */
  file: SelectedChange | null
  /** 同组可见文件，用于「2/2 files」导航。 */
  files: SelectedChange[]
  /** 切换文件。 */
  onSelectFile(file: SelectedChange): void
  /** 关闭差异视图。 */
  onClose(): void
  /** 变更组数量或写操作后递增，触发重新取数。 */
  revision: number
  /** HEAD 短 hash，显示在差异标题里。 */
  headShort: string
}

/** 差异取数状态。 */
type LoadState =
  | { kind: 'empty' }
  | { kind: 'loading' }
  | { kind: 'binary' }
  | { kind: 'too-large'; bytes: number }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; rows: DiffRow[]; isNew: boolean }

/** 差异布局。 */
type DiffMode = 'side-by-side' | 'inline'

/** 两侧语法高亮片段，按行号索引。 */
interface DiffSyntax {
  /** 旧侧片段。 */
  left: SyntaxLines
  /** 新侧片段。 */
  right: SyntaxLines
}

/** 尚无高亮结果时的空值。 */
const NO_SYNTAX: DiffSyntax = { left: [], right: [] }

/**
 * 渲染内嵌差异。
 * @param props 见 DiffViewProps
 * @returns 工具栏、标题与逐行差异
 */
export function DiffView({
  t,
  services,
  root,
  file,
  files,
  onSelectFile,
  onClose,
  revision,
  headShort,
}: DiffViewProps): React.ReactElement {
  const [state, setState] = useState<LoadState>({ kind: 'empty' })
  const [mode, setMode] = useState<DiffMode>('side-by-side')
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false)
  const [ignoreCase, setIgnoreCase] = useState(false)
  const [opened, setOpened] = useState<ReadonlySet<number>>(() => new Set())
  const [menu, setMenu] = useState<MenuState | null>(null)
  /** 两侧语法高亮；解析到位前为空，正文先以默认色显示。 */
  const [syntax, setSyntax] = useState<DiffSyntax>(NO_SYNTAX)
  /** 当前差异块序号，供上下箭头循环跳转。 */
  const [changeIndex, setChangeIndex] = useState(-1)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // 订阅设置：字号与行距改了要立刻作用到 diff 正文；不订阅时组件不重渲染，正文停在旧度量
  const settings = useSyncExternalStore(
    (listener) => services.subscribeSettings(listener),
    () => services.settings(),
    () => services.settings(),
  )
  const fontSize = settings.fontSize
  const lineHeight = settings.lineHeight

  // 文件或写操作变化后重新取数；折叠状态一并重置，避免把旧下标套到新内容上
  useEffect(() => {
    if (file === null) {
      setState({ kind: 'empty' })

      return
    }

    let alive = true

    setState({ kind: 'loading' })
    setOpened(new Set())
    setChangeIndex(-1)
    setSyntax(NO_SYNTAX)

    void readWorktreeDiff(root, file.path, file.staged)
      .then(async (result) => {
        if (!alive) return

        if (!result.ok) {
          setState({ kind: 'error', message: result.error.message })

          return
        }

        if (result.value.binary) {
          setState({ kind: 'binary' })

          return
        }

        // 与客户端一致的上限；服务端已拒绝更大的内容，这里只做兜底
        if (result.value.bytes > 2 * 1024 * 1024) {
          setState({ kind: 'too-large', bytes: result.value.bytes })

          return
        }

        const rows = await computeDiffRows(result.value.left, result.value.right, { ignoreWhitespace, ignoreCase })

        if (!alive) return

        setState({ kind: 'ready', rows, isNew: result.value.isNew })

        // 高亮比差异计算慢，单独一轮补齐：先让正文出现，颜色到位后再覆盖，
        // 打开面板时不必等语法解析
        void Promise.all([
          highlightLines(file.path, result.value.left),
          highlightLines(file.path, result.value.right),
        ])
          .then(([left, right]) => {
            if (!alive) return

            setSyntax({ left, right })
          })
          .catch((error: unknown) => {
            console.error('[dsh-ide] Git 差异语法高亮失败:', error)
          })
      })
      .catch((error: unknown) => {
        console.error('[dsh-ide] Failed to load Git diff:', error)
        if (alive) setState({ kind: 'error', message: String(error) })
      })

    return () => {
      alive = false
    }
  }, [file, ignoreCase, ignoreWhitespace, revision, root])

  const rows = state.kind === 'ready' ? state.rows : []
  /** 新增文件（HEAD 里没有该路径）：标题只标当前版本，不给出无意义的比较基准。 */
  const isNew = state.kind === 'ready' && state.isNew
  const folds = useMemo(() => findFolds(rows, 3), [rows])
  const starts = useMemo(() => changeStarts(rows), [rows])

  /**
   * 跳到上一处 / 下一处差异。
   * @param step 方向
   */
  const gotoChange = useCallback(
    (step: 1 | -1): void => {
      if (starts.length === 0) return

      const next = (changeIndex + step + starts.length) % starts.length
      setChangeIndex(next)

      const target = scrollRef.current?.querySelector(`[data-row="${String(starts[next])}"]`)
      target?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    },
    [changeIndex, starts],
  )

  /** 文件导航：在同组可见文件里循环。 */
  const fileIndex = file === null ? -1 : files.findIndex((item) => item.path === file.path && item.staged === file.staged)

  /**
   * 切换到相邻文件。
   * @param step 方向
   */
  const gotoFile = useCallback(
    (step: 1 | -1): void => {
      if (files.length === 0 || fileIndex < 0) return

      const next = (fileIndex + step + files.length) % files.length
      const target = files[next]
      if (target !== undefined) onSelectFile(target)
    },
    [fileIndex, files, onSelectFile],
  )

  /** 打开差异设置菜单。 */
  const openSettings = useCallback(
    (event: React.MouseEvent): void => {
      const items: MenuItem[] = [
        {
          id: 'whitespace',
          label: `${ignoreWhitespace ? '✓ ' : ''}${t('ignoreWhitespace')}`,
          run: () => setIgnoreWhitespace((previous) => !previous),
        },
        {
          id: 'case',
          label: `${ignoreCase ? '✓ ' : ''}${t('ignoreCase')}`,
          run: () => setIgnoreCase((previous) => !previous),
        },
      ]

      setMenu({ x: event.clientX - 150, y: event.clientY + 12, items })
    },
    [ignoreCase, ignoreWhitespace, t],
  )

  return (
    <div className="flex h-full min-h-0 flex-col bg-code">
      {file !== null && (
        <>
          {/* 工具栏是 IDEA 的深色圆角面板：块本身用标签栏底色，四周留出间距，不与内容区贴边 */}
          <div className="shrink-0 p-1.5">
            <div className="flex h-8 items-center gap-0.5 rounded-md bg-tabbar px-1.5">
              <ToolbarButton title={t('previousDifference')} onClick={() => gotoChange(-1)} disabled={starts.length === 0}>
                {arrowUpIcon()}
              </ToolbarButton>
              <ToolbarButton title={t('nextDifference')} onClick={() => gotoChange(1)} disabled={starts.length === 0}>
                {arrowDownIcon()}
              </ToolbarButton>

              <ToolbarButton title={t('openInEditor')} onClick={() => file !== null && services.openFile(file.path)}>
                {pencilIcon()}
              </ToolbarButton>

              <Divider />

              <ToolbarButton title={t('previousFile')} onClick={() => gotoFile(-1)} disabled={files.length < 2}>
                {arrowLeftIcon()}
              </ToolbarButton>

              {/* 单个文件时只报数量，多个文件时给出「第几个/共几个」，与 IDEA 一致 */}
              <span className="px-0.5 text-[11px] text-secondary">
                {files.length === 1
                  ? `1 ${t('file')}`
                  : `${String(fileIndex < 0 ? 0 : fileIndex + 1)}/${String(files.length)} ${t('files')}`}
              </span>

              <ToolbarButton title={t('nextFile')} onClick={() => gotoFile(1)} disabled={files.length < 2}>
                {arrowRightIcon()}
              </ToolbarButton>

              <ToolbarButton title={t('closeDiff')} onClick={onClose}>
                {closeIcon()}
              </ToolbarButton>

              <span className="flex-1" />

              {/* 差异块数量：与 IDEA 的「N difference」对应 */}
              <span className="shrink-0 px-2 text-[11px] text-secondary">
                {starts.length} {starts.length === 1 ? t('difference') : t('differences')}
              </span>

              {/* 并排 / 行内布局切换 */}
              <div className="flex items-center rounded border border-line1">
                <ModeButton
                  title={t('sideBySide')}
                  active={mode === 'side-by-side'}
                  onClick={() => setMode('side-by-side')}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.1">
                    <rect x="1.5" y="2.5" width="13" height="11" rx="1" />
                    <path d="M8 2.5v11" />
                  </svg>
                </ModeButton>

                <ModeButton title={t('singleColumn')} active={mode === 'inline'} onClick={() => setMode('inline')}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.1">
                    <rect x="1.5" y="2.5" width="13" height="11" rx="1" />
                    <path d="M4.5 2.5v11" />
                  </svg>
                </ModeButton>
              </div>

              <ToolbarButton title={t('diffSettings')} onClick={openSettings}>
                {gearIcon()}
              </ToolbarButton>
            </div>
          </div>
        </>
      )}

      {file !== null && (
        // 差异标题：新增文件没有旧版本，只标出当前版本；其余给出比较基准与两侧版本名
        <div className="flex h-7 shrink-0 items-center gap-1.5 bg-code px-2 text-[11px]">
          {isNew ? (
            <>
              <span className="shrink-0 font-mono text-primary">{t('currentVersion')}</span>

              <span className="min-w-0 flex-1 truncate text-secondary">{file.path}</span>
            </>
          ) : (
            <>
              {lockIcon()}

              {/* 比较基准：HEAD 的短 hash，与 IDEA 一致 */}
              <span className="font-mono text-secondary">{headShort === '' ? 'HEAD' : headShort}</span>

              <span className="min-w-0 flex-1 truncate text-primary">{file.path}</span>

              {/* 右侧版本名：与差异表格内的列标题对齐 */}
              <span className="shrink-0 text-[11px] text-secondary">
                {file.staged ? 'Index version' : t('currentVersion')}
              </span>
            </>
          )}
        </div>
      )}

      {state.kind === 'empty' && (
        <div className="flex flex-1 items-center justify-center p-6 text-xs text-secondary">{t('selectFile')}</div>
      )}

      {state.kind === 'loading' && <div className="p-3 text-xs text-secondary">{t('loading')}</div>}

      {state.kind === 'error' && <div className="p-3 text-xs text-danger">{state.message || t('loadFailed')}</div>}

      {state.kind === 'binary' && <div className="p-3 text-xs text-secondary">{t('binaryFile')}</div>}

      {state.kind === 'too-large' && (
        <div className="p-3 text-xs text-warn">
          {/* 超过上限时给出实际大小，而不是静默不显示 */}
          {t('tooLarge')} ({(state.bytes / 1024 / 1024).toFixed(1)} MiB)
        </div>
      )}

      {state.kind === 'ready' && rows.length === 0 && (
        <div className="p-3 text-xs text-secondary">{t('identical')}</div>
      )}

      {state.kind === 'ready' && rows.length > 0 && (
        // 差异正文属于内容区：全局禁选之下单独放开，便于复制代码片段
        // 字号与行距由设置决定并在此继承给表格：设置页改完立刻作用到 diff 正文
        <div
          ref={scrollRef}
          className="ide-selectable min-h-0 flex-1 overflow-auto pb-2"
          style={{ fontSize: `${String(fontSize)}px`, lineHeight }}
        >
          {mode === 'side-by-side' ? (
            <DiffTable
              rows={rows}
              folds={folds}
              opened={opened}
              leftSyntax={syntax.left}
              rightSyntax={syntax.right}
              expandLabel={t('expandLines')}
              linesLabel={t('linesLabel')}
              onExpand={(index) => setOpened((previous) => new Set(previous).add(index))}
            />
          ) : (
            <InlineDiff
              rows={rows}
              folds={folds}
              opened={opened}
              leftSyntax={syntax.left}
              rightSyntax={syntax.right}
              linesLabel={t('linesLabel')}
              onExpand={(index) => setOpened((previous) => new Set(previous).add(index))}
            />
          )}
        </div>
      )}

      {menu !== null && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </div>
  )
}

/** 工具栏图标按钮。 */
function ToolbarButton({
  title,
  onClick,
  disabled = false,
  children,
}: {
  title: string
  onClick(event: React.MouseEvent): void
  disabled?: boolean
  children: React.ReactNode
}): React.ReactElement {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className="flex h-6 w-6 items-center justify-center rounded text-secondary transition-colors hover:bg-surface2 hover:text-primary disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}

/** 布局切换按钮。 */
function ModeButton({
  title,
  active,
  onClick,
  children,
}: {
  title: string
  active: boolean
  onClick(): void
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
        'flex h-5 w-6 items-center justify-center',
        active ? 'bg-info/25 text-primary' : 'text-secondary hover:bg-surface2 hover:text-primary',
      )}
    >
      {children}
    </button>
  )
}

/** 工具栏分隔线。 */
function Divider(): React.ReactElement {
  return <span className="mx-1 h-4 w-px bg-line1" />
}
