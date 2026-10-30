/**
 * 项目树的目录数据加载。
 *
 * 懒加载：只请求已展开的目录，未展开的目录不发请求。文件系统变更广播、换根与手动
 * 刷新都走同一条路径重新请求受影响的目录，其余目录保持原样，因此刷新时树不会整屏
 * 闪成占位行。
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import type { IdeServices } from '../../shell/contract'

import { fetchDirectory, parentPathOf, ROOT_PATH, type DirectoryState } from './data'

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
  /** 整树重新加载。 */
  refresh(): void
  /** 刷新计数；主 hook 据此重置展开、选中与焦点。 */
  reloadToken: number
}

/**
 * 管理各目录的加载状态。
 * @param options 见 DirectoryLoaderOptions
 * @returns 见 DirectoryLoader
 */
export function useDirectoryLoader({ services, root }: DirectoryLoaderOptions): DirectoryLoader {
  /** 各目录的加载状态；缺省表示尚未请求。 */
  const [directories, setDirectories] = useState<Record<string, DirectoryState>>({})
  /** 递增后整棵树重新加载。 */
  const [reloadToken, setReloadToken] = useState(0)

  /** 每个目录正在进行的请求；换根或刷新时统一取消。 */
  const controllers = useRef(new Map<string, AbortController>())

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

  // 根变化或手动刷新时重建目录状态
  useEffect(() => {
    setDirectories({})

    if (root === '') return undefined

    void loadDirectory(ROOT_PATH)

    return () => {
      for (const controller of controllers.current.values()) controller.abort()
      controllers.current.clear()
    }
  }, [loadDirectory, reloadToken, root])

  // 文件系统变更广播：重新加载受影响的目录，其余目录保持不动
  useEffect(
    () =>
      services.subscribeInvalidate((path) => {
        if (root === '') return

        if (path === undefined) {
          setReloadToken((previous) => previous + 1)

          return
        }

        const parent = parentPathOf(path)
        void loadDirectory(parent)
        // 目录内部发生变化时，如果它自身的子项已加载，也要一并刷新
        if (directories[path]?.status === 'ready') void loadDirectory(path)
      }),
    [directories, loadDirectory, root, services],
  )

  return {
    directories,
    loadDirectory,
    retryDirectory: (path) => void loadDirectory(path),
    refresh: () => setReloadToken((previous) => previous + 1),
    reloadToken,
  }
}
