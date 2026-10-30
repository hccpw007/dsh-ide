/**
 * 项目树的目录数据加载。
 *
 * 懒加载：只请求已展开的目录，未展开的目录不发请求。文件系统变更广播、换根与手动
 * 刷新都走同一条路径重新请求受影响的目录，其余目录保持原样，因此刷新时树不会整屏
 * 闪成占位行。
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import type { IdeServices } from '../../shell/contract'

import {
  entryPathOf,
  fetchDirectory,
  GIT_METADATA_DIRECTORY,
  isSafeEntryName,
  parentPathOf,
  ROOT_PATH,
  type DirectoryState,
} from './data'

/** 「全部展开」时一层内的并发请求上限，避免一次点出几十个请求打满宿主。 */
const EXPAND_ALL_CONCURRENCY = 8

/** 「全部展开」最多加载的目录数；node_modules 这类巨型目录靠它兜底，避免一次点击卡死。 */
const EXPAND_ALL_DIRECTORY_LIMIT = 5000

/** hook 入参。 */
export interface DirectoryLoaderOptions {
  /** 服务总线：用它的工作区根与变更广播。 */
  services: IdeServices
  /** 当前工作区根；空串表示尚未绑定。 */
  root: string
}

/** 目录加载器交出的状态与操作。 */
export interface DirectoryLoader {
  /** 各目录的加载状态；缺省表示尚未请求。 */
  directories: Record<string, DirectoryState>
  /** 加载一个目录的直接子项。 */
  loadDirectory(path: string): Promise<void>
  /** 重试一个加载失败的目录。 */
  retryDirectory(path: string): void
  /** 递归加载全部目录，供「全部展开」使用；内部兜底不抛错，失败时返回已收集的部分。 */
  loadAllDirectories(skipDirectory: (path: string) => boolean): Promise<ReadonlySet<string>>
  /** 整树刷新：重新请求已加载过的目录，不动展开状态。 */
  refresh(): void
}

/**
 * 管理各目录的加载状态。
 * @param options 见 DirectoryLoaderOptions
 * @returns 见 DirectoryLoader
 */
