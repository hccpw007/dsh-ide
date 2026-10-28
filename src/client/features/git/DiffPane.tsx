/**
 * Git 面板内嵌的差异视图。
 *
 * 与编辑器里的差异标签用同一套取数与渲染（diff-source + DiffBody），区别只在
 * 工具栏：这里额外提供暂存、还原、回到日志等上下文动作，并把差异段数显示在
 * 工具栏上，对应 IDEA 的「N difference」。
 */
import React, { useCallback, useEffect, useState } from 'react'

import type { Translate } from '../../../types/plugin'
import type { DiffSource, IdeServices } from '../../shell/contract'
import { DiffBody, type DiffMode } from '../diff/DiffBody'
import { loadDiffData, type DiffData } from '../diff/diff-source'

/** 工具栏上的一个上下文动作。 */
export interface DiffPaneAction {
  /** 按钮文案。 */
  label: string
  /** 是否危险操作，决定配色。 */
  danger?: boolean
  /** 是否禁用。 */
  disabled?: boolean
  /** 点击执行。 */
  run(): void
}

/** 差异面板 props。 */
export interface DiffPaneProps {
  /** 已绑定 git 前缀的翻译函数。 */
  t: Translate
  /** 工作台服务总线。 */
  services: IdeServices
  /** 差异来源；由父组件保证非空，空态由父组件自行渲染。 */
  source: DiffSource
  /** 工具栏动作，如暂存、还原、回到日志。 */
  actions?: readonly DiffPaneAction[]
  /** 内容变化计数；父组件执行写操作后递增，触发重新取数。 */
  revision?: number
}

/** 取数状态。 */
type Status = 'loading' | 'ready' | 'error' | 'too-large'

/**
 * 渲染内嵌差异。
 * @param props 见 DiffPaneProps
 * @returns 工具栏、两侧标题与逐行差异
 */
export function DiffPane({ t, services, source, actions = [], revision = 0 }: DiffPaneProps): React.ReactElement {
  const [status, setStatus] = useState<Status>('loading')
  const [data, setData] = useState<DiffData | null>(null)
  const [errorText, setErrorText] = useState('')
  const [size, setSize] = useState(0)
  const [mode, setMode] = useState<DiffMode>('side-by-side')
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false)
  const [ignoreCase, setIgnoreCase] = useState(false)
  /** 连续改动段数，显示在工具栏；由 DiffBody 回调传入。 */
  const [differenceCount, setDifferenceCount] = useState(0)

  const root = services.root

  /** 重新取数。 */
  const load = useCallback(async (): Promise<void> => {
    setStatus('loading')

    try {
      const result = await loadDiffData(source, root)

      if ('tooLarge' in result) {
        setSize(result.tooLarge)
        setStatus('too-large')

        return
      }

      setData(result)
      setStatus('ready')
    } catch (error) { // 读取失败要给出原因，不能让面板停在加载中
      console.error('[dsh-ide] 读取 Git 差异失败:', error)
      setErrorText(error instanceof Error ? error.message : String(error))
      setStatus('error')
    }
  }, [root, source])

  useEffect(() => {
    void load()
  }, [load, revision])

  /** DiffBody 的计数回调必须稳定，否则每次渲染都会触发一次设置。 */
  const handleChangeCount = useCallback((count: number) => setDifferenceCount(count), [])

  return (
    <div className="flex h-full min-h-0 flex-col bg-base">
      {/* 工具栏：上下文动作、差异段数、布局与忽略选项 */}
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-line1 px-2 text-xs text-secondary">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            disabled={action.disabled === true}
            onClick={action.run}
            className={
              action.danger === true
                ? 'rounded px-1.5 py-0.5 text-danger hover:bg-layer2 disabled:opacity-40'
                : 'rounded px-1.5 py-0.5 text-primary hover:bg-layer2 disabled:opacity-40'
            }
          >
            {action.label}
          </button>
        ))}

        <span className="flex-1" />

        {/* 差异段数：与 IDEA 的 N difference 对应 */}
        <span className="shrink-0 text-secondary">
          {differenceCount} {t('difference')}
        </span>

        {/* 并排 / 行内切换 */}
        <button
          type="button"
          onClick={() => setMode((previous) => (previous === 'inline' ? 'side-by-side' : 'inline'))}
          className="shrink-0 rounded border border-line2 px-1.5 py-0.5 text-primary hover:bg-layer2"
        >
          {mode === 'inline' ? t('showSideBySide') : t('showInline')}
        </button>

        {/* 忽略空白差异 */}
        <button
          type="button"
          aria-pressed={ignoreWhitespace}
          onClick={() => setIgnoreWhitespace((previous) => !previous)}
          className={
            ignoreWhitespace
              ? 'shrink-0 rounded px-1.5 py-0.5 text-info hover:bg-layer2'
              : 'shrink-0 rounded px-1.5 py-0.5 hover:bg-layer2'
          }
        >
          {t('ignoreWhitespace')}
        </button>

        {/* 忽略大小写差异 */}
        <button
          type="button"
          aria-pressed={ignoreCase}
          onClick={() => setIgnoreCase((previous) => !previous)}
          className={
            ignoreCase
              ? 'shrink-0 rounded px-1.5 py-0.5 text-info hover:bg-layer2'
              : 'shrink-0 rounded px-1.5 py-0.5 hover:bg-layer2'
          }
        >
          {t('ignoreCase')}
        </button>

        {/* 重新读取两侧内容 */}
        <button
          type="button"
          onClick={() => void load()}
          className="shrink-0 rounded px-1.5 py-0.5 text-info hover:bg-layer2"
        >
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
          {/* 两侧标题：左侧是旧版本，右侧是新版本 */}
          <div className="flex shrink-0 items-center gap-2 border-b border-line1 px-3 py-1 text-xs text-secondary">
            <span className="min-w-0 flex-1 truncate">{data.leftTitle}</span>
            <span className="min-w-0 flex-1 truncate text-right">{data.rightTitle}</span>
          </div>

          <DiffBody
            t={t}
            left={data.left}
            right={data.right}
            mode={mode}
            context={services.settings().diffContext}
            ignoreWhitespace={ignoreWhitespace}
            ignoreCase={ignoreCase}
            onChangeCount={handleChangeCount}
          />
        </>
      )}
    </div>
  )
}
