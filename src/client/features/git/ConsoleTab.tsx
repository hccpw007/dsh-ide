/**
 * Git 面板的 Console 页签。
 *
 * 最左是与 IDEA 一致的竖向工具栏（是否换行、跳到底部、清空），右侧只读展示本面板
 * 执行过的命令：时间、工作目录、真实命令行、stdout 与 stderr。
 * stderr 用错误色显示（Git 的进度与远端提示都写在 stderr），URL 可点击。
 */
import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { cn } from '../../../common/cn'
import type { Translate } from '../../../types/plugin'
import type { IdeServices } from '../../shell/contract'

import { clearGitConsole, gitConsoleEntries, subscribeGitConsole, type GitConsoleEntry } from './console-store'
import { GitSideToolbar, type GitToolbarItem } from './GitSideToolbar'
import { scrollEndIcon, softWrapIcon, trashIcon } from './icons'
import { ContextMenu, type MenuItem, type MenuState } from './menu'

/** 换行开关的偏好；页签切换会重建组件，放在模块级才能沿用上一次的选择。 */
let wrapPreferred = true

/** 控制台 props。 */
export interface ConsoleTabProps {
  /** 已绑定 git 前缀的翻译函数。 */
  t: Translate
  /** 工作台服务总线，仅用于复制成功/失败的通知。 */
  services: IdeServices
}

/**
 * 把一行文本里的 URL 渲染成可点击链接。
 * @param line 原始行
 * @returns 文本与链接混排的节点
 */
function linkify(line: string): React.ReactNode {
  const parts = line.split(/(https?:\/\/[^\s]+)/g)

  return parts.map((part, index) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={`link:${String(index)}`}
        href={part}
        target="_blank"
        rel="noreferrer noopener"
        className="text-info underline decoration-info/50 hover:decoration-info"
      >
        {part}
      </a>
    ) : (
      <React.Fragment key={`text:${String(index)}`}>{part}</React.Fragment>
    ),
  )
}

/**
 * 把一段输出按行渲染；stderr 整段使用错误色。
 * @param props 文本、色调节奏与是否自动换行
 * @returns 输出块；没有内容时返回 null
 */
function OutputBlock({
  text,
  tone,
  wrap,
}: {
  text: string
  tone: 'stdout' | 'stderr'
  wrap: boolean
}): React.ReactElement | null {
  if (text === '') return null

  const lines = text.split('\n')
  // 去掉 Git 输出末尾的空行，避免每条记录底部多出空白
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()

  return (
    <div
      className={cn(
        wrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre',
        tone === 'stderr' ? 'text-danger' : 'text-primary',
      )}
    >
      {lines.map((line, index) => (
        <div key={`line:${String(index)}`}>{linkify(line)}</div>
      ))}
    </div>
  )
}

/**
 * 渲染命令记录。
 * @param props 见 ConsoleTabProps
 * @returns 记录列表
 */
export function ConsoleTab({ t, services }: ConsoleTabProps): React.ReactElement {
  const entries = useSyncExternalStore(subscribeGitConsole, gitConsoleEntries, gitConsoleEntries)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)

  // 新记录出现后滚到底部：控制台的核心用途是看最后一次操作
  useEffect(() => {
    const element = scrollRef.current
    if (element !== null) element.scrollTop = element.scrollHeight
  }, [entries])

  /**
   * 拼出控制台全部文本，供复制。
   * @returns 纯文本
   */
  const allText = useCallback(
    (): string =>
      entries
        .map((entry) => {
          const head = `${entry.time}: [${entry.cwd}] ${entry.command}`

          return [head, entry.stdout, entry.stderr].filter((part) => part.trim() !== '').join('\n')
        })
        .join('\n\n'),
    [entries],
  )

  /**
   * 复制全部输出。
   */
  const copyAll = useCallback((): void => {
    void navigator.clipboard.writeText(allText()).then(
      () => services.toast('success', t('copied')),
      (copyError: unknown) => {
        console.error('[dsh-ide] Failed to copy Git console:', copyError)
        services.toast('error', t('copyFailed'))
      },
    )
  }, [allText, services, t])

  /**
   * 选中控制台全部文本。
   */
  const selectAll = useCallback((): void => {
    const element = scrollRef.current
    if (element === null) return

    const selection = window.getSelection()
    if (selection === null) return

    const range = document.createRange()
    range.selectNodeContents(element)
    selection.removeAllRanges()
    selection.addRange(range)
  }, [])

  /**
   * 打开控制台右键菜单。
   * @param event 鼠标事件
   */
  const openMenu = useCallback(
    (event: React.MouseEvent): void => {
      event.preventDefault()

      const items: MenuItem[] = [
        { id: 'copy', label: t('consoleCopy'), run: copyAll },
        { id: 'select', label: t('selectAll'), run: selectAll },
        { id: 'clear', label: t('consoleClear'), separatorBefore: true, disabled: entries.length === 0, run: clearGitConsole },
      ]

      setMenu({ x: event.clientX, y: event.clientY, items })
    },
    [copyAll, entries.length, selectAll, t],
  )

  /** 左侧工具栏：控制台自身的三个操作；命令过滤尚未接入。 */
  const toolbar: GitToolbarItem[] = [
    { id: 'filter', title: t('filterOutput'), icon: filterIcon(), unavailable: t('notAvailable') },
    {
      id: 'scrollEnd',
      title: t('scrollToEnd'),
      icon: scrollEndIcon(),
      onClick: () => {
        const element = scrollRef.current
        if (element !== null) element.scrollTop = element.scrollHeight
      },
    },
    {
      id: 'clear',
      title: t('consoleClear'),
      icon: trashIcon(),
      separatorBefore: true,
      unavailable: entries.length === 0 ? t('consoleEmpty') : undefined,
      onClick: clearGitConsole,
    },
  ]

  return (
    <div className="flex h-full min-h-0">
      <GitSideToolbar label={t('title')} items={toolbar} />

      <div className="flex min-h-0 flex-1 flex-col">
        <div
          ref={scrollRef}
        onContextMenu={openMenu}
          className="min-h-0 flex-1 select-text overflow-auto px-2 py-1.5 font-mono text-[12px] leading-[19px]"
        >
          {entries.length === 0 && <div className="text-secondary">{t('consoleEmpty')}</div>}

          {entries.map((entry) => (
            <ConsoleEntry key={entry.id} entry={entry} />
          ))}
        </div>
      </div>

      {menu !== null && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </div>
  )
}

/** 单条记录。 */
function ConsoleEntry({ entry }: { entry: GitConsoleEntry }): React.ReactElement {
  return (
    <div className="mb-2">
      {/* 时间、工作目录与真实命令行；一次操作可能先后跑多条命令，按行显示 */}
      <div className="whitespace-pre-wrap break-all">
        <span className="text-secondary">{entry.time}:</span>{' '}
        <span className="text-secondary">[{entry.cwd}]</span>{' '}
        <span className={entry.ok ? 'text-primary' : 'text-danger'}>{entry.command}</span>
      </div>

      <OutputBlock text={entry.stdout} tone="stdout" />
      <OutputBlock text={entry.stderr} tone="stderr" />
    </div>
  )
}
