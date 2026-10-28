/**
 * 结构大纲工具窗口。
 *
 * 用正则从当前活动文件里提取符号（类、函数、方法、接口、变量），点击跳到定义行。
 * 这是轻量方案：不做语法树、不跑语言服务器，与大文件也能在毫秒级完成。
 */
import React, { useEffect, useMemo, useState } from 'react'

import { apiGet } from '../../../common/api'
import { cn } from '../../../common/cn'
import type { FeatureViewProps } from '../../shell/contract'

/** 一个符号。 */
interface Symbol {
  /** 名称。 */
  name: string
  /** 类型。 */
  kind: 'class' | 'function' | 'interface' | 'method' | 'variable' | 'heading'
  /** 行号。 */
  line: number
  /** 缩进层级。 */
  depth: number
}

/** 各语言的符号提取规则。 */
const PATTERNS: { kind: Symbol['kind']; regex: RegExp }[] = [
  // TypeScript / JavaScript
  { kind: 'class', regex: /^\s*(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/u },
  { kind: 'interface', regex: /^\s*(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/u },
  { kind: 'function', regex: /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/u },
  { kind: 'variable', regex: /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/u },
  { kind: 'method', regex: /^\s{2,}(?:public\s+|private\s+|protected\s+|static\s+|async\s+)*([A-Za-z_$][\w$]*)\s*\(/u },
  // Python
  { kind: 'class', regex: /^\s*class\s+([A-Za-z_]\w*)/u },
  { kind: 'function', regex: /^\s*def\s+([A-Za-z_]\w*)/u },
  // Go
  { kind: 'function', regex: /^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/u },
  // Rust
  { kind: 'function', regex: /^\s*(?:pub\s+)?fn\s+([A-Za-z_]\w*)/u },
  { kind: 'class', regex: /^\s*(?:pub\s+)?(?:struct|enum|trait)\s+([A-Za-z_]\w*)/u },
  // Markdown 标题
  { kind: 'heading', regex: /^(#{1,6})\s+(.+)$/u },
  // CSS 选择器
  { kind: 'class', regex: /^\s*([.#][\w-]+)\s*\{/u },
]

/**
 * 从文本里提取符号。
 * @param text 文件内容
 * @param path 文件路径，用于挑选规则集
 * @returns 符号列表
 */
function extractSymbols(text: string, path: string): Symbol[] {
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  const markdown = extension === 'md' || extension === 'mdx'
  const lines = text.split('\n')
  const symbols: Symbol[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.trim() === '') continue

    if (markdown) {
      const heading = /^(#{1,6})\s+(.+)$/u.exec(line)
      if (heading !== null) {
        symbols.push({ name: heading[2].trim(), kind: 'heading', line: index + 1, depth: heading[1].length - 1 })
      }

      continue
    }

    for (const pattern of PATTERNS) {
      const match = pattern.regex.exec(line)
      if (match === null) continue

      // 缩进层级直接由前导空格数折算，够用来做树状缩进
      const indent = line.length - line.trimStart().length
      symbols.push({ name: match[1], kind: pattern.kind, line: index + 1, depth: Math.floor(indent / 2) })

      break
    }
  }

  return symbols
}

/**
 * 符号类型对应的显示标签。
 * @param kind 类型
 * @returns 单字母标识
 */
function kindBadge(kind: Symbol['kind']): string {
  if (kind === 'class') return 'C'
  if (kind === 'function') return 'F'
  if (kind === 'interface') return 'I'
  if (kind === 'method') return 'M'
  if (kind === 'heading') return '#'

  return 'V'
}

/**
 * 渲染大纲面板。
 * @param props 见 FeatureViewProps
 * @returns 当前文件的符号树
 */
export function OutlinePanel({ t, services }: FeatureViewProps): React.ReactElement {
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [path, setPath] = useState<string | null>(null)

  // 跟随活动文件：切换文件时重新读取内容
  useEffect(
    () =>
      services.subscribeActiveFile(() => {
        setPath(services.activeFile())
      }),
    [services],
  )

  useEffect(() => {
    setPath(services.activeFile())
  }, [services])

  useEffect(() => {
    if (path === null || services.root === '') {
      setText('')

      return undefined
    }

    let alive = true

    void apiGet<{ text: string }>('/fs/read', { root: services.root, path }).then((result) => {
      if (!alive) return

      if (!result.ok) {
        setError(result.error.message)
        setText('')

        return
      }

      setError('')
      setText(result.value.text)
    })

    return () => {
      alive = false
    }
  }, [path, services.root])

  const symbols = useMemo(() => (text === '' || path === null ? [] : extractSymbols(text, path)), [path, text])

  return (
    <div className="flex min-h-full flex-col">
      {/* 标题栏：面板名与当前文件 */}
      <div className="sticky top-0 z-10 flex h-9 shrink-0 items-center border-b border-line1 bg-layer1 px-3">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-primary">
          {t('title')}
          {path !== null && <span className="ml-1 font-normal text-secondary">· {path}</span>}
        </span>
      </div>

      {path === null && <div className="px-3 py-3 text-xs text-secondary">{t('noFile')}</div>}
      {error !== '' && <div className="px-3 py-2 text-xs text-danger">{error}</div>}

      <div className="flex-1 py-1">
        {symbols.map((symbol, index) => (
          <button
            key={`${String(symbol.line)}:${symbol.name}:${String(index)}`}
            type="button"
            onClick={() => services.revealLine(path ?? '', symbol.line)}
            title={`${symbol.kind} ${symbol.name}`}
            className="flex w-full items-center gap-1.5 rounded px-2 py-0.5 text-left text-xs text-primary hover:bg-layer2"
            // 缩进随符号层级变化，无法用静态类名表达
            style={{ paddingLeft: 8 + symbol.depth * 12 }}
          >
            {/* 符号类型角标 */}
            <span className={cn('shrink-0 font-mono text-[10px]', symbol.kind === 'class' ? 'text-info' : 'text-secondary')}>
              {kindBadge(symbol.kind)}
            </span>

            {/* 符号名 */}
            <span className="min-w-0 flex-1 truncate">{symbol.name}</span>

            {/* 定义所在行 */}
            <span className="shrink-0 font-mono text-[10px] text-secondary">{symbol.line}</span>
          </button>
        ))}

        {path !== null && symbols.length === 0 && text !== '' && (
          <div className="px-3 py-2 text-xs text-secondary">{t('empty')}</div>
        )}
      </div>
    </div>
  )
}
