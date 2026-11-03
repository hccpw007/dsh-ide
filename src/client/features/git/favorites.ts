/**
 * Log 分支树的收藏分支。
 *
 * 与 IDEA 一致，收藏只是界面标记：不写仓库、不改 git 配置，因此落在 localStorage。
 * 收藏键用树里显示的引用短名（本地 `main`、远程 `origin/main`），同一仓库内唯一。
 */
import { safeSetItem } from '../../../common/storage-maintenance'

/** localStorage 前缀；格式变更时换版本让旧数据自然失效。 */
const STORAGE_PREFIX = 'dsh-ide.git.favorites.v1.'

/** 仓库根 → 收藏集合；避免每次渲染都重新解析 JSON。 */
const cache = new Map<string, ReadonlySet<string>>()

/**
 * 读取某个仓库的收藏分支。
 * @param root 工作区根
 * @returns 收藏的引用短名
 */
export function readFavorites(root: string): ReadonlySet<string> {
  const cached = cache.get(root)
  if (cached !== undefined) return cached

  let values: ReadonlySet<string> = new Set<string>()

  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${root}`)
    const parsed: unknown = raw === null ? [] : JSON.parse(raw)

    // 存储内容可能被手改或来自旧版本，只接受字符串数组
    if (Array.isArray(parsed)) values = new Set(parsed.filter((item): item is string => typeof item === 'string'))
  } catch (error) { // 隐私模式下读取会失败；收藏回落为空，不影响其他功能
    console.error('[dsh-ide] Failed to read favorite branches:', error)
  }

  cache.set(root, values)

  return values
}

/**
 * 切换某个引用的收藏状态。
 * @param root 工作区根
 * @param ref 树里显示的引用短名
 * @returns 切换后的收藏集合
 */
export function toggleFavorite(root: string, ref: string): ReadonlySet<string> {
  const next = new Set(readFavorites(root))

  if (next.has(ref)) next.delete(ref)
  else next.add(ref)

  cache.set(root, next)

  safeSetItem(`${STORAGE_PREFIX}${root}`, JSON.stringify([...next]))

  return next
}
