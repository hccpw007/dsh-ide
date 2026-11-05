/**
 * 编辑器文档状态的跨承载面共享。
 *
 * 同一个工作空间可能同时出现在主区页签、右侧栏与对话页弹窗，也会被同一项目的
 * 多个对话共同使用。共享开关打开时，这些地方打开同一份文件必须看到同一段文字：
 * 任一承载面打字，其余位置立刻跟上。
 *
 * 除了正文，未保存标记、磁盘版本与「保存中」也一并共享。这三样只要有一处不同步，
 * 就会出现一处显示「已修改」、另一处显示「已保存」，或者两面同时写盘、后写入的
 * 一方被乐观锁判成冲突。
 *
 * 滚动位置走独立通道：它变化极频繁，混进文档状态会让每个滚动帧都触发一次
 * React 重渲染；单独订阅后，跟随滚动只碰编辑器内核，不产生组件渲染。
 *
 * 文档按 `scopeKey + 路径` 收进模块级单例池：共享时 scopeKey 等于工作空间键，
 * 同一项目的不同对话、不同承载面共用一份；共享关闭时带实例后缀，各持一份。
 */

/** 保存冲突时磁盘上的最新内容。 */
export interface EditorDocumentConflict {
  /** 磁盘上的最新版本号。 */
  version: string
  /** 磁盘上的最新全文。 */
  text: string
}

/** 一份打开中文件的状态。 */
export interface EditorDocument {
  /** 编辑器里的当前文本，可能含未保存改动。 */
  text: string
  /** 与磁盘一致的那份文本，用来判断脏状态。 */
  savedText: string
  /** 打开或上次保存时磁盘上的版本号，用于保存时的乐观锁。 */
  version: string
  /** 是否与磁盘不一致。 */
  dirty: boolean
  /**
   * 保存是否进行中。
   *
   * 共享后多个承载面会各自跑自动保存，没有这个标记就会并发写盘，
   * 后写入的一方拿着旧版本号被宿主的乐观锁打回。
   */
  saving: boolean
  /** 保存冲突时的磁盘内容；null 表示没有冲突。 */
  conflict: EditorDocumentConflict | null
}

/** 一份共享文档的读写入口。 */
export interface EditorDocumentStore {
  /**
   * 取某条路径的文档状态。
   * @param path 相对工作区根的路径
   * @returns 文档状态；没打开过时 undefined
   */
  get(path: string): EditorDocument | undefined
  /**
   * 写入文档状态；引用不变时视为无变化，不通知订阅者。
   * @param path 相对工作区根的路径
   * @param document 新状态
   */
  set(path: string, document: EditorDocument): void
  /**
   * 释放一条路径的文档与滚动位置。
   *
   * 关闭标签后不再需要全文；共享模式下同一文件的另一承载面还在看时，
   * 它的订阅回调会在需要时按磁盘重新读取，不会读到半份状态。
   * @param path 相对工作区根的路径
   */
  release(path: string): void
  /**
   * 订阅某条路径的文档变化。
   * @param path 相对工作区根的路径
   * @param listener 变化回调
   * @returns 取消订阅
   */
  subscribe(path: string, listener: () => void): () => void
  /**
   * 取某条路径的滚动位置。
   * @param path 相对工作区根的路径
   * @returns 顶部可见行号（1 起）；没记录过时 1
   */
  scroll(path: string): number
  /**
   * 记录某条路径的滚动位置。
   * @param path 相对工作区根的路径
   * @param line 顶部可见行号（1 起）
   */
  setScroll(path: string, line: number): void
  /**
   * 订阅某条路径的滚动位置变化。
   * @param path 相对工作区根的路径
   * @param listener 变化回调，参数为顶部行号
   * @returns 取消订阅
   */
  subscribeScroll(path: string, listener: (line: number) => void): () => void
  /**
   * 订阅「脏文件集合」的变化。
   *
   * 只在某个文件变脏或变干净时通知，打字过程不触发——标签栏要靠它画未保存圆点，
   * 如果每敲一个字都通知，整个标签条会跟着重渲染。
   * @param listener 变化回调
   * @returns 取消订阅
   */
  subscribeDirty(listener: () => void): () => void
  /** 当前所有含未保存改动的文件路径。 */
  dirtyPaths(): ReadonlySet<string>
}

/** 按 scopeKey 缓存的文档池。 */
const stores = new Map<string, EditorDocumentStore>()

