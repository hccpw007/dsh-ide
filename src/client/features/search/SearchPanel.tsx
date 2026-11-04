/**
 * 全局搜索面板。
 *
 * 一次搜索同时覆盖文件名与文件内容，两者由宿主侧一次请求返回（`/fs/search`），客户端
 * 只负责输入、取消与结果展示。结果分「文件名」「内容」两段：文件名命中一行一个文件，
 * 内容命中按文件聚合——两类结果的用途不同，混在一张列表里无法分辨该点哪个。
 * 连续输入时取消上一次请求：搜索在大仓库里要跑几秒，让旧结果覆盖新查询是最常见
 * 的体验问题。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { apiGet } from '../../../common/api'
import { Checkbox } from '../../common/Checkbox'
import { openIdeContextMenu } from '../../../common/context-menu'
import type { FeatureViewProps } from '../../shell/contract'

/** 一条内容匹配。 */
interface SearchMatch {
  /** 相对路径。 */
  path: string
  /** 行号。 */
  line: number
  /** 列号。 */
  column: number
  /** 该行文本。 */
  text: string
}

/** 一条文件名匹配。 */
interface SearchFileHit {
  /** 相对路径。 */
  path: string
  /** 文件名（不含目录）。 */
  name: string
}

/**
 * 取相对路径的所在目录，根目录下的文件返回空串。
 * @param path 相对路径
 * @returns 目录部分
 */
function directoryOf(path: string): string {
  const index = path.lastIndexOf('/')

  return index < 0 ? '' : path.slice(0, index)
}

/**
 * 渲染搜索面板。
 * @param props 见 FeatureViewProps
 * @returns 搜索框与按类型分段的搜索结果
 */
