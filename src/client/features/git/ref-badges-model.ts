/**
 * 提交行引用标签的分组模型。
 *
 * 规则取自 IDEA 的 `GitRefManager.groupForTable` 与 `SimpleRefGroup.buildGroups`：
 * 同一提交上的引用先分组——当前分支单独一组、本地分支与它的上游远程分支合成
 * `origin & main`、其余本地分支与远程分支各自一组、所有标签合并成一组（不显示名字），
 * 当前检出点（HEAD）叠加到第一组的最前面。这里只做纯计算，图标与布局见 RefBadges。
 */
import type { GitRefs } from './api'

/** 引用类型：HEAD、本地分支、远程分支、标签。 */
export type RefKind = 'head' | 'local' | 'remote' | 'tag'

/** 悬停提示里引用类型的展示顺序，与 IDEA 的 refs 提示框一致。 */
export const REF_KIND_ORDER: RefKind[] = ['head', 'local', 'remote', 'tag']

/** 引用索引：类型、当前分支与上游关系，整张表只建一次。 */
export interface RefIndex {
  /** 引用名到类型集合；同一名字可能既是分支又是标签。 */
  kinds: Map<string, RefKind[]>
  /** 当前分支名；空串或 `HEAD` 表示游离 HEAD。 */
  head: string
  /** 本地分支名到上游远程分支短名（如 `origin/main`）。 */
  upstream: Map<string, string>
  /** 已知的远程名，用于匹配没有配置上游的同名远程分支。 */
  remotes: string[]
}

/** 一组待展示的引用。 */
export interface RefGroup {
  /** 组内引用名；顺序决定图标颜色的层次顺序，与 IDEA 的 `RefGroup.refs` 一致。 */
  names: string[]
  /** 每个引用的类型，与 names 一一对应。 */
  kinds: RefKind[]
  /** 组文本；空串表示只画图标（标签组默认不显示名字）。 */
  label: string
}

/**
 * 构建「引用名 → 类型」索引。
 *
 * 提交日志里的 `%D` 只给裸名，分不清本地分支、远程分支与标签；用分支树已经读到的
 * 引用集合反查才能精确着色。同名引用可能既是分支又是标签，因此值是类型数组。
 * @param known 已知的本地分支、远程分支与标签；未读取到时为 null
 * @returns 引用索引
 */
export function buildRefKindIndex(known: GitRefs | null): RefIndex {
  const kinds = new Map<string, RefKind[]>()
  const upstream = new Map<string, string>()
  const remotes: string[] = []

  /**
   * 登记一个引用名及其类型。
   * @param name 引用短名
   * @param kind 引用类型
   */
  const add = (name: string, kind: RefKind): void => {
    const types = kinds.get(name) ?? []

    if (!types.includes(kind)) types.push(kind)
    kinds.set(name, types)
  }

  /**
   * 记录远程名，保持分支树给出的顺序。
   * @param name 远程名
   */
  const addRemote = (name: string): void => {
    if (name !== '' && !remotes.includes(name)) remotes.push(name)
  }

  // HEAD 是 git 的保留引用，不依赖分支树也能确定它的类型
  add('HEAD', 'head')

  if (known === null) return { kinds, head: '', upstream, remotes }

  for (const branch of known.local) {
    add(branch.name, 'local')

    // 上游名形如 `<远程名>/<分支名>`：去掉本地分支名后缀得到远程名，远程名自己
    // 带斜杠时也不会被截断；无法这样推导时退回第一个斜杠之前的部分
    const suffix = `/${branch.name}`
    const slashed = branch.upstream.indexOf('/')

    if (slashed > 0) {
      upstream.set(branch.name, branch.upstream)
      addRemote(
        branch.upstream.endsWith(suffix)
          ? branch.upstream.slice(0, branch.upstream.length - suffix.length)
          : branch.upstream.slice(0, slashed),
      )
    }
  }

  for (const branch of known.remote) add(branch.name, 'remote')

  for (const tag of known.tags) add(tag.name, 'tag')

  return { kinds, head: known.head, upstream, remotes }
}

/**
 * 取单个引用的类型。
 * @param name 引用短名
 * @param index 引用索引
 * @returns 引用类型
 */
export function refKindOf(name: string, index: RefIndex): RefKind {
  if (name === 'HEAD') return 'head'

  const kinds = index.kinds.get(name)

  if (kinds !== undefined && kinds.length > 0) {
    // 同名引用同时是分支与标签时按分支显示：IDEA 的标签默认不显示名字，两个同名
    // 标签并排会出现两个完全一样的图标
    if (kinds.includes('local')) return 'local'
    if (kinds.includes('remote')) return 'remote'

    return kinds[0]
  }

  // 引用集合还没读到、或分支已在别处删除（旧提交上仍显示引用）时只能按名字推断：
  // 远程分支一律带 `<remote>/` 前缀，本地分支名通常不带斜杠
  return name.includes('/') ? 'remote' : 'local'
}

