/**
 * TODO 工具窗口。
 *
 * 按需扫描整个工作区的 `TODO` / `FIXME` / `HACK` / `XXX` 标记，结果按文件聚合、
 * 可按标记类型过滤。不常驻轮询：扫描是重操作，只在用户点「扫描」时执行。
 */
import React, { useCallback, useMemo, useState } from 'react'

import { apiGet } from '../../../common/api'
import { cn } from '../../../common/cn'
import type { FeatureViewProps } from '../../shell/contract'

/** 支持的标记类型。 */
const MARKERS = ['TODO', 'FIXME', 'HACK', 'XXX'] as const

/** 一个标记类型。 */
type Marker = (typeof MARKERS)[number]

/** 一条标记。 */
interface TodoItem {
  /** 相对路径。 */
  path: string
  /** 行号。 */
  line: number
  /** 标记类型。 */
  marker: Marker
  /** 标记之后的说明文字。 */
  text: string
}

/** 扫描结果被截断时提示。 */
interface ScanState {
  /** 是否正在扫描。 */
  busy: boolean
  /** 已扫描文件数。 */
  scanned: number
  /** 是否截断。 */
  truncated: boolean
  /** 错误信息。 */
  error: string
}

/** 标记配色。 */
function markerTone(marker: Marker): string {
  if (marker === 'FIXME') return 'text-danger'
  if (marker === 'HACK') return 'text-warn'
  if (marker === 'XXX') return 'text-info'

  return 'text-secondary'
}

/**
 * 从搜索结果里抽取出标记。
 * @param matches 搜索命中
 * @returns 标记列表
 */
function toTodos(matches: { path: string; line: number; text: string }[]): TodoItem[] {
  const items: TodoItem[] = []

  for (const match of matches) {
    for (const marker of MARKERS) {
      const index = match.text.indexOf(marker)
      if (index < 0) continue

      items.push({
        path: match.path,
        line: match.line,
        marker,
        // 标记之后的说明，去掉常见的冒号与前导空格
        text: match.text.slice(index + marker.length).replace(/^[\s:：-]+/u, '').slice(0, 160),
      })

      break
    }
  }

  return items
}

/**
 * 渲染 TODO 面板。
 * @param props 见 FeatureViewProps
 * @returns 标记列表
 */
export function TodoPanel({ t, services }: FeatureViewProps): React.ReactElement {
  const [items, setItems] = useState<TodoItem[]>([])
  const [filter, setFilter] = useState<Marker | ''>('')
  const [state, setState] = useState<ScanState>({ busy: false, scanned: 0, truncated: false, error: '' })

  const root = services.root

  /**
   * 扫描工作区。
   *
   * 复用文件搜索路由：一次正则同时匹配四种标记，避免为 TODO 单开一套遍历。
   */
  const scan = useCallback(async (): Promise<void> => {
    if (root === '') return

    setState({ busy: true, scanned: 0, truncated: false, error: '' })

    const result = await apiGet<{
      matches: { path: string; line: number; text: string }[]
      truncated: boolean
      filesScanned: number
    }>('/fs/search', {
      root,
      q: MARKERS.join('|'),
      regex: '1',
      caseSensitive: '1',
      wholeWord: '1',
    })

    if (!result.ok) {
      setState({ busy: false, scanned: 0, truncated: false, error: result.error.message })

      return
    }

    setItems(toTodos(result.value.matches))
    setState({
      busy: false,
      scanned: result.value.filesScanned,
      truncated: result.value.truncated,
      error: '',
    })
  }, [root])

  const visible = useMemo(() => (filter === '' ? items : items.filter((item) => item.marker === filter)), [filter, items])

  const groups = useMemo(() => {
    const map = new Map<string, TodoItem[]>()

    for (const item of visible) {
      const bucket = map.get(item.path) ?? []
      bucket.push(item)
      map.set(item.path, bucket)
    }

    return map
  }, [visible])

  return (
    <div className="flex min-h-full flex-col">
      {/* 标题栏：面板名、扫描与过滤 */}
      <div className="sticky top-0 z-10 flex h-9 shrink-0 items-center gap-1 border-b border-line1 bg-layer1 px-3">
        {/* 面板名称 */}
        <span className="shrink-0 text-xs font-medium text-primary">{t('title')}</span>

        <span className="flex-1" />

        {/* 标记类型过滤 */}
        <select
          value={filter}
          onChange={(event) => setFilter(event.target.value as Marker | '')}
          className="rounded border border-line2 bg-base px-1 py-0.5 text-[11px] text-primary outline-none"
        >
          {/* 全部标记类型 */}
          <option value="">{t('allMarkers')}</option>
          {MARKERS.map((marker) => (
            <option key={marker} value={marker}>
              {marker}
            </option>
          ))}
        </select>

        {/* 扫描按钮 */}
        <button
          type="button"
          disabled={state.busy || root === ''}
          onClick={() => void scan()}
          className="shrink-0 rounded border border-line2 px-1.5 py-0.5 text-[11px] text-primary hover:bg-layer2 disabled:opacity-40"
        >
          {state.busy ? t('scanning') : t('scan')}
        </button>
      </div>

      {root === '' && <div className="px-3 py-3 text-xs text-secondary">{t('noSession')}</div>}
      {state.error !== '' && <div className="px-3 py-2 text-xs text-danger">{state.error}</div>}

      {state.scanned > 0 && (
        <div className="px-3 py-1 text-[11px] text-secondary">
          {/* 扫描统计：文件数与命中数 */}
          {t('scannedFiles')} {state.scanned} · {t('matches')} {visible.length}
        </div>
      )}

      {state.truncated && <div className="px-3 py-1 text-xs text-warn">{t('truncated')}</div>}

      <div className="flex-1 py-1">
        {[...groups.entries()].map(([path, entries]) => (
          <div key={path} className="mb-1">
            {/* 文件分组标题 */}
            <div className="flex items-center gap-1 px-2 py-0.5">
              <button
                type="button"
                onClick={() => services.openFile(path)}
                className="min-w-0 flex-1 truncate bg-transparent text-left text-xs text-primary hover:underline"
              >
                {path}
              </button>
              <span className="shrink-0 text-[11px] text-secondary">{entries.length}</span>
            </div>

            {entries.map((item) => (
              <button
                key={`${item.path}:${String(item.line)}:${item.marker}`}
                type="button"
                onClick={() => services.revealLine(item.path, item.line)}
                className="flex w-full items-baseline gap-2 rounded px-4 py-0.5 text-left text-xs hover:bg-layer2"
              >
                {/* 标记类型 */}
                <span className={cn('shrink-0 font-mono text-[11px]', markerTone(item.marker))}>{item.marker}</span>

                {/* 说明文字 */}
                <span className="min-w-0 flex-1 truncate text-primary">{item.text}</span>

                {/* 行号 */}
                <span className="shrink-0 font-mono text-[11px] text-secondary">{item.line}</span>
              </button>
            ))}
          </div>
        ))}

        {items.length === 0 && !state.busy && (
          <div className="px-3 py-2 text-xs text-secondary">{t('empty')}</div>
        )}
      </div>
    </div>
  )
}