export function SearchPanel({ t, services }: FeatureViewProps): React.ReactElement {
  const [query, setQuery] = useState('')
  const [regex, setRegex] = useState(false)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [exclude, setExclude] = useState('')
  const [fileHits, setFileHits] = useState<SearchFileHit[]>([])
  const [matches, setMatches] = useState<SearchMatch[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [truncated, setTruncated] = useState(false)
  const [filesTruncated, setFilesTruncated] = useState(false)

  /** 上一次请求的取消控制器。 */
  const controllerRef = useRef<AbortController | null>(null)
  const root = services.root

  // 默认排除项来自设置；用户改设置后同步一次
  useEffect(() => {
    setExclude(services.settings().searchExclude)
  }, [services])

  /**
   * 执行搜索。
   */
  const search = useCallback(async (): Promise<void> => {
    const text = query.trim()
    if (text === '' || root === '') return

    // 取消上一次查询：旧结果落地会盖掉新的
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller

    setBusy(true)
    setError('')

    try {
      const result = await apiGet<{
        files: SearchFileHit[]
        filesTruncated: boolean
        matches: SearchMatch[]
        truncated: boolean
        filesScanned: number
      }>(
        '/fs/search',
        {
          root,
          q: text,
          regex: regex ? '1' : '0',
          caseSensitive: caseSensitive ? '1' : '0',
          wholeWord: wholeWord ? '1' : '0',
          exclude,
        },
        controller.signal,
      )

      if (controller.signal.aborted) return

      if (!result.ok) {
        setFileHits([])
        setMatches([])
        setError(result.error.message)

        return
      }

      setFileHits(result.value.files)
      setMatches(result.value.matches)
      setTruncated(result.value.truncated)
      setFilesTruncated(result.value.filesTruncated)
    } finally {
      if (!controller.signal.aborted) setBusy(false)
    }
  }, [caseSensitive, exclude, query, regex, root, wholeWord])

  // 查询条件变化后清空旧结果，避免显示与当前条件不符的命中
  useEffect(() => {
    setFileHits([])
    setMatches([])
    setTruncated(false)
    setFilesTruncated(false)
  }, [caseSensitive, exclude, query, regex, wholeWord])

  // 卸载时取消进行中的请求
  useEffect(() => () => controllerRef.current?.abort(), [])

  // 按文件聚合：命中可达数千条，放在 render 内会在每次状态变化时重建整张表
  const groups = useMemo(() => {
    const grouped = new Map<string, SearchMatch[]>()

    for (const match of matches) {
      const bucket = grouped.get(match.path) ?? []
      bucket.push(match)
      grouped.set(match.path, bucket)
    }

    return grouped
  }, [matches])

  const empty = fileHits.length === 0 && matches.length === 0

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-base"
      // 搜索面板右键：重跑查询、清空结果、复制查询词与设置入口
      onContextMenu={(event) => {
        if (event.defaultPrevented) return

        openIdeContextMenu(event, services, [
          {
            id: 'rerun',
            label: t('menuRerun'),
            ...(busy || query.trim() === '' ? {} : { run: () => void search() }),
          },
          {
            id: 'clearResults',
            label: t('menuClearResults'),
            // 文件名与内容任一有结果即可清空
            ...(empty
              ? {}
              : {
                  run: () => {
                    setFileHits([])
                    setMatches([])
                  },
                }),
          },
          {
            id: 'copyQuery',
            label: t('menuCopyQuery'),
            separatorBefore: true,
            ...(query === ''
              ? {}
              : {
                  run: () => {
                    void navigator.clipboard.writeText(query).catch((error: unknown) => {
                      console.error('[dsh-ide] 复制查询词失败:', error)
                      services.toast('error', t('menuCopyFailed'))
                    })
                  },
                }),
          },
          {
            id: 'settings',
            label: t('menuSettings'),
            separatorBefore: true,
            run: () => services.openPage('settings'),
          },
        ])
      }}
    >
      {/* 搜索条件 */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line1 bg-surface1 px-2 py-1">
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void search()
          }}
          placeholder={t('placeholder')}
          className="min-w-0 flex-1 rounded border border-line2 bg-base px-2 py-0.5 text-xs text-primary outline-none focus:border-line4"
        />

        {/* 执行搜索 */}
        <button
          type="button"
          disabled={busy || query.trim() === ''}
          onClick={() => void search()}
          className="rounded border border-line2 px-1.5 py-0.5 text-xs text-primary hover:bg-surface2 disabled:opacity-40"
        >
          {busy ? t('searching') : t('search')}
        </button>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-line1 px-2 py-1 text-[11px] text-secondary">
        {/* 按正则匹配 */}
        <Checkbox checked={regex} onChange={setRegex} label={t('regex')} />

        {/* 区分大小写 */}
        <Checkbox checked={caseSensitive} onChange={setCaseSensitive} label={t('caseSensitive')} />

        {/* 全词匹配 */}
        <Checkbox checked={wholeWord} onChange={setWholeWord} label={t('wholeWord')} />

        <input
          value={exclude}
          onChange={(event) => setExclude(event.target.value)}
          placeholder={t('excludePlaceholder')}
          className="min-w-32 flex-1 rounded border border-line2 bg-base px-1.5 py-0.5 text-[11px] text-primary outline-none focus:border-line4"
        />
      </div>

      {root === '' && <div className="p-3 text-xs text-secondary">{t('noSession')}</div>}
      {error !== '' && <div className="shrink-0 px-2 py-1 text-xs text-danger">{error}</div>}

      {/* 结果：文件名与内容分段展示 */}
      <div className="min-h-0 flex-1 overflow-auto px-1 py-1">
        {/* 文件名命中段：一行一个文件，点击打开 */}
        {fileHits.length > 0 && (
          <div className="mb-2">
            <div className="flex items-center gap-2 px-1 py-0.5">
              {/* 文件名结果段标题 */}
              <span className="text-[11px] font-semibold text-secondary">{t('sectionFiles')}</span>
              <span className="text-[11px] text-secondary">{fileHits.length}</span>
            </div>

            {fileHits.map((hit) => (
              <button
                key={hit.path}
                type="button"
                onClick={() => services.openFile(hit.path)}
                className="flex w-full items-baseline gap-2 rounded px-3 py-0.5 text-left text-xs hover:bg-surface2"
              >
                {/* 命中文件名 */}
                <span className="shrink-0 text-primary">{hit.name}</span>

                {/* 文件所在目录：弱化显示，用于区分同名文件 */}
                <span className="min-w-0 flex-1 truncate text-[11px] text-secondary">
                  {directoryOf(hit.path)}
                </span>
              </button>
            ))}

            {/* 文件名结果被上限截断 */}
            {filesTruncated && <div className="px-3 py-1 text-[11px] text-warn">{t('filesTruncated')}</div>}
          </div>
        )}

        {/* 内容命中段：按文件聚合 */}
        {groups.size > 0 && (
          <>
            <div className="flex items-center gap-2 px-1 py-0.5">
              {/* 内容结果段标题 */}
              <span className="text-[11px] font-semibold text-secondary">{t('sectionText')}</span>
              <span className="text-[11px] text-secondary">{matches.length}</span>
            </div>

            {[...groups.entries()].map(([path, items]) => (
              <div key={path} className="mb-1">
                {/* 文件分组标题 */}
                <div className="flex items-center gap-1 px-1 py-0.5">
                  <button
                    type="button"
                    onClick={() => services.openFile(path)}
                    className="min-w-0 flex-1 truncate bg-transparent px-1.5 py-px text-left text-xs text-primary hover:underline"
                  >
                    {path}
                  </button>
                  <span className="shrink-0 text-[11px] text-secondary">{items.length}</span>
                </div>

                {items.map((match) => (
                  <button
                    key={`${match.path}:${String(match.line)}:${String(match.column)}`}
                    type="button"
                    onClick={() => services.revealLine(path, match.line)}
                    className="flex w-full items-baseline gap-2 rounded px-3 py-0.5 text-left text-xs hover:bg-surface2"
                  >
                    {/* 行号 */}
                    <span className="shrink-0 font-mono text-[11px] text-secondary">{match.line}</span>

                    {/* 命中行文本 */}
                    <span className="min-w-0 flex-1 truncate text-primary">{match.text}</span>
                  </button>
                ))}
              </div>
            ))}
          </>
        )}

        {empty && !busy && query.trim() !== '' && root !== '' && (
          <div className="px-2 py-2 text-xs text-secondary">{t('empty')}</div>
        )}

        {truncated && <div className="px-2 py-1 text-xs text-warn">{t('truncated')}</div>}
      </div>
    </div>
  )
}
