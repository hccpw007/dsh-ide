/**
 * 差异视图。
 *
 * 三种来源（工作区 vs HEAD、两个提交、两个文件）共用同一个正文组件，差别只在
 * 取数方式。两侧文本由宿主侧 git 或 fs 提供，这里只做渲染与选项。
 */
import React, { useCallback, useEffect, useState } from 'react'

import { apiGet, apiPost } from '../../../common/api'
import type { DiffSource, FeatureViewProps } from '../../shell/contract'

import { DiffBody, type DiffMode } from './DiffBody'

/** 差异正文可渲染的文件大小上限。 */
const MAX_DIFF_BYTES = 2 * 1024 * 1024

/** 取数状态。 */
type Status = 'loading' | 'ready' | 'error' | 'binary' | 'too-large'

/** 差异数据。 */
interface DiffData {
  /** 旧文本。 */
  left: string
  /** 新文本。 */
  right: string
  /** 旧侧标题。 */
  leftTitle: string
  /** 新侧标题。 */
  rightTitle: string
}

/**
 * 解析差异来源并取回两侧文本。
 *
 * `git diff` 给的是补丁；差异渲染器要的是完整两侧内容，因此各来源分别取两份文本
 * （提交版本用 `git show <ref>:<path>`，工作区版本读文件）。这比解析补丁更可靠，
 * 也不会漏掉未跟踪文件与二进制边界的判定。
 * @param source 差异来源
 * @param root 工作区根
 * @returns 两侧文本或边界情况
 */
async function loadBrush(source: DiffSource, root: string): Promise<DiffData | { binary: true } | { tooLarge: number }> {
  if (source.kind === 'files') {
    const [left, right] = await Promise.all([
      apiGet<{ text: string; bytes: number }>('/fs/read', { root, path: source.left }),
      apiGet<{ text: string; bytes: number }>('/fs/read', { root, path: source.right }),
    ])

    if (!left.ok) throw new Error(left.error.message)
    if (!right.ok) throw new Error(right.error.message)

    const bytes = Math.max(left.value.bytes, right.value.bytes)
    if (bytes > MAX_DIFF_BYTES) return { tooLarge: bytes }

    return { left: left.value.text, right: right.value.text, leftTitle: source.left, rightTitle: source.right }
  }

  if (source.kind === 'commits') {
    const target = source.path ?? ''
    const [leftText, rightText] = await Promise.all([
      readBlob(root, source.from, target),
      readBlob(root, source.to, target),
    ])

    return {
      left: leftText,
      right: rightText,
      leftTitle: `${source.from}${target === '' ? '' : ` · ${target}`}`,
      rightTitle: `${source.to}${target === '' ? '' : ` · ${target}`}`,
    }
  }

  // 工作区 vs HEAD：HEAD 侧用 git show，工作区侧读文件；暂存区模式读索引
  const [head, worktree] = await Promise.all([
    readBlob(root, 'HEAD', source.path),
    source.staged
      ? apiPost<{ text: string }>('/git/exec', { method: 'indexFileText', cwd: root, path: source.path })
      : apiGet<{ text: string; bytes: number }>('/fs/read', { root, path: source.path }),
  ])

  if (!worktree.ok) throw new Error(worktree.error.message)

  // 暂存区分支拿不到字节数，两种来源统一按文本重新计算，保证大小上限判断一致
  const worktreeText: string = worktree.value.text
  const bytes = new TextEncoder().encode(worktreeText).byteLength
  if (bytes > MAX_DIFF_BYTES) return { tooLarge: bytes }

  return {
    left: head,
    right: worktreeText,
    leftTitle: `HEAD · ${source.path}`,
    rightTitle: source.path,
  }
}

/**
 * 读取某个提交里某个文件的正文。
 * @param root 工作区根
 * @param hash 提交或 ref
 * @param path 路径
 * @returns 文件正文；文件在该 ref 里不存在时为空串
 */
async function readBlob(root: string, hash: string, path: string): Promise<string> {
  const result = await apiPost<{ text: string }>('/git/exec', { method: 'showFileText', cwd: root, hash, path })

  // 文件在该提交里被删除是常见情况，不当作错误
  return result.ok ? result.value.text : ''
}

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
      const result = await loadBrush(source, services.root)

      if ('binary' in result) {
        setStatus('binary')

        return
      }

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
    <div className="flex h-full min-h-0 flex-col bg-base">
      {/* 工具条：模式、忽略选项与刷新 */}
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-line1 px-3 text-xs text-secondary">
        {/* 并排 / 行内切换 */}
        <button
          type="button"
          onClick={() => setMode((previous) => (previous === 'inline' ? 'side-by-side' : 'inline'))}
          className="rounded border border-line2 px-1.5 py-0.5 text-primary hover:bg-layer2"
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
        <button type="button" onClick={() => copyReference(1)} className="rounded px-1.5 text-info hover:bg-layer2">
          {t('copyReference')}
        </button>

        {/* 重新读取两侧内容 */}
        <button type="button" onClick={() => void load()} className="rounded px-1.5 text-info hover:bg-layer2">
          {t('refresh')}
        </button>
      </div>

      {status === 'loading' && <div className="p-3 text-xs text-secondary">{t('loading')}</div>}

      {status === 'error' && <div className="p-3 text-xs text-danger">{errorText || t('loadFailed')}</div>}

      {status === 'binary' && <div className="p-3 text-xs text-warn">{t('binary')}</div>}

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

/** 供外部判断某个差异源是否有内容可显示。 */
export { MAX_DIFF_BYTES }
