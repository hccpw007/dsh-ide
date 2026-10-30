/**
 * 项目树的 Git 状态订阅。
 *
 * 文件名着色与忽略项置灰都来自 Git，而状态映射与被忽略路径集合由同一批广播更新，
 * 因此两者共用一个订阅入口，树的其它逻辑只需关心「拿到当前值」。
 */
import { useCallback, useMemo, useSyncExternalStore } from 'react'

import type { IdeServices } from '../../shell/contract'

/**
 * 订阅 Git 状态映射，给文件名着色。
 * @param services 服务总线
 * @returns 当前映射
 */
export function useGitStatus(services: IdeServices): ReadonlyMap<string, string> {
  return useSyncExternalStore(
    (listener) => services.subscribeGitStatus(listener),
    () => services.gitStatus(),
    () => services.gitStatus(),
  )
}

/**
 * 订阅被 .gitignore 忽略的路径集合；与 Git 状态同一批广播，因此复用同一个订阅。
 * @param services 服务总线
 * @returns 忽略路径集合，目录条目以 / 结尾
 */
function useGitIgnored(services: IdeServices): ReadonlySet<string> {
  return useSyncExternalStore(
    (listener) => services.subscribeGitStatus(listener),
    () => services.gitIgnored(),
    () => services.gitIgnored(),
  )
}

/**
 * 判断路径是否被忽略：精确命中文件，或位于被忽略的目录之下。
 *
 * 忽略集合里文件与目录混在一起（目录带尾斜杠），这里先拆成两类再判断，
 * 避免每次判定都遍历全部条目。
 * @param services 服务总线
 * @returns 判断函数
 */
export function useIsIgnored(services: IdeServices): (path: string) => boolean {
  const ignoredPaths = useGitIgnored(services)

  const matcher = useMemo(() => {
    const files = new Set<string>()
    const directories: string[] = []

    for (const entry of ignoredPaths) {
      // 目录条目带尾斜杠，去掉后再与行路径（不带斜杠）比较
      if (entry.endsWith('/')) directories.push(entry.slice(0, -1))
      else files.add(entry)
    }

    return { files, directories }
  }, [ignoredPaths])

  return useCallback(
    (path: string): boolean =>
      matcher.files.has(path) ||
      matcher.directories.some((directory) => path === directory || path.startsWith(`${directory}/`)),
    [matcher],
  )
}
