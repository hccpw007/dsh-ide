/**
 * 后台同步：定时 fetch 远程，并探测工作区是否被外部改动。
 *
 * IDE 内部的操作都会主动广播刷新，但终端里的 git 命令、其它工具改文件、
 * 同事刚推上来的提交，插件原本完全不知道——界面会一直停在旧数据上。
 * 这里用一个低频定时器补上这块：按设置里的间隔 fetch 远端，再用 `git status`
 * 的指纹判断工作区是否变过，只有变了才广播，避免白白刷一遍界面。
 *
 * 失败按倍数退避（最多 8 倍间隔）：断网、仓库被删或没有远端时不会每个周期都重试。
 */
import { fetchAll, readStatus, type GitStatus } from '../features/git/api'

import type { IdeServices } from './contract'

/** 检查周期（毫秒）：真正要不要 fetch 由设置决定，这里只决定「多久看一眼」。 */
const TICK_MS = 15_000

/** 失败退避的最大倍数。 */
const MAX_BACKOFF = 8

/** 同时挂载的工作台数量：始终只有一个定时器，全部卸载后才停。 */
let holders = 0
/** 当前使用中的服务总线；工作台重建时会换成新实例。 */
let servicesRef: IdeServices | null = null
/** 定时器句柄。 */
let timer: number | null = null
/** 上一轮还没跑完：大仓库上读状态可能超过一个周期。 */
let running = false
/** 连续失败次数，用于退避。 */
let failures = 0
/** 上次 fetch 的时间戳（毫秒）。 */
let lastFetchAt = 0
/** 上次观察到的状态指纹：用来判断是否真的变了。 */
let lastSignature = ''
/** 上一轮是否判定为仓库：只在「仓库 → 非仓库」翻转时通知界面，避免每轮重复刷。 */
let wasRepository = true

/**
 * 取仓库状态的指纹。
 * @param status 仓库状态
 * @returns 由分支、HEAD 与各类变更拼成的字符串
 */
function signatureOf(status: GitStatus): string {
  const join = (changes: GitStatus['staged']): string =>
    changes.map((change) => `${change.indexStatus}${change.worktreeStatus}:${change.path}`).join(',')

  return [
    status.branch,
    status.headShort,
    join(status.staged),
    join(status.unstaged),
    join(status.untracked),
    join(status.conflicted),
  ].join('|')
}

/**
 * 一轮后台同步：按设置 fetch 远端，再比对状态指纹。
 */
async function tick(): Promise<void> {
  const services = servicesRef
  if (services === null || running) return
  // 页面不可见时不做无用功：切回来后的第一个周期会立刻补上
  if (document.visibilityState !== 'visible') return

  const root = services.root
  if (root === '') return

  running = true

  try {
    const intervalMs = Math.max(settingsInterval(), 0) * 1000
    const now = Date.now()

    if (intervalMs > 0 && now - lastFetchAt >= intervalMs * Math.min(2 ** failures, MAX_BACKOFF)) {
      lastFetchAt = now

      const fetched = await fetchAll(root)

      if (fetched.ok) {
        failures = 0
        // 远端引用变了：分支树、Log 的远程分支都要重新取
        services.invalidate()
      } else {
        failures = Math.min(failures + 1, 8)
      }
    }

    const status = await readStatus(root)

    if (!status.ok) {
      failures = Math.min(failures + 1, 8)

      // 仓库在插件之外被删掉（终端里 rm -rf .git）时状态会变成「不是仓库」：
      // 只在翻转的那一轮刷一次界面，之后每轮继续探测但不再重复触发状态请求
      if (status.error.code === 'GIT_NOT_REPOSITORY' && wasRepository) {
        wasRepository = false
        services.refreshGitStatus()
        services.invalidate()
      }

      return
    }

    failures = 0

    /**
     * 是否刚从「不是仓库」翻回仓库（终端里 git init 或恢复 .git）。
     *
     * 这种情况必须单独刷新：恢复后的工作区指纹和删仓库前往往一模一样，
     * 只比对指纹发现不了，界面会停在「未初始化」状态。
     */
    const recovered = !wasRepository
    wasRepository = true

    const signature = signatureOf(status.value)

    // 第一次只记指纹不广播：此时工作台刚拉过状态，再刷一遍没有意义
    if (recovered || (lastSignature !== '' && signature !== lastSignature)) {
      services.refreshGitStatus()
      services.invalidate()
    }

    lastSignature = signature
  } catch (error) { // 网络层异常不带 ApiResult，留痕后等下个周期
    console.error('[dsh-ide] 后台同步失败:', error)
  } finally {
    running = false
  }
}

/**
 * 读当前设置里的 fetch 间隔（秒）。
 * @returns 间隔秒数；设置不可用时退回 60
 */
function settingsInterval(): number {
  const settings = servicesRef?.settings()

  return settings === undefined ? 60 : settings.autoFetchSeconds
}

/**
 * 启动后台同步。
 *
 * 工作台有多个挂载点（主区与侧栏），这里用引用计数保证全局只有一个定时器。
 * @param services 工作台服务总线
 * @returns 停止函数
 */
export function startBackgroundSync(services: IdeServices): () => void {
  servicesRef = services
  holders += 1

  if (timer === null) {
    // 首次启动时把指纹清空：换工作区后状态可能完全不同
    lastSignature = ''
    lastFetchAt = 0
    failures = 0
    // 以总线当前结论为起点：工作台刚拉过状态，仓库/非仓库的判断不必第一轮再翻一次
    wasRepository = services.gitRepository()
    timer = window.setInterval(() => void tick(), TICK_MS)
    // 立刻跑一轮：打开工作台就能发现远端更新，不必等第一个周期
    void tick()
  }

  return () => {
    holders -= 1

    if (holders > 0) return

    holders = 0

    if (timer !== null) {
      window.clearInterval(timer)
      timer = null
    }

    servicesRef = null
    lastSignature = ''
    wasRepository = true
  }
}
