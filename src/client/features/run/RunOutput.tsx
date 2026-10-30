/**
 * 运行面板右侧的输出区。
 *
 * 上面是 IDEA 风格的窄工具条（重跑、停止、滚动到底、清空、更多），下面是终端输出。
 * 输出带 ANSI 颜色，这里解析成彩色片段渲染，避免把 `\x1b[32m` 显示成乱码。
 */
import React, { useMemo } from 'react'

import { parseAnsi } from '../../../common/ansi'

import type { RunProcess } from './api'

/**
 * 控制台最多渲染的尾部行数。
 *
 * 输出每轮轮询都会重解析，全量展开时行数上万，span 重建会把主线程占满；
 * 尾部若干行足够回看最近日志。
 */
const MAX_RENDER_LINES = 1000

/** 输出区 props。 */
export interface RunOutputProps {
  /** 当前实例；没有时显示空态。 */
  process: RunProcess | undefined
  /** 输出文本。 */
  output: string
  /** 是否还有运行中的实例。 */
  running: boolean
  /** 空态文案。 */
  emptyLabel: string
  /** 滚动到底。 */
  onScrollToEnd(): void
  /** 清空本地输出。 */
  onClear(): void
  /** 重跑。 */
  onRestart(): void
  /** 停止。 */
  onStop(): void
  /** 更多操作。 */
  onMore(event: React.MouseEvent): void
  /** 滚动容器引用，便于父组件自动滚底。 */
  outputRef: React.RefObject<HTMLPreElement>
}

/**
 * 渲染输出区。
 * @param props 见 RunOutputProps
 * @returns 工具条 + 输出
 */
export function RunOutput(props: RunOutputProps): React.ReactElement {
  // 输出每次轮询都会变，解析结果跟着重算；空输出时不必解析
  const runs = useMemo(() => {
    if (props.output === '') return []

    // 只解析尾部若干行：全量展开会让每次轮询重建上万个 span，长跑输出下主线程会被拖住
    const lines = props.output.split('\n')
    const visible = lines.length > MAX_RENDER_LINES ? lines.slice(-MAX_RENDER_LINES).join('\n') : props.output

    return parseAnsi(visible)
  }, [props.output])

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-code">
      {/* 工具条：与 IDEA 的服务输出工具条同序 */}
      <div className="flex h-7 shrink-0 items-center gap-0.5 border-b border-line1 bg-surface1 px-1.5">
        <ToolIcon label="Restart" onClick={props.onRestart} disabled={props.process === undefined}>
          {restartIcon()}
        </ToolIcon>

        <ToolIcon label="Stop" onClick={props.onStop} disabled={!props.running} danger>
          {stopIcon()}
        </ToolIcon>

        <span className="mx-1 h-3.5 w-px bg-line1" />

        <ToolIcon label="Scroll to End" onClick={props.onScrollToEnd}>
          {scrollEndIcon()}
        </ToolIcon>

        <ToolIcon label="Clear All" onClick={props.onClear}>
          {clearIcon()}
        </ToolIcon>

        <ToolIcon label="More" onClick={props.onMore}>
          {moreIcon()}
        </ToolIcon>

        <span className="flex-1" />

        {/* 命令与状态：IDEA 把命令行放在输出区顶部 */}
        {props.process !== undefined && (
          <span className="max-w-1/2 shrink-0 truncate font-mono text-[11px] text-secondary" title={props.process.command}>
            {props.process.command}
          </span>
        )}
      </div>

      <pre
        ref={props.outputRef}
        className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-all px-2 py-1 font-mono text-[12px] leading-[1.5] text-primary"
      >
        {runs.length === 0 ? (
          <span className="text-secondary">{props.emptyLabel}</span>
        ) : (
          runs.map((run, index) => (
            <span
              // 片段顺序稳定，用下标做 key 足够
              key={index}
              style={{
                // ANSI 色名取自终端色板变量，深浅主题各一套
                color: run.color === undefined ? undefined : `var(${run.color})`,
                fontWeight: run.bold === true ? 600 : undefined,
                opacity: run.dim === true ? 0.7 : undefined,
                textDecoration: run.underline === true ? 'underline' : undefined,
              }}
            >
              {run.text}
            </span>
          ))
        )}
      </pre>
    </div>
  )
}

/** 工具条上的小图标按钮。 */
function ToolIcon({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string
  onClick(event: React.MouseEvent): void
  /** 禁用。 */
  disabled?: boolean
  /** 用错误色（停止按钮）。 */
  danger?: boolean
  children: React.ReactNode
}): React.ReactElement {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled === true}
      onClick={onClick}
      className={
        disabled === true
          ? 'flex h-5 w-5 items-center justify-center rounded text-secondary/40'
          : danger === true
            ? 'flex h-5 w-5 items-center justify-center rounded text-danger transition-colors hover:bg-surface2'
            : 'flex h-5 w-5 items-center justify-center rounded text-secondary transition-colors hover:bg-surface2 hover:text-primary'
      }
    >
      {children}
    </button>
  )
}

/** 图标画法：统一 14px 线性，与面板其它图标一致。 */
function icon(path: React.ReactNode): React.ReactNode {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {path}
    </svg>
  )
}

/** 重跑。 */
function restartIcon(): React.ReactNode {
  return icon(<path d="M13 8a5 5 0 1 1-1.8-3.85M13 2.6v3.2h-3.2" />)
}

/** 停止：实心方块。 */
function stopIcon(): React.ReactNode {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <rect x="4" y="4" width="8" height="8" rx="1" />
    </svg>
  )
}

/** 滚动到底。 */
function scrollEndIcon(): React.ReactNode {
  return icon(<path d="M8 2.8v8.4M4.6 8 8 11.4 11.4 8M2.8 13.6h10.4" />)
}

/** 清空。 */
function clearIcon(): React.ReactNode {
  return icon(
    <>
      <path d="M3 4.6h10M6.2 4.6V3.2h3.6v1.4" />
      <path d="M4.6 4.6 5.4 13h5.2l.8-8.4" />
    </>,
  )
}

/** 更多。 */
function moreIcon(): React.ReactNode {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="8" cy="3.4" r="1.2" />
      <circle cx="8" cy="8" r="1.2" />
      <circle cx="8" cy="12.6" r="1.2" />
    </svg>
  )
}
