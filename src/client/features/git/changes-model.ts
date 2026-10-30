/**
 * Local Changes 列表的展示模型：分组、排序与目录树。
 *
 * 变更文件的形状、目录压缩与文件数统计都与 Commit 弹窗共用 commit-model，
 * 保证同一批变更在两个入口的状态色、目录层级完全一致；这里只补 Local Changes
 * 特有的三个分组与「按目录 / 平铺」两种排布方式。
 */
import type { GitStatus } from './api'
import { buildCommitTree, compareChangesByName, statusOf, type CommitFile, type CommitNode } from './commit-model'

/** 变更分组标识。 */
export type ChangeGroupKey = 'conflicted' | 'changes' | 'untracked'

/** 一个变更分组。 */
export interface ChangeGroup {
  /** 分组标识，同时作为折叠键。 */
  key: ChangeGroupKey
  /** 分组标题的语言 key。 */
  label: string
  /** 分组内容。 */
  items: CommitFile[]
}

/** 列表排序方式。 */
export type ChangeSort = 'name' | 'path' | 'status'

/** 排序方式对应的语言 key；菜单文案直接由此翻译。 */
export const CHANGE_SORT_LABELS: Record<ChangeSort, string> = {
  name: 'sortByName',
  path: 'sortByPath',
  status: 'sortByStatus',
}

/** 一个分组按当前分组方式与排序方式整理后的结果。 */
export interface ChangeGroupView {
  /** 原始分组。 */
  group: ChangeGroup
  /** 按当前排序排好的文件。 */
  items: CommitFile[]
  /** 按目录分组的树根；平铺模式下为 null。 */
  tree: CommitNode | null
}

/**
 * 把工作区状态拆成 IDEA 的三个变更分组。
 *
 * 同一路径可能同时出现在索引区与工作区（AM / MM）：Local Changes 是单一列表，
 * 同一文件只占一行，索引区状态优先，否则暂存与取消暂存会作用到两行上。
 * @param status 仓库状态；null 表示不是仓库或尚未加载
 * @returns 非空的变更分组
 */
export function buildGroups(status: GitStatus | null): ChangeGroup[] {
  if (status === null) return []

  const tracked = new Map<string, CommitFile>()

  for (const change of status.unstaged) {
    tracked.set(change.path, { path: change.path, change, staged: false, untracked: false, conflicted: false })
  }

  for (const change of status.staged) {
    tracked.set(change.path, { path: change.path, change, staged: true, untracked: false, conflicted: false })
  }

  return [
    {
      key: 'conflicted' as const,
      label: 'groupConflicted',
      items: status.conflicted.map((change) => ({
        path: change.path,
        change,
        staged: false,
        untracked: false,
        conflicted: true,
      })),
    },
    { key: 'changes' as const, label: 'groupChanges', items: [...tracked.values()] },
    // 未纳入版本控制的文件单独成组：IDEA 的 Unversioned Files 与已跟踪的修改分列
    {
      key: 'untracked' as const,
      label: 'groupUntracked',
      items: status.untracked.map((change) => ({
        path: change.path,
        change,
        staged: false,
        untracked: true,
        conflicted: false,
      })),
    },
  ].filter((group) => group.items.length > 0)
}

/**
 * 比较两个变更文件。
 * @param sort 排序方式
 * @param left 左文件
 * @param right 右文件
 * @returns 比较结果
 */
function compareChanges(sort: ChangeSort, left: CommitFile, right: CommitFile): number {
  if (sort === 'path') return left.path.localeCompare(right.path)

  if (sort === 'status') {
    const byStatus = statusOf(left).localeCompare(statusOf(right))

    return byStatus === 0 ? compareChangesByName(left, right) : byStatus
  }

  return compareChangesByName(left, right)
}

/**
 * 目录的折叠键。
 *
 * 分组键与目录路径可能同名（目录叫 changes 之类），加前缀避免两者相互折叠。
 * @param groupKey 分组标识
 * @param path 目录路径
 * @returns 折叠键
 */
export function directoryCollapseKey(groupKey: ChangeGroupKey, path: string): string {
  return `dir:${groupKey}:${path}`
}

/**
 * 按当前分组方式与排序方式整理每个分组。
 * @param groups 变更分组
 * @param grouped 是否按目录分组
 * @param sort 排序方式
 * @returns 每个分组的视图数据
 */
export function buildGroupViews(groups: ChangeGroup[], grouped: boolean, sort: ChangeSort): ChangeGroupView[] {
  return groups.map((group) => {
    const items = [...group.items].sort((left, right) => compareChanges(sort, left, right))

    return {
      group,
      items,
      tree: grouped ? buildCommitTree(items, (left, right) => compareChanges(sort, left, right)) : null,
    }
  })
}

/**
 * 收集树里未折叠的文件，顺序与列表显示顺序一致。
 * @param node 目录节点
 * @param groupKey 分组标识
 * @param collapsed 已折叠的键
 * @param out 收集结果
 */
function walkVisible(
  node: CommitNode,
  groupKey: ChangeGroupKey,
  collapsed: ReadonlySet<string>,
  out: CommitFile[],
): void {
  for (const child of node.children) {
    if (child.directory) {
      if (!collapsed.has(directoryCollapseKey(groupKey, child.path))) {
        walkVisible(child, groupKey, collapsed, out)
      }

      continue
    }

    if (child.file !== undefined) out.push(child.file)
  }
}

/**
 * 收集当前可见的文件，供差异视图的上一个/下一个导航使用。
 * @param views 分组视图
 * @param collapsed 已折叠的键
 * @returns 按显示顺序排列的文件
 */
export function collectVisible(views: ChangeGroupView[], collapsed: ReadonlySet<string>): CommitFile[] {
  const visible: CommitFile[] = []

  for (const view of views) {
    if (collapsed.has(view.group.key)) continue

    if (view.tree === null) {
      visible.push(...view.items)

      continue
    }

    walkVisible(view.tree, view.group.key, collapsed, visible)
  }

  return visible
}

/**
 * 收集树里所有目录的折叠键。
 * @param node 目录节点
 * @param groupKey 分组标识
 * @param out 收集结果
 */
function collectNodeKeys(node: CommitNode, groupKey: ChangeGroupKey, out: string[]): void {
  for (const child of node.children) {
    if (!child.directory) continue

    out.push(directoryCollapseKey(groupKey, child.path))
    collectNodeKeys(child, groupKey, out)
  }
}

/**
 * 收集全部可折叠键，供 Collapse All / Expand All 使用。
 * @param views 分组视图
 * @returns 分组键与目录折叠键
 */
export function collectCollapseKeys(views: ChangeGroupView[]): string[] {
  const keys: string[] = []

  for (const view of views) {
    keys.push(view.group.key)

    if (view.tree !== null) collectNodeKeys(view.tree, view.group.key, keys)
  }

  return keys
}
