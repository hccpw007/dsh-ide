/**
 * Git 控制台的命令记录。
 *
 * 三个页签共享同一份记录：Local Changes 执行暂存/提交，Log 执行签出/合并，
 * Console 只负责展示。模块级小 store 足够，不引入额外的全局状态层。
 */

/** 一条命令记录。 */
export interface GitConsoleEntry {
  /** 自增 id，用作列表 key。 */
  id: number
  /** 执行时刻，精确到毫秒，与 IDEA 控制台一致。 */
  time: string
  /** 执行目录。 */
  cwd: string
  /** 实际执行的命令行。 */
  command: string
  /** 标准输出。 */
  stdout: string
  /** 标准错误；Git 的进度与远端提示都在这里，控制台按红色显示。 */
  stderr: string
  /** 命令是否成功。 */
  ok: boolean
}

/** 最多保留的记录数，避免长时间使用把内存撑大。 */
const MAX_ENTRIES = 200

/** 当前记录；每次变更都替换引用，供 useSyncExternalStore 判断快照变化。 */
let entries: GitConsoleEntry[] = []
let sequence = 0
const listeners = new Set<() => void>()

/**
 * 生成 `HH:mm:ss.SSS` 形式的时间戳。
 * @param date 时间
 * @returns 控制台时间前缀
 */
function timestampOf(date: Date): string {
  const pad = (value: number, width = 2): string => String(value).padStart(width, '0')

  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
}

/** 通知全部订阅者；单个订阅者抛错不影响其余订阅者。 */
function notify(): void {
  for (const listener of listeners) {
    try {
      listener()
    } catch (error) { // 一个订阅者出错不应打断其余订阅者
      console.error('[dsh-ide] Git console listener failed:', error)
    }
  }
}

/**
 * 追加一条命令记录。
 * @param entry 除去 id 与时间以外的记录内容
 */
export function recordGitConsole(entry: Omit<GitConsoleEntry, 'id' | 'time'>): void {
  sequence += 1
  entries = [...entries, { ...entry, id: sequence, time: timestampOf(new Date()) }].slice(-MAX_ENTRIES)
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
