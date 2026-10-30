/**
 * Commit 弹窗的数据模型：待提交文件、目录树与状态统计。
 *
 * 与 Git 面板的 Local Changes 不同，提交对话框按目录树展示并支持逐项勾选：
 * 勾选结果决定本次提交包含哪些路径，树上的勾选状态还要支持「部分选中」。
 */
import type { GitChange, GitStatus } from './api'

/** 待提交文件。 */
export interface CommitFile {
  /** 相对仓库根的路径。 */
  path: string
  /** 索引区状态。 */
  change: GitChange
  /** 右侧取索引区。 */
  staged: boolean
  /** 是否未跟踪。 */
  untracked: boolean
  /** 是否冲突。 */
  conflicted: boolean
}

/** 目录树节点。 */
export interface CommitNode {
  /** 展示名；压缩后的目录会带路径分隔符。 */
  name: string
  /** 相对仓库根的路径。 */
  path: string
  /** 是否目录。 */
  directory: boolean
  /** 子节点；文件为空数组。 */
  children: CommitNode[]
  /** 文件节点对应的数据。 */
  file?: CommitFile
  /** 目录下的文件总数。 */
  fileCount: number
}

/**
 * 把工作区状态拆成「已跟踪」与「未跟踪」两组待提交文件。
 *
 * 同一路径可能同时出现在索引区与工作区（AM / MM）：IDEA 的提交列表里也只占
 * 一行，索引区状态优先，否则暂存后再提交会被拆成两条记录。
 * @param status 仓库状态
 * @returns 已跟踪与未跟踪文件
 */
export function splitFiles(status: GitStatus): { tracked: CommitFile[]; untracked: CommitFile[] } {
  const tracked = new Map<string, CommitFile>()

  for (const change of status.unstaged) {
    tracked.set(change.path, { path: change.path, change, staged: false, untracked: false, conflicted: false })
  }

  for (const change of status.staged) {
    tracked.set(change.path, { path: change.path, change, staged: true, untracked: false, conflicted: false })
  }

  for (const change of status.conflicted) {
    tracked.set(change.path, { path: change.path, change, staged: false, untracked: false, conflicted: true })
  }

  const untracked = status.untracked.map((change) => ({
    path: change.path,
    change,
    staged: false,
    untracked: true,
    conflicted: false,
  }))

  return { tracked: [...tracked.values()], untracked }
}

/**
 * 构建目录树。
 *
 * 只含一条目录链的中间节点会被压缩成 `components/DealConditions` 这样一行，
 * 与 IDEA 的树一致：不必为每一层单独占一行。
 * @param files 待提交文件
 * @returns 根节点
 */
export function buildCommitTree(files: CommitFile[]): CommitNode {
  const root: CommitNode = { name: '', path: '', directory: true, children: [], fileCount: 0 }

  for (const file of files) {
    const parts = file.path.split('/').filter((part) => part !== '')
    let node = root

    for (let index = 0; index < parts.length; index += 1) {
      const path = parts.slice(0, index + 1).join('/')
      const last = index === parts.length - 1
      let child = node.children.find((item) => item.path === path && item.directory === !last)

      if (child === undefined) {
        child = { name: parts[index] ?? '', path, directory: !last, children: [], fileCount: 0 }
        node.children.push(child)
      }

      node = child
    }

    node.file = file
  }

  countFiles(root)
  compress(root)

  return root
}

/**
 * 自底向上统计每个目录下的文件数。
 * @param node 节点
 * @returns 节点下的文件数
 */
function countFiles(node: CommitNode): number {
  if (!node.directory) {
    node.fileCount = 1

    return 1
  }

  let total = 0

  for (const child of node.children) total += countFiles(child)

  node.fileCount = total

  return total
}

/**
 * 压缩只含单个目录子节点的目录链，并让目录排在文件前。
 * @param node 节点
 */
function compress(node: CommitNode): void {
  if (!node.directory) return

  node.children.sort((left, right) => {
    if (left.directory !== right.directory) return left.directory ? -1 : 1

    return left.name.localeCompare(right.name)
  })

  for (const child of node.children) compress(child)

  // 根节点保留自己的名字；其后只含一个目录且没有文件时，把子目录并上来
  const only = node.children.length === 1 ? node.children[0] : undefined

  if (node.path !== '' && only !== undefined && only.directory) {
    node.name = `${node.name}/${only.name}`
    node.children = only.children
    node.path = only.path
  }
}

/**
 * 取文件的状态字母。
 * @param file 待提交文件
 * @returns 单字母状态；未知状态按修改处理
 */
export function statusOf(file: CommitFile): string {
  if (file.conflicted) return 'M'
  if (file.untracked) return 'U'

  const status = file.change.indexStatus.trim() === '' ? file.change.worktreeStatus : file.change.indexStatus
  const letter = status.trim().slice(0, 1)

  return letter === '' || letter === '?' ? 'M' : letter
}

/**
 * 把状态字母映射成文件名色调，与项目树、Local Changes 共用同一套状态色。
 * @param status 状态字母
 * @returns Tailwind 文本色类名
 */
export function statusTone(status: string): string {
  if (status === 'U' || status === '?') return 'text-vcs-unknown'
  if (status === 'A') return 'text-vcs-added'
  if (status === 'D') return 'text-vcs-deleted'

  // 修改、重命名与复制在 IDEA 里统一用「已修改」的蓝色
  return 'text-vcs-modified'
}

/** 统计项：状态类别与对应文件数。 */
export interface CommitSummary {
  /** 语言 key：modified / added / deleted / unversioned。 */
  key: 'modified' | 'added' | 'deleted' | 'unversioned'
  /** 文件数。 */
  count: number
}

/**
 * 汇总各状态的文件数，供弹窗显示「N modified」。
 * @param files 待提交文件
 * @returns 按状态分组的统计
 */
export function summarize(files: CommitFile[]): CommitSummary[] {
  const counts = new Map<CommitSummary['key'], number>()

  for (const file of files) {
    const status = statusOf(file)
    const key: CommitSummary['key'] =
      status === 'U' ? 'unversioned' : status === 'A' ? 'added' : status === 'D' ? 'deleted' : 'modified'

    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const order: CommitSummary['key'][] = ['modified', 'added', 'deleted', 'unversioned']

  return order.flatMap((key) => {
    const count = counts.get(key)

    return count === undefined ? [] : [{ key, count }]
  })
}

/**
 * 摊平整棵树里的文件节点，顺序与树的显示顺序一致。
 * @param node 节点
 * @returns 文件列表
 */
export function flattenFiles(node: CommitNode): CommitFile[] {
  if (!node.directory) return node.file === undefined ? [] : [node.file]

  return node.children.flatMap((child) => flattenFiles(child))
}
