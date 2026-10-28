/**
 * 宿主 workspaceFiles Remote 的访问入口。
 *
 * 项目树只读浏览目录，直接复用宿主的会话工作区读取能力，不另开 HTTP 路由：
 * 路径由宿主按会话根解析，插件拿不到也传不进工作区之外的目录。
 * Remote 只在插件 apply 时由入口绑定，因此这里用一个最小的订阅接口把「服务何时可用」
 * 告诉 React；feature 只依赖本模块，不需要接触宿主的 client 上下文。
 */

/** 目录项类型；宿主把符号链接解析为目标类型，other 覆盖既非文件也非目录的条目。 */
export type WorkspaceEntryType = 'file' | 'directory' | 'other' | (string & {})

/** 目录中的一个直接子项。 */
export interface WorkspaceDirectoryEntry {
  /** 文件名，不含路径。 */
  name: string
  /** 条目类型；目录链接会报告为 directory，可继续展开。 */
  type: WorkspaceEntryType
  /** 宿主能报告时给出的字节数。 */
  size?: number
}

/** 一个目录的直接子项列表。 */
export interface WorkspaceDirectoryListing {
  /** 被列举目录相对工作区根的路径；根目录为空串。 */
  path: string
  /** 直接子项，顺序由宿主文件系统给出。 */
  entries: WorkspaceDirectoryEntry[]
  /** 子项数量超过宿主上限时为 true。 */
  truncated: boolean
}

/** Remote 调用结果；失败时 value 缺省，error 带稳定错误码。 */
export interface WorkspaceFilesResult {
  ok: boolean
  value?: WorkspaceDirectoryListing
  error?: { code?: string; message?: string }
}

/** 本插件用到的 workspaceFiles 能力。 */
export interface WorkspaceFilesRemote {
  /**
   * 列出一个会话工作区内目录的直接子项。
   * @param sessionId 会话 id，宿主据此确定工作区根
   * @param path 相对工作区根的路径；根目录传 `.`
   * @param signal 取消信号
   * @returns 目录列表或失败信息
   */
  list(sessionId: string, path: string, signal?: AbortSignal): Promise<WorkspaceFilesResult>
}

/** 当前可用的 Remote；未绑定时为 undefined，项目树据此显示降级提示。 */
let workspaceFilesRemote: WorkspaceFilesRemote | undefined

/** 监听 Remote 绑定变化的回调集合。 */
const listeners = new Set<() => void>()

/**
 * 从宿主 remote 服务里收窄出 workspaceFiles 能力。
 * @param value 宿主的 remote 服务对象
 * @returns 形状符合预期时返回该 Remote，否则返回 undefined
 */
export function asWorkspaceFilesRemote(value: unknown): WorkspaceFilesRemote | undefined {
  if (typeof value !== 'object' || value === null) return undefined

  const candidate = (value as { workspaceFiles?: unknown }).workspaceFiles
  if (typeof candidate !== 'object' || candidate === null) return undefined

  const list = (candidate as { list?: unknown }).list

  return typeof list === 'function' ? (candidate as WorkspaceFilesRemote) : undefined
}

/**
 * 绑定或解绑 Remote，并通知已挂载的视图重新取值。
 * @param next 新的 Remote；传 undefined 表示宿主服务已卸载
 */
export function setWorkspaceFilesRemote(next: WorkspaceFilesRemote | undefined): void {
  workspaceFilesRemote = next

  for (const listener of listeners) listener()
}

/**
 * 读取当前 Remote。
 * @returns 已绑定的 Remote，未绑定时为 undefined
 */
export function getWorkspaceFilesRemote(): WorkspaceFilesRemote | undefined {
  return workspaceFilesRemote
}

/**
 * 订阅 Remote 绑定变化，供 useSyncExternalStore 使用。
 * @param listener 变化回调
 * @returns 取消订阅函数
 */
export function subscribeWorkspaceFiles(listener: () => void): () => void {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}
