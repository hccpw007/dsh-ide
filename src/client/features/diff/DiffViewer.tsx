/**
 * 差异视图。
 *
 * 三种来源（工作区 vs HEAD、两个提交、两个文件）共用同一个正文组件，差别只在
 * 取数方式。两侧文本由宿主侧 git 或 fs 提供，这里只做渲染与选项。
 */
import React, { useCallback, useEffect, useState } from 'react'

import { openIdeContextMenu } from '../../../common/context-menu'
import type { DiffSource, FeatureViewProps } from '../../shell/contract'

import { DiffBody, type DiffMode } from './DiffBody'
import { loadDiffData, type DiffData } from './diff-source'

/** 取数状态。 */
type Status = 'loading' | 'ready' | 'error' | 'too-large'

/**
 * 渲染差异视图。
 * @param props 见 FeatureViewProps，额外带地址（差异源由外层拼好）
 * @returns 差异面板
 */
export function DiffViewer({
  t,
  services,
  source,
}: FeatureViewProps & { source?: DiffSource }): React.ReactElement {
  const [status, setStatus] = useState<Status>('loading')
  const [data, setData] = useState<DiffData | null>(null)
  const [errorText, setErrorText] = useState('')
  const [size, setSize] = useState(0)
  const [mode, setMode] = useState<DiffMode>('side-by-side')
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false)
  const [ignoreCase, setIgnoreCase] = useState(false)

  const settings = services.settings()

  /**
   * 拉取两侧内容。
   */
  const load = useCallback(async (): Promise<void> => {
    if (source === undefined) {
      setStatus('error')
      setErrorText(t('loadFailed'))

      return
    }

    setStatus('loading')

    try {
      const result = await loadDiffData(source, services.root)

      if ('tooLarge' in result) {
        setSize(result.tooLarge)
        setStatus('too-large')

        return
      }

      setData(result)
      setStatus('ready')
    } catch (error) { // 读取失败要给出原因，不能让面板停在加载中
      console.error('[dsh-ide] 读取差异失败:', error)
      setErrorText(error instanceof Error ? error.message : String(error))
      setStatus('error')
    }
  }, [services.root, source])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * 复制带文件与行号的引用。
   * @param line 行号
   */
  const copyReference = useCallback(
    (line: number): void => {
      if (source === undefined) return

      const target = source.kind === 'worktree' ? source.path : source.kind === 'files' ? source.right : (source.path ?? '')
      const reference = `${target}:${String(line)}`

      void navigator.clipboard.writeText(reference).then(
        () => services.notify('success', t('copied')),
        (error: unknown) => {
          console.error('[dsh-ide] 复制引用失败:', error)
          services.notify('error', t('copyFailed'))
        },
      )
    },
    [services, source, t],
  )

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-code"
      // 差异视图右键：刷新、切换显示模式、忽略选项与设置入口
      onContextMenu={(event) => {
        if (event.defaultPrevented) return

        openIdeContextMenu(event, services, [
          { id: 'refresh', label: t('refresh'), shortcut: '⌘R', run: () => void load() },
          {
            id: 'sideBySide',
            label: t('showSideBySide'),
            ...(mode === 'side-by-side' ? {} : { run: () => setMode('side-by-side') }),
          },
          { id: 'inline', label: t('showInline'), ...(mode === 'inline' ? {} : { run: () => setMode('inline') }) },
          {
            id: 'ignoreWhitespace',
            label: t('ignoreWhitespace'),
            separatorBefore: true,
            ...(ignoreWhitespace ? {} : { run: () => setIgnoreWhitespace(true) }),
          },
          { id: 'ignoreCase', label: t('ignoreCase'), ...(ignoreCase ? {} : { run: () => setIgnoreCase(true) }) },
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
      {/* 工具条：模式、忽略选项与刷新 */}
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-line1 px-3 text-xs text-secondary">
        {/* 并排 / 行内切换 */}
        <button
          type="button"
          onClick={() => setMode((previous) => (previous === 'inline' ? 'side-by-side' : 'inline'))}
          className="rounded border border-line2 px-1.5 py-0.5 text-primary hover:bg-surface2"
        >
          {mode === 'inline' ? t('showSideBySide') : t('showInline')}
        </button>

        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={ignoreWhitespace}
            onChange={(event) => setIgnoreWhitespace(event.target.checked)}
          />
          {/* 忽略空白差异的选项 */}
          {t('ignoreWhitespace')}
        </label>

        <label className="flex items-center gap-1">
          <input type="checkbox" checked={ignoreCase} onChange={(event) => setIgnoreCase(event.target.checked)} />
          {/* 忽略大小写差异的选项 */}
          {t('ignoreCase')}
        </label>

        <span className="flex-1" />

        {/* 复制当前差异源引用 */}
        <button type="button" onClick={() => copyReference(1)} className="rounded px-1.5 text-info hover:bg-surface2">
          {t('copyReference')}
        </button>

        {/* 重新读取两侧内容 */}
        <button type="button" onClick={() => void load()} className="rounded px-1.5 text-info hover:bg-surface2">
          {t('refresh')}
        </button>
      </div>

      {status === 'loading' && <div className="p-3 text-xs text-secondary">{t('loading')}</div>}

      {status === 'error' && <div className="p-3 text-xs text-danger">{errorText || t('loadFailed')}</div>}

      {status === 'too-large' && (
        <div className="p-3 text-xs text-warn">
          {/* 超过上限时给出实际大小，而不是静默不显示 */}
          {t('tooLarge')} {(size / 1024 / 1024).toFixed(1)} MiB
        </div>
      )}

      {status === 'ready' && data !== null && (
        <>
          {/* 两侧标题：说明正在比较什么 */}
          <div className="flex shrink-0 items-center gap-2 border-b border-line1 px-3 py-1 text-xs text-secondary">
            <span className="min-w-0 flex-1 truncate">{data.leftTitle}</span>
            <span className="shrink-0">↔</span>
            <span className="min-w-0 flex-1 truncate text-right">{data.rightTitle}</span>
          </div>

          <DiffBody
            t={t}
            left={data.left}
            right={data.right}
            mode={mode}
            context={settings.diffContext}
            ignoreWhitespace={ignoreWhitespace}
            ignoreCase={ignoreCase}
          />
        </>
      )}
    </div>
  )
}
