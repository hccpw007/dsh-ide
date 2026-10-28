/**
 * 状态栏条目。
 *
 * 状态栏在 IDEA 里是信息密度最高的区域：运行中的进程数、诊断计数都该在这里
 * 一眼可见。条目本身只做一件事——显示数字，点一下跳到对应面板。
 */
import React, { useEffect, useState } from 'react'

import { apiGet } from '../../../common/api'
import type { FeatureViewProps } from '../../shell/contract'

/** 运行实例。 */
interface RunProcess {
  /** 实例 id。 */
  id: string
  /** 进程状态。 */
  state: 'running' | 'exited' | 'failed'
}

/**
 * 渲染运行进程计数。
 * @param props 见 FeatureViewProps
 * @returns 运行中实例数；为 0 时不占位
 */
export function RunningStatus({ t, services }: FeatureViewProps): React.ReactElement | null {
  const [count, setCount] = useState(0)

  // 定时拉取进程列表：运行状态由宿主侧维护，客户端只能轮询
  useEffect(() => {
    let alive = true

    const tick = async (): Promise<void> => {
      const result = await apiGet<{ processes: RunProcess[] }>('/run/list')

      if (!alive || !result.ok) return

      setCount(result.value.processes.filter((item) => item.state === 'running').length)
    }

    void tick()
    const timer = window.setInterval(() => void tick(), 5000)

    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [])

  if (count === 0) return null

  return (
    <button
      type="button"
      onClick={() => services.openBottomPanel('run')}
      className="bg-transparent text-success hover:underline"
    >
      {/* 运行中实例计数 */}
      {t('running')} {count}
    </button>
  )
}

/** 状态栏条目的占位导出，供装配清单复用。 */
export default RunningStatus
