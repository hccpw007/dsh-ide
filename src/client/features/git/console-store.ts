/**
 * Git 控制台的命令记录。
 *
 * 三个页签共享同一份记录：本地变更页签执行暂存与提交，日志页签执行签出与合并，
 * 控制台页签只负责展示。因此这里做成模块级的小 store，不引入额外的全局状态层。
 */

/** 一条命令记录。 */
interface GitConsoleEntry {
  /** 自增 id，用作列表 key。 */
  id: number
  /** 等价的 git 命令行，便于对照 IDEA 的控制台输出。 */
  command: string
  /** 命令输出；成功但无输出时为空串。 */
  output: string
  /** 命令是否成功。 */
  ok: boolean
  /** 执行时刻，便于区分先后。 */
  time: string
}

/** 最多保留的记录数：超出后丢弃最早的，避免长时间使用把内存撑大。 */
const MAX_ENTRIES = 200

/** 当前记录；每次变更都替换引用，供 useSyncExternalStore 判断快照是否变化。 */
let entries: GitConsoleEntry[] = []
let sequence = 0
const listeners = new Set<() => void>()

/** 通知全部订阅者；单个订阅者抛错不影响其余订阅者。 */
function notify(): void {
  for (const listener of listeners) {
    try {
      listener()
    } catch (error) { // 一个订阅者出错不应打断其余订阅者
      console.error('[dsh-ide] Git 控制台监听器抛错:', error)
    }
  }
}

/**
 * 追加一条命令记录。
 * @param command 等价的 git 命令行
 * @param ok 是否成功
 * @param output 输出或错误信息
 */
export function recordGitConsole(command: string, ok: boolean, output: string): void {
  sequence += 1
  entries = [...entries, { id: sequence, command, ok, output, time: new Date().toLocaleTimeString() }].slice(-MAX_ENTRIES)
  notify()
}

/**
 * 订阅记录变化。
 * @param listener 回调
 * @returns 取消订阅函数
 */
export function subscribeGitConsole(listener: () => void): () => void {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}

/**
 * 读取当前记录。
 * @returns 记录数组；未变化时引用保持不变
 */
export function gitConsoleEntries(): GitConsoleEntry[] {
  return entries
}

/** 清空记录。 */
export function clearGitConsole(): void {
  entries = []
  notify()
}
