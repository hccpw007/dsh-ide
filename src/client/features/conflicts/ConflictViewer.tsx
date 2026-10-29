/**
 * 冲突解决视图。
 *
 * 读取带冲突标记的文件，把每个冲突块拆成「当前 / 传入」两侧，逐块选择保留哪边，
 * 保存时把选择结果写回文件。只处理文本冲突标记，不做三方图形合并。
 */
import React, { useCallback, useEffect, useState } from 'react'

import { apiGet, apiPost } from '../../../common/api'
import { cn } from '../../../common/cn'
import type { FeatureViewProps } from '../../shell/contract'

/** 用户在冲突块上的选择。 */
type Side = 'ours' | 'theirs' | 'both'

/** 一个冲突块。 */
interface ConflictBlock {
  /** 当前分支内容。 */
  ours: string
  /** 传入分支内容。 */
  theirs: string
  /** 起始行号（0 起）。 */
  start: number
  /** 结束行号（0 起，指向 `>>>>>>>` 行）。 */
  end: number
}

/**
 * 解析冲突标记。
 * @param text 文件内容
 * @returns 冲突块
 */
function parseConflicts(text: string): ConflictBlock[] {
  const blocks: ConflictBlock[] = []
  const lines = text.split('\n')
  let ours: string[] | null = null
  let theirs: string[] | null = null
  let start = 0

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]

    if (line.startsWith('<<<<<<<')) {
      ours = []
      theirs = null
      start = index

      continue
    }

    if (line.startsWith('=======') && ours !== null) {
      theirs = []

      continue
    }

    if (line.startsWith('>>>>>>>') && ours !== null && theirs !== null) {
      blocks.push({ ours: ours.join('\n'), theirs: theirs.join('\n'), start, end: index })
      ours = null
      theirs = null

      continue
    }

    if (theirs !== null) theirs.push(line)
    else if (ours !== null) ours.push(line)
  }

  return blocks
}

/**
 * 按选择替换冲突块。
 * @param text 原始内容
 * @param selections 用户选择
 * @returns 处理后的内容
 */
function resolveConflicts(text: string, selections: Record<number, Side>): string {
  const blocks = parseConflicts(text)
  const lines = text.split('\n')
  const output: string[] = []
  let cursor = 0

  blocks.forEach((block, index) => {
    output.push(...lines.slice(cursor, block.start))

    const choice = selections[index] ?? 'ours'

    if (choice === 'ours') output.push(...block.ours.split('\n'))
    if (choice === 'theirs') output.push(...block.theirs.split('\n'))
    if (choice === 'both') output.push(...block.ours.split('\n'), ...block.theirs.split('\n'))

    cursor = block.end + 1
  })

  output.push(...lines.slice(cursor))

  return output.join('\n')
}

/**
 * 渲染冲突解决视图。
 * @param props 见 FeatureViewProps，address 形如 `conflict:<相对路径>`
 * @returns 逐块选择界面
 */
export function ConflictViewer({ t, services, address }: FeatureViewProps & { address: string }): React.ReactElement {
  const [text, setText] = useState('')
  const [version, setVersion] = useState('')
  const [error, setError] = useState('')
  const [selections, setSelections] = useState<Record<number, Side>>({})

  const path = address.slice('conflict:'.length)

  // 读取文件内容；换文件时重置选择
  useEffect(() => {
    if (services.root === '') return undefined

    setSelections({})
    let alive = true

    void apiGet<{ text: string; version: string }>('/fs/read', { root: services.root, path }).then((result) => {
      if (!alive) return

      if (!result.ok) {
        setError(result.error.message)

        return
      }

      setError('')
      setText(result.value.text)
      setVersion(result.value.version)
    })

    return () => {
      alive = false
    }
  }, [path, services.root])

  const blocks = parseConflicts(text)

  /**
   * 应用所有选择并保存。
   */
  const save = useCallback(async (): Promise<void> => {
    const merged = resolveConflicts(text, selections)
    const result = await apiPost<{ version: string }>('/fs/write', {
      root: services.root,
      path,
      text: merged,
      expectedVersion: version,
    })

    if (!result.ok) {
      services.notify('error', result.error.message)

      return
    }

    setText(merged)
    setVersion(result.value.version)
    setSelections({})
    services.notify('success', t('saved'))
    services.invalidate(path)
    services.refreshGitStatus()
  }, [path, selections, services, t, text, version])

  if (error !== '') return <div className="p-3 text-xs text-danger">{error}</div>

  return (
    <div className="flex h-full min-h-0 flex-col bg-code">
      {/* 标题栏：路径与保存 */}
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-line1 px-3 text-xs text-secondary">
        <span className="min-w-0 flex-1 truncate">{path}</span>

        {/* 保存解决结果 */}
        <button type="button" onClick={() => void save()} className="rounded px-1.5 text-info hover:bg-surface2">
          {t('save')}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3 text-xs">
        {blocks.length === 0 && <div className="text-secondary">{t('noConflicts')}</div>}

        {blocks.map((block, index) => (
          <div key={`${String(block.start)}:${String(index)}`} className="mb-3 rounded border border-line2">
            {/* 冲突块标题与三选一按钮 */}
            <div className="flex items-center gap-2 border-b border-line1 px-2 py-1">
              <span className="flex-1 text-secondary">
                {/* 冲突块序号 */}
                {t('conflictBlock')} {index + 1}
              </span>

              {(['ours', 'theirs', 'both'] as const).map((side) => (
                <button
                  key={side}
                  type="button"
                  onClick={() => setSelections((previous) => ({ ...previous, [index]: side }))}
                  className={cn(
                    'rounded border px-1.5 py-0.5',
                    selections[index] === side ? 'border-line4 bg-surface2 text-primary' : 'border-line2 text-secondary',
                  )}
                >
                  {/* 三选一：当前 / 传入 / 双方 */}
                  {side === 'ours' ? t('acceptOurs') : side === 'theirs' ? t('acceptTheirs') : t('acceptBoth')}
                </button>
              ))}
            </div>

            {/* 两侧内容 */}
            <div className="grid grid-cols-2">
              <pre className="whitespace-pre-wrap break-all border-r border-line1 p-2 text-primary">{block.ours}</pre>
              <pre className="whitespace-pre-wrap break-all p-2 text-primary">{block.theirs}</pre>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
