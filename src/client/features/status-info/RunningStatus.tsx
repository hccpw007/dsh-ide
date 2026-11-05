/**
 * 状态栏条目。
 *
 * 状态栏在 IDEA 里是信息密度最高的区域：运行中的进程数该在这里一眼可见。
 * 条目本身只做一件事——显示数字，点一下跳到对应面板。
 */
import React, { useEffect, useState, useSyncExternalStore } from 'react'

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

  // 订阅工作区根：只统计当前项目的实例，切换项目后要按新根重新拉取
  const root = useSyncExternalStore(
    (listener) => services.subscribeRoot(listener),
    () => services.root,
    () => services.root,
  )

  // 定时拉取进程列表：运行状态由宿主侧维护，客户端只能轮询。
  // 没有运行实例时降频到 15 秒（此时条目根本不渲染），页面不可见时整轮跳过。
  useEffect(() => {
    let alive = true
    let timer: number | null = null
    /** 当前是否处于高频节奏；与目标节奏一致时不动定时器，避免每轮都重置周期。 */
    let fast = false

    /**
     * 按运行实例数切换轮询节奏。
     * @param running 运行中的实例数
     */
    const schedule = (running: number): void => {
      const nextFast = running > 0

      if (timer !== null && nextFast === fast) return
      if (timer !== null) window.clearInterval(timer)

      fast = nextFast
      timer = window.setInterval(() => void tick(), fast ? 5000 : 15_000)
    }

    const tick = async (): Promise<void> => {
      if (!alive) return
      // 切到后台时不做无用功：切回前台后的第一个周期会补上
      if (document.visibilityState !== 'visible') return

      // 未绑定工作区时实例不归属任何项目，计数清零
      if (root === '') {
        setCount(0)
        schedule(0)

        return
      }

      const result = await apiGet<{ processes: RunProcess[] }>('/run/list', { root })

      if (!alive || !result.ok) return

      const running = result.value.processes.filter((item) => item.state === 'running').length

      setCount(running)
      schedule(running)
    }

    void tick()

    // 首轮可能因页面不可见被跳过：先建好定时器，等页面回到前台后自然恢复
    if (timer === null) schedule(0)

    return () => {
      alive = false
      if (timer !== null) window.clearInterval(timer)
    }
  }, [root])

  if (count === 0) return null

  return (
    <button
      type="button"
      onClick={() => services.openBottomPanel('run')}
      className="bg-transparent px-1.5 py-px text-success hover:underline"
    >
      {/* 运行中实例计数 */}
      {t('running')} {count}
    </button>
  )
}

/** 状态栏条目的占位导出，供装配清单复用。 */
export default RunningStatus
