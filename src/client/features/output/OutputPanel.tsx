/**
 * 输出面板。
 *
 * 显示最近一次运行实例的输出流。这里不新建进程，只从宿主侧的环形缓冲增量拉取，
 * 因此关掉面板不会影响进程，重新打开也能看到最新内容。
 */
import React, { useEffect, useRef, useState } from 'react'

import { apiGet } from '../../../common/api'
import type { FeatureViewProps } from '../../shell/contract'

/** 轮询间隔；有运行中实例时才计时。 */
const POLL_INTERVAL_MS = 1000

/** 运行实例。 */
interface RunProcess {
  /** 实例 id。 */
  id: string
  /** 配置名称。 */
  name: string
  /** 状态。 */
  state: 'running' | 'exited' | 'failed'
  /** 退出码。 */
  exitCode: number | null
  /** 启动时间。 */
  startedAt: number
}

/**
 * 渲染输出面板。
 * @param props 见 FeatureViewProps
 * @returns 最新实例的增量输出
 */
export function OutputPanel({ t }: FeatureViewProps): React.ReactElement {
  const [active, setActive] = useState<RunProcess | null>(null)
  const [output, setOutput] = useState('')

  /** 已消费字节数。 */
  const offsetRef = useRef(0)
  const containerRef = useRef<HTMLPreElement | null>(null)

  // 选中最近启动的实例；列表为空时显示空态
  useEffect(() => {
    let alive = true

    const tick = async (): Promise<void> => {
      const result = await apiGet<{ processes: RunProcess[] }>('/run/list')

      if (!alive || !result.ok) return

      setActive(result.value.processes[0] ?? null)
    }

    void tick()
    const timer = window.setInterval(() => void tick(), POLL_INTERVAL_MS * 3)

    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [])

  // 实例切换时重置增量位置与内容
  useEffect(() => {
    offsetRef.current = 0
    setOutput('')
  }, [active?.id])

  // 只拉当前实例的输出；实例结束时同样拉一次，保证最后几行不丢
  useEffect(() => {
    if (active === null) return undefined

    let alive = true

    const pull = async (): Promise<void> => {
      const result = await apiGet<{ text: string; bytes: number; overflowed: boolean }>('/run/output', {
        id: active.id,
        offset: offsetRef.current,
      })

      if (!alive || !result.ok || result.value.text === '') return

      offsetRef.current = result.value.bytes
      setOutput((previous) => (result.value.overflowed ? result.value.text : previous + result.value.text))
    }

    void pull()
    const timer = active.state === 'running' ? window.setInterval(() => void pull(), POLL_INTERVAL_MS) : undefined

    return () => {
      alive = false
      if (timer !== undefined) window.clearInterval(timer)
    }
  }, [active])

  // 追加后自动滚到底
  useEffect(() => {
    const element = containerRef.current
    if (element === null) return

    element.scrollTop = element.scrollHeight
  }, [output])

  if (active === null) return <div className="p-3 text-xs text-secondary">{t('empty')}</div>

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 实例标题与状态 */}
      <div className="flex h-7 shrink-0 items-center gap-2 border-b border-line1 px-2 text-[11px] text-secondary">
        <span className="min-w-0 flex-1 truncate text-primary">{active.name}</span>
        <span className="shrink-0">{active.state === 'running' ? 'running' : `exit ${String(active.exitCode ?? '–')}`}</span>
      </div>

      <pre ref={containerRef} className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-all p-2 font-mono text-[12px] text-primary">
        {output === '' ? t('empty') : output}
      </pre>
    </div>
  )
}