/**
 * 把同一提交上的引用按 IDEA 的规则分组。
 * @param refs 提交上的引用短名，`HEAD` 表示该提交是当前检出点
 * @param index 引用索引
 * @returns 按展示顺序排好的分组
 */
export function buildRefGroups(refs: string[], index: RefIndex): RefGroup[] {
  const heads: string[] = []
  const locals: string[] = []
  const remotes: string[] = []
  const tags: string[] = []

  for (const name of refs) {
    const kind = refKindOf(name, index)

    if (kind === 'head') heads.push(name)
    else if (kind === 'local') locals.push(name)
    else if (kind === 'remote') remotes.push(name)
    else tags.push(name)
  }

  const remainingLocals = [...locals]
  const remainingRemotes = [...remotes]
  const tracked: RefGroup[] = []

  for (const local of locals) {
    const upstream = index.upstream.get(local)
    // 优先按真实上游匹配；没有配置上游时退回 `<远程名>/<本地名>`，与 IDEA 一致
    const remote =
      upstream !== undefined && remainingRemotes.includes(upstream)
        ? upstream
        : index.remotes.map((remoteName) => `${remoteName}/${local}`).find((name) => remainingRemotes.includes(name))

    if (remote === undefined) continue

    tracked.push({
      names: [local, remote],
      kinds: ['local', 'remote'],
      label: `${remoteNameOf(remote, index.remotes)} & ${local}`,
    })
    remove(remainingLocals, local)
    remove(remainingRemotes, remote)
  }

  const groups: RefGroup[] = []
  const detached = index.head === '' || index.head === 'HEAD'

  // IDEA 把当前分支单独放最前；它若已与上游合并，tracked 组就成了第一组
  if (!detached && remainingLocals.includes(index.head)) {
    groups.push({ names: [index.head], kinds: ['local'], label: index.head })
    remove(remainingLocals, index.head)
  }

  // 与上游合并的组紧随当前分支，之后才是没有上游的本地分支、远程分支与标签
  groups.push(...tracked)

  for (const name of remainingLocals) groups.push({ names: [name], kinds: ['local'], label: name })
  for (const name of remainingRemotes) groups.push({ names: [name], kinds: ['remote'], label: name })

  // 标签默认合并成一组、不显示名字（IDEA 的 showTagNames 默认关闭）
  if (tags.length > 0) groups.push({ names: tags, kinds: tags.map(() => 'tag'), label: '' })

  if (heads.length > 0) {
    // 游离 HEAD 单独成组；在分支上时 HEAD 叠进第一组，黄色图标出现在图标簇最左侧
    const headKinds = heads.map((): RefKind => 'head')

    if (detached || groups.length === 0) {
      groups.unshift({ names: heads, kinds: headKinds, label: 'HEAD' })
    } else {
      groups[0].names.unshift(...heads)
      groups[0].kinds.unshift(...headKinds)
    }
  }

  return groups
}

/**
 * 把一组引用的类型压缩成图标颜色序列。
 *
 * 同一类型最多出两枚图标（IDEA 的 `SimpleRefGroup.getColors` 规则）：一个引用时画
 * 一枚，两个及以上时画两枚叠放，第三个起不再增加层次。
 * @param kinds 组内引用类型
 * @returns 图标颜色序列，顺序即叠放层次
 */
export function groupIconColors(kinds: RefKind[]): RefKind[] {
  const order: RefKind[] = []
  const counts = new Map<RefKind, number>()

  for (const kind of kinds) {
    if (!counts.has(kind)) order.push(kind)
    counts.set(kind, (counts.get(kind) ?? 0) + 1)
  }

  const colors: RefKind[] = []

  for (const kind of order) colors.push(kind, ...((counts.get(kind) ?? 0) > 1 ? [kind] : []))

  return colors
}

/**
 * 取远程分支所属的远程名。
 *
 * 远程名本身可能带斜杠，`<远程名>/<分支名>` 不能用最后一个斜杠硬切；这里按已知
 * 远程名做最长前缀匹配，匹配不到时退回最后一个斜杠之前的部分。
 * @param remoteBranch 远程分支短名（如 `origin6/test`）
 * @param remotes 已知的远程名
 * @returns 远程名
 */
function remoteNameOf(remoteBranch: string, remotes: string[]): string {
  const matched = remotes
    .filter((name) => remoteBranch.startsWith(`${name}/`))
    .sort((left, right) => right.length - left.length)[0]

  return matched ?? remoteBranch.slice(0, remoteBranch.lastIndexOf('/'))
}

/**
 * 删除数组中的第一个匹配项。
 * @param list 目标数组
 * @param item 待删除项
 */
function remove(list: string[], item: string): void {
  const index = list.indexOf(item)

  if (index >= 0) list.splice(index, 1)
}