export function useDirectoryLoader({ services, root }: DirectoryLoaderOptions): DirectoryLoader {
  /** 各目录的加载状态；缺省表示尚未请求。 */
  const [directories, setDirectories] = useState<Record<string, DirectoryState>>({})

  /** 每个目录正在进行的请求；换根或刷新时统一取消。 */
  const controllers = useRef(new Map<string, AbortController>())
  /** 「全部展开」的批量加载；换根或刷新时同样取消。 */
  const expandController = useRef<AbortController | null>(null)
  /** 是否有一次整树刷新正在进行，避免重复广播叠加出多轮并发请求。 */
  const refreshInFlight = useRef(false)

  /**
   * 最新的目录状态。
   *
   * 变更广播的回调要读它判断子目录是否已加载，但订阅本身不能把它放进依赖：目录数据
   * 每变一次就退订再重订，等于每次刷新都重建一遍监听。渲染期同步 ref 是这里取最新值
   * 又不破坏订阅稳定性的做法。
   */
  const directoriesRef = useRef(directories)
  directoriesRef.current = directories

  /**
   * 加载一个目录的直接子项。
   * @param path 相对路径；根为空串
   */
  const loadDirectory = useCallback(
    async (path: string): Promise<void> => {
      if (root === '') return

      controllers.current.get(path)?.abort()

      const controller = new AbortController()
      controllers.current.set(path, controller)
      // 已加载过的目录保留旧行，等新数据回来再整体替换：自动保存、Git 操作都会广播
      // 刷新，若先切成 loading，树会把整屏文件行换成占位符，看起来就是闪一下
      setDirectories((previous) =>
        previous[path]?.status === 'ready'
          ? previous
          : { ...previous, [path]: { status: 'loading', entries: [], truncated: false } },
      )

      try {
        const state = await fetchDirectory(root, path, controller.signal)

        // 取消是正常路径：已换根或已卸载，不再回写状态
        if (controller.signal.aborted) return

        setDirectories((previous) => ({ ...previous, [path]: state }))
      } finally {
        if (controllers.current.get(path) === controller) controllers.current.delete(path)
      }
    },
    [root],
  )

  // 换根时重建目录状态：旧工作区的目录数据对新根没有意义
  useEffect(() => {
    setDirectories({})

    if (root === '') return undefined

    void loadDirectory(ROOT_PATH)

    return () => {
      for (const controller of controllers.current.values()) controller.abort()
      controllers.current.clear()
      expandController.current?.abort()
      expandController.current = null
    }
  }, [loadDirectory, root])

  /**
   * 整树刷新：重新请求已经加载过的目录。
   *
   * 未展开的目录从未请求过，这里也不请求，保持「展开才加载」的约束；目录数据整体
   * 保留到新结果回来，因此展开、折叠、选中与焦点状态都不受影响。
   */
  const refresh = useCallback((): void => {
    // 一次整树刷新还没跑完时，后续广播只会重复请求同一批目录
    if (root === '' || refreshInFlight.current) return

    const targets = Object.keys(directoriesRef.current)

    // 还没加载过任何目录（首屏请求尚未回来）时只请求根目录
    const paths = targets.length === 0 ? [ROOT_PATH] : targets

    refreshInFlight.current = true

    void (async () => {
      try {
        // 分批而不是同帧全部发出：全部展开后目录可达数千个，
        // 一次性并发会把这些请求和 UI 一起压在宿主的事件循环上
        for (let start = 0; start < paths.length; start += EXPAND_ALL_CONCURRENCY) {
          const batch = paths.slice(start, start + EXPAND_ALL_CONCURRENCY)

          await Promise.all(batch.map((path) => loadDirectory(path)))
        }
      } finally {
        refreshInFlight.current = false
      }
    })()
  }, [loadDirectory, root])

  /**
   * 递归加载全部目录，供「全部展开」使用。
   *
   * 逐层广度优先请求：读取失败、被截断、被跳过的目录分支不再下钻，否则一次展开
   * 会把 node_modules 之类的巨型目录全部拉一遍。内部兜底不抛错，异常只记日志，
   * 返回已收集到的目录，让调用方仍能展开已经拿到的部分。
   * @param skipDirectory 判断目录是否跳过下钻；树里看不到的目录不必展开
   * @returns 已加载的目录路径集合（含根）
   */
  const loadAllDirectories = useCallback(async (skipDirectory: (path: string) => boolean): Promise<ReadonlySet<string>> => {
    const collected = new Set<string>()

    if (root === '') return collected

    expandController.current?.abort()

    const controller = new AbortController()
    expandController.current = controller

    /** 待加载目录队列。 */
    let pending: string[] = [ROOT_PATH]

    try {
      while (pending.length > 0 && !controller.signal.aborted) {
        const batch = pending.slice(0, EXPAND_ALL_CONCURRENCY)
        pending = pending.slice(EXPAND_ALL_CONCURRENCY)

        const states = await Promise.all(
          batch.map(async (path) => ({ path, state: await fetchDirectory(root, path, controller.signal) })),
        )

        // 取消是正常路径：用户已刷新或换根，不再回写过时结果
        if (controller.signal.aborted) break

        const loaded: Record<string, DirectoryState> = {}

        for (const { path, state } of states) {
          loaded[path] = state
          collected.add(path)

          if (state.status !== 'ready' || state.truncated) continue

          for (const entry of state.entries) {
            if (entry.type !== 'directory') continue

            if (!isSafeEntryName(entry.name)) continue

            // .git 内部目录极多且不属于源码；其余跳过项由调用方按忽略规则给出
            if (entry.name === GIT_METADATA_DIRECTORY) continue

            const childPath = entryPathOf(path, entry.name)

            if (skipDirectory(childPath)) continue

            if (collected.size + pending.length >= EXPAND_ALL_DIRECTORY_LIMIT) break

            pending.push(childPath)
          }
        }

        setDirectories((previous) => ({ ...previous, ...loaded }))
      }
    } catch (error) {
      console.error('[project-tree] 全部展开加载目录失败:', error)
    } finally {
      if (expandController.current === controller) expandController.current = null
    }

    return collected
  }, [root])

  // 文件系统变更广播：重新加载受影响的目录，其余目录保持不动
  useEffect(
    () =>
      services.subscribeInvalidate((path) => {
        if (root === '') return

        // 无路径的广播表示整树刷新，与工具栏刷新一致：保持展开状态重读已加载目录
        if (path === undefined) {
          refresh()

          return
        }

        const parent = parentPathOf(path)
        void loadDirectory(parent)
        // 目录内部发生变化时，如果它自身的子项已加载，也要一并刷新
        if (directoriesRef.current[path]?.status === 'ready') void loadDirectory(path)
      }),
    [loadDirectory, refresh, root, services],
  )

  return {
    directories,
    loadDirectory,
    retryDirectory: (path) => void loadDirectory(path),
    loadAllDirectories,
    refresh,
  }
}
