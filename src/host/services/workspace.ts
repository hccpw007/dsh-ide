/**
 * 工作区边界。
 *
 * 宿主 `ctx.fs` 没有删除 / 重命名 / 递归遍历，插件要用 `node:fs` 自建这些能力；
 * 一旦直连文件系统，就失去了宿主对「只允许访问会话工作区」的天然约束。所有插件
 * 路由的路径都必须先经这里解析，否则一次拼错的相对路径就能读到工作区之外。
 *
 * 工作区根由客户端随请求带来（客户端从宿主会话列表里读出该会话的 cwd）。宿主侧
 * 不信任这个字符串本身：它必须是绝对路径、必须能 realpath 成功、必须是目录，
 * 且不允许是文件系统根或用户主目录——后两者会让「工作区边界」形同虚设。
 */
import { realpath, stat } from 'node:fs/promises'
import path from 'node:path'

/** 已被认可的工作区根：键是请求里的原始绝对路径，值是 realpath 后的真实路径。 */
const knownRoots = new Map<string, string>()

/** 明确的路径违规，携带稳定错误码供客户端翻译。 */
export class WorkspaceError extends Error {
  /**
   * @param code 稳定错误码
   * @param message 诊断信息，仅进日志，不直接展示
   */
  constructor(
    readonly code: 'WORKSPACE_ROOT_INVALID' | 'PATH_OUTSIDE_WORKSPACE' | 'PATH_INVALID',
    message: string,
  ) {
    super(message)
    this.name = 'WorkspaceError'
  }
}

/**
 * 判断路径是否位于目录之内（含目录自身）。
 * @param parent 已 realpath 的父目录
 * @param child 已 realpath 或已规范化的子路径
 * @returns 位于其内时返回 true
 */
function contains(parent: string, child: string): boolean {
  if (child === parent) return true

  const relative = path.relative(parent, child)

  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

/**
 * 取得并缓存工作区根。
 *
 * 缓存让同一个会话的后续请求只付一次 realpath 开销；根被删除时缓存失效并重新判定。
 * @param root 客户端声明的绝对工作区根
 * @returns realpath 后的根
 */
async function resolveRoot(root: string): Promise<string> {
  if (typeof root !== 'string' || root === '') {
    throw new WorkspaceError('WORKSPACE_ROOT_INVALID', '缺少工作区根')
  }

  if (!path.isAbsolute(root)) {
    throw new WorkspaceError('WORKSPACE_ROOT_INVALID', `工作区根不是绝对路径: ${root}`)
  }

  const cached = knownRoots.get(root)
  if (cached !== undefined) {
    const info = await stat(cached).catch(() => undefined)
    if (info?.isDirectory() === true) return cached

    knownRoots.delete(root)
  }

  const real = await realpath(root).catch(() => undefined)
  if (real === undefined) {
    throw new WorkspaceError('WORKSPACE_ROOT_INVALID', `工作区根不存在: ${root}`)
  }

  const info = await stat(real).catch(() => undefined)
  if (info?.isDirectory() !== true) {
    throw new WorkspaceError('WORKSPACE_ROOT_INVALID', `工作区根不是目录: ${root}`)
  }

  // 文件系统根与用户主目录作为「工作区」等于没有边界，直接拒绝
  if (real === path.parse(real).root || real === process.env.HOME) {
    throw new WorkspaceError('WORKSPACE_ROOT_INVALID', `工作区根过于宽泛: ${real}`)
  }

  knownRoots.set(root, real)

  return real
}

/** 一次已校验的路径解析结果。 */
export interface ResolvedPath {
  /** realpath 后的工作区根。 */
  root: string
  /** 绝对路径。 */
  absolute: string
  /** 相对工作区根的路径，`/` 分隔；根自身为空串。 */
  relative: string
  /** 目标当前是否存在（断链或未创建时为 false）。 */
  existed: boolean
}

/**
 * 把请求里的路径解析为工作区内的绝对路径。
 *
 * 目标已存在时用 realpath 校验，防止通过符号链接跳出工作区；目标尚不存在
 * （新建文件）时校验其最近的存在祖先，父目录在界内即视为合法。
 * @param root 客户端声明的工作区根
 * @param input 相对根或绝对的路径
 * @returns 校验通过的绝对路径与相对路径
 */
export async function resolveWithin(root: string, input: string): Promise<ResolvedPath> {
  const realRoot = await resolveRoot(root)

  if (typeof input !== 'string' || input.includes('\0')) {
    throw new WorkspaceError('PATH_INVALID', '路径不合法')
  }

  const absolute = path.isAbsolute(input) ? path.normalize(input) : path.resolve(realRoot, input)

  const direct = await realpath(absolute).catch(() => undefined)
  const resolved = direct ?? (await nearestReal(absolute))

  if (!contains(realRoot, resolved)) {
    throw new WorkspaceError('PATH_OUTSIDE_WORKSPACE', `路径越出工作区: ${input}`)
  }

  return {
    root: realRoot,
    absolute: direct ?? absolute,
    relative: direct === undefined ? '' : path.relative(realRoot, direct).split(path.sep).join('/'),
    existed: direct !== undefined,
  }
}

/**
 * 找到尚不存在路径的最近存在祖先并 realpath。
 * @param absolute 绝对路径
 * @returns realpath 后的祖先路径拼回剩余段
 */
async function nearestReal(absolute: string): Promise<string> {
  const segments: string[] = []
  let current = absolute

  for (;;) {
    const real = await realpath(current).catch(() => undefined)
    if (real !== undefined) return path.join(real, ...segments.reverse())

    const parent = path.dirname(current)

    // 到达文件系统根仍不存在，说明盘符本身无效
    if (parent === current) return absolute

    segments.push(path.basename(current))
    current = parent
  }
}