/**
 * 单个文档池里最多保留的文档数。
 *
 * 关闭标签会调用 release 释放全文，但异常路径（组件崩溃、承载面直接销毁、
 * 旧版本遗留调用）仍可能漏掉；这里再加一道 LRU 兜底：超过上限时淘汰最久未访问
 * 且没有未保存改动的文档，长会话内存不会随打开过的文件数单调上升。
 */
const MAX_DOCUMENTS = 32

/**
 * 创建一份文档池。
 * @returns 文档池入口
 */
function createStore(): EditorDocumentStore {
  const documents = new Map<string, EditorDocument>()
  const listeners = new Map<string, Set<() => void>>()
  const scrollLines = new Map<string, number>()
  const scrollListeners = new Map<string, Set<(line: number) => void>>()
  const dirtyListeners = new Set<() => void>()

  /**
   * 淘汰最久未访问且没有未保存改动的文档。
   */
  const evict = (): void => {
    if (documents.size <= MAX_DOCUMENTS) return

    for (const [path, document] of documents) {
      if (documents.size <= MAX_DOCUMENTS) return
      // 有未保存改动的文档不能淘汰：丢弃等于静默吞掉用户的编辑
      if (document.dirty) continue

      documents.delete(path)
      // 订阅者仍在时保留 listener 桶，回调里的 get 会返回 undefined 并按未打开处理
    }
  }

  return {
    get: (path) => {
      const document = documents.get(path)

      // 命中即刷新 LRU 顺序：Map 按插入序迭代，先删后插把这条挪到队尾
      if (document !== undefined) {
        documents.delete(path)
        documents.set(path, document)
      }

      return document
    },
    set: (path, document) => {
      const previous = documents.get(path)

      // 同一引用说明没有任何字段变化，跳过通知：远端同步回来的内容常常与本地一致
      if (previous === document) return

      documents.set(path, document)
      evict()

      // 脏状态翻转才通知标签栏；打字过程中的每次正文更新都不该惊动它
      if ((previous?.dirty ?? false) !== document.dirty) {
        for (const listener of dirtyListeners) listener()
      }

      const bucket = listeners.get(path)
      if (bucket === undefined) return

      for (const listener of bucket) listener()
    },
    release: (path) => {
      // 还有别的承载面在看这个文件时不释放：关闭本标签不能让另一面失去
      // 版本号与保存目标，否则它的下一次自动保存会直接失效
      const bucket = listeners.get(path)

      if (bucket !== undefined && bucket.size > 1) return

      documents.delete(path)
      scrollLines.delete(path)

      // 通知仍在看这个文件的承载面：下一次读取会按未打开处理并重新读盘
      if (bucket !== undefined) for (const listener of bucket) listener()
    },
    subscribe: (path, listener) => {
      const bucket = listeners.get(path)

      if (bucket === undefined) {
        listeners.set(path, new Set([listener]))
      } else {
        bucket.add(listener)
      }

      return () => {
        const current = listeners.get(path)
        if (current === undefined) return

        current.delete(listener)

        // 最后一个订阅者离开后回收这一格的集合，长会话里开过的文件不会一直累积
        if (current.size === 0) listeners.delete(path)
      }
    },
    scroll: (path) => scrollLines.get(path) ?? 1,
    setScroll: (path, line) => {
      // 行号没变就不通知：跟随滚动时两端会互相回报同一个位置，不拦住会来回空转
      if (scrollLines.get(path) === line) return

      scrollLines.set(path, line)

      const bucket = scrollListeners.get(path)
      if (bucket === undefined) return

      for (const listener of bucket) listener(line)
    },
    subscribeScroll: (path, listener) => {
      const bucket = scrollListeners.get(path)

      if (bucket === undefined) {
        scrollListeners.set(path, new Set([listener]))
      } else {
        bucket.add(listener)
      }

      return () => {
        const current = scrollListeners.get(path)
        if (current === undefined) return

        current.delete(listener)
        if (current.size === 0) scrollListeners.delete(path)
      }
    },
    subscribeDirty: (listener) => {
      dirtyListeners.add(listener)

      return () => {
        dirtyListeners.delete(listener)
      }
    },
    dirtyPaths: () => {
      const paths = new Set<string>()

      for (const [path, document] of documents) {
        if (document.dirty) paths.add(path)
      }

      return paths
    },
  }
}

/**
 * 取某个作用域的文档池；不存在时创建。
 * @param scopeKey 作用域键（共享时等于工作空间键，独立时带实例后缀）
 * @returns 文档池入口
 */
export function editorDocumentStore(scopeKey: string): EditorDocumentStore {
  const existing = stores.get(scopeKey)

  if (existing !== undefined) return existing

  const store = createStore()
  stores.set(scopeKey, store)

  return store
}
