/**
 * 书签工具窗口。
 *
 * 书签按会话保存在布局存储里，切换会话互不干扰。「切换书签」命令作用于编辑器
 * 当前活动文件；列表点击跳转。
 */
import React, { useCallback, useEffect, useState } from 'react'

import type { FeatureViewProps } from '../../shell/contract'

/** 一条书签。 */
interface Bookmark {
  /** 相对路径。 */
  path: string
  /** 行号。 */
  line: number
  /** 备注。 */
  note: string
}

/** 存储前缀；带版本段，格式变更时换版本。 */
const STORAGE_PREFIX = 'dsh-ide.bookmarks.v1.'

/**
 * 读取某个会话的书签。
 * @param sessionId 会话 id
 * @returns 书签列表
 */
function loadBookmarks(sessionId: string): Bookmark[] {
  if (sessionId === '') return []

  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${sessionId}`)
    const parsed: unknown = raw === null ? [] : JSON.parse(raw)

    return Array.isArray(parsed)
      ? parsed.filter((item): item is Bookmark =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as Bookmark).path === 'string' &&
          typeof (item as Bookmark).line === 'number',
        )
      : []
  } catch (error) { // 存储损坏时从空列表开始
    console.error('[dsh-ide] 读取书签失败:', error)

    return []
  }
}

/**
 * 保存某个会话的书签。
 * @param sessionId 会话 id
 * @param bookmarks 书签列表
 */
function saveBookmarks(sessionId: string, bookmarks: Bookmark[]): void {
  if (sessionId === '') return

  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${sessionId}`, JSON.stringify(bookmarks))
  } catch (error) { // 隐私模式下写入失败，仅影响刷新后的恢复
    console.error('[dsh-ide] 保存书签失败:', error)
  }
}

/**
 * 渲染书签面板。
 * @param props 见 FeatureViewProps
 * @returns 书签列表
 */
export function BookmarksPanel({ t, sessionId, services }: FeatureViewProps): React.ReactElement {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => loadBookmarks(sessionId))
  const [line, setLine] = useState(1)

  // 会话变化时换用该会话的书签
  useEffect(() => {
    setBookmarks(loadBookmarks(sessionId))
  }, [sessionId])

  // 当前行跟随活动文件；这里只在打开文件时取默认值，精确行号由编辑器上报
  useEffect(
    () =>
      services.subscribeActiveFile(() => {
        setLine(1)
      }),
    [services],
  )

  /**
   * 在当前文件的当前行切换书签。
   */
  const toggle = useCallback((): void => {
    const path = services.activeFile()
    if (path === null) {
      services.notify('info', t('noFile'))

      return
    }

    setBookmarks((previous) => {
      const exists = previous.some((item) => item.path === path && item.line === line)
      const next = exists
        ? previous.filter((item) => !(item.path === path && item.line === line))
        : [...previous, { path, line, note: '' }]

      saveBookmarks(sessionId, next)

      return next
    })
  }, [line, services, sessionId, t])

  /**
   * 移除一条书签。
   * @param target 书签
   */
  const remove = useCallback(
    (target: Bookmark): void => {
      setBookmarks((previous) => {
        const next = previous.filter((item) => !(item.path === target.path && item.line === target.line))
        saveBookmarks(sessionId, next)

        return next
      })
    },
    [sessionId],
  )

  return (
    <div className="flex min-h-full flex-col">
      {/* 标题栏：面板名与切换书签 */}
      <div className="sticky top-0 z-10 flex h-9 shrink-0 items-center justify-between gap-2 border-b border-line1 bg-layer1 px-3">
        {/* 面板名称 */}
        <span className="truncate text-xs font-medium text-primary">{t('title')}</span>

        <div className="flex items-center gap-1">
          {/* 行号输入：书签落在这一行 */}
          <input
            type="number"
            min={1}
            value={line}
            onChange={(event) => setLine(Math.max(1, Number(event.target.value) || 1))}
            title={t('lineLabel')}
            className="w-14 rounded border border-line2 bg-base px-1 py-0.5 text-[11px] text-primary outline-none focus:border-line4"
          />

          {/* 在当前行切换书签 */}
          <button
            type="button"
            onClick={toggle}
            className="rounded border border-line2 px-1.5 py-0.5 text-[11px] text-primary hover:bg-layer2"
          >
            {t('toggle')}
          </button>
        </div>
      </div>

      <div className="flex-1 py-1">
        {bookmarks.map((bookmark) => (
          <div
            key={`${bookmark.path}:${String(bookmark.line)}`}
            className="group flex items-center gap-1 rounded px-2 py-0.5 hover:bg-layer2"
          >
            {/* 书签图标 */}
            <span className="shrink-0 text-info">◆</span>

            {/* 文件名与行号：点击跳转 */}
            <button
              type="button"
              onClick={() => services.revealLine(bookmark.path, bookmark.line)}
              title={bookmark.path}
              className="min-w-0 flex-1 truncate bg-transparent text-left text-xs text-primary hover:underline"
            >
              {bookmark.path}:{bookmark.line}
            </button>

            {/* 移除书签 */}
            <button
              type="button"
              onClick={() => remove(bookmark)}
              className="shrink-0 rounded px-1 text-[11px] text-danger opacity-0 hover:bg-layer1 group-hover:opacity-100"
            >
              ×
            </button>
          </div>
        ))}

        {bookmarks.length === 0 && <div className="px-3 py-2 text-xs text-secondary">{t('empty')}</div>}
      </div>
    </div>
  )
}
