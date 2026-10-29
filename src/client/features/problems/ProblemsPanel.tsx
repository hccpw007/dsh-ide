/**
 * 问题面板。
 *
 * 诊断结果来自用户配置的一条命令（如 `npx tsc --noEmit`），宿主侧执行并按统一
 * 格式解析。手动刷新，不自动轮询——诊断命令动辄几秒，自动跑会持续占 CPU。
 */
import React, { useCallback, useEffect, useState } from 'react'

import { apiPost } from '../../../common/api'
import { openIdeContextMenu } from '../../../common/context-menu'
import type { FeatureViewProps } from '../../shell/contract'

/** 一条问题。 */
interface Diagnostic {
  /** 相对路径。 */
  path: string
  /** 行号。 */
  line: number
  /** 列号。 */
  column: number
  /** 严重级别。 */
  severity: 'error' | 'warning' | 'info'
  /** 描述。 */
  message: string
}

/**
 * 严重级别的配色。
 * @param severity 级别
 * @returns Tailwind 文本色类名
 */
function severityTone(severity: Diagnostic['severity']): string {
  if (severity === 'error') return 'text-danger'
  if (severity === 'warning') return 'text-warn'

  return 'text-info'
}

/**
 * 渲染问题面板。
 * @param props 见 FeatureViewProps
 * @returns 按文件分组的问题列表
 */
export function ProblemsPanel({ t, services }: FeatureViewProps): React.ReactElement {
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [raw, setRaw] = useState('')

  const settings = services.settings()
  const root = services.root

  /**
   * 运行诊断命令并刷新结果。
   */
  const run = useCallback(async (): Promise<void> => {
    if (root === '' || settings.diagnoseCommand.trim() === '') return

    setBusy(true)
    setError('')

    try {
      const result = await apiPost<{ diagnostics: Diagnostic[]; code: number; raw: string }>('/diagnose', { cwd: root })

      if (!result.ok) {
        setError(result.error.message)

        return
      }

      setDiagnostics(result.value.diagnostics)
      setRaw(result.value.raw)
    } finally {
      setBusy(false)
    }
  }, [root, settings.diagnoseCommand])

  // 命令变化后清空上一次的结果，避免显示过期诊断
  useEffect(() => {
    setDiagnostics([])
    setRaw('')
  }, [settings.diagnoseCommand])

  // 按文件分组
  const groups = new Map<string, Diagnostic[]>()

  for (const item of diagnostics) {
    const bucket = groups.get(item.path) ?? []
    bucket.push(item)
    groups.set(item.path, bucket)
  }

  const errorCount = diagnostics.filter((item) => item.severity === 'error').length
  const warningCount = diagnostics.filter((item) => item.severity === 'warning').length

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-base"
      // 问题面板右键：重跑诊断、清空结果与设置入口
      onContextMenu={(event) => {
        if (event.defaultPrevented) return

        openIdeContextMenu(event, services, [
          {
            id: 'rerun',
            label: t('menuRerun'),
            shortcut: '⌘R',
            ...(busy || root === '' || settings.diagnoseCommand.trim() === '' ? {} : { run: () => void run() }),
          },
          {
            id: 'clear',
            label: t('menuClear'),
            ...(diagnostics.length === 0 ? {} : { run: () => setDiagnostics([]) }),
          },
          {
            id: 'settings',
            label: t('menuSettings'),
            shortcut: '⌘,',
            separatorBefore: true,
            run: () => services.openPage('settings'),
          },
        ])
      }}
    >
      {/* 工具条：运行诊断与计数 */}
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-line1 bg-surface1 px-2">
        {/* 运行诊断命令 */}
        <button
          type="button"
          disabled={busy || root === '' || settings.diagnoseCommand.trim() === ''}
          onClick={() => void run()}
          className="rounded border border-line2 px-1.5 py-0.5 text-xs text-primary hover:bg-surface2 disabled:opacity-40"
        >
          {busy ? t('running') : t('run')}
        </button>

        <span className="flex-1" />

        {/* 错误与警告计数 */}
        <span className="text-[11px] text-danger">
          {t('errors')} {errorCount}
        </span>
        <span className="text-[11px] text-warn">
          {t('warnings')} {warningCount}
        </span>
      </div>

      {settings.diagnoseCommand.trim() === '' && (
        <div className="p-3 text-xs text-secondary">
          {/* 未配置诊断命令时的引导 */}
          {t('notConfigured')}
        </div>
      )}

      {error !== '' && <div className="shrink-0 border-b border-line1 px-2 py-1 text-xs text-danger">{error}</div>}

      <div className="min-h-0 flex-1 overflow-auto px-1 py-1">
        {[...groups.entries()].map(([path, items]) => (
          <div key={path} className="mb-1">
            {/* 文件分组标题与问题数 */}
            <div className="flex items-center gap-1 px-1 py-0.5">
              <button
                type="button"
                onClick={() => services.openFile(path)}
                className="min-w-0 flex-1 truncate bg-transparent text-left text-xs text-primary hover:underline"
              >
                {path}
              </button>
              <span className="shrink-0 text-[11px] text-secondary">{items.length}</span>
            </div>

            {items.map((item, index) => (
              <button
                key={`${path}:${String(item.line)}:${String(item.column)}:${String(index)}`}
                type="button"
                onClick={() => services.revealLine(path, item.line)}
                className="flex w-full items-baseline gap-2 rounded px-3 py-0.5 text-left text-xs hover:bg-surface2"
              >
                {/* 位置 */}
                <span className="shrink-0 font-mono text-[11px] text-secondary">
                  {item.line}:{item.column}
                </span>

                {/* 严重级别 */}
                <span className={`shrink-0 text-[11px] ${severityTone(item.severity)}`}>{item.severity}</span>

                {/* 描述 */}
                <span className="min-w-0 flex-1 truncate text-primary">{item.message}</span>
              </button>
            ))}
          </div>
        ))}

        {diagnostics.length === 0 && settings.diagnoseCommand.trim() !== '' && !busy && (
          <div className="px-2 py-2 text-xs text-secondary">{t('empty')}</div>
        )}

        {raw !== '' && diagnostics.length === 0 && (
          <pre className="mt-1 whitespace-pre-wrap px-2 text-[11px] text-secondary">{raw.slice(0, 4000)}</pre>
        )}
      </div>
    </div>
  )
}
