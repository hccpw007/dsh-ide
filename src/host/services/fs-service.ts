/**
 * 宿主侧文件服务（核心）：读取、原子写入、目录列举与工作区内的 CRUD。
 *
 * `ctx.fs` 只提供读和文本写，工作台需要的目录 CRUD 与原子写要自己实现。
 * 这里直连 `node:fs/promises`，但每一条路径都先经 `resolveWithin` 校验，
 * 确保插件不会成为绕过会话工作区边界的后门。
 *
 * 写入一律「临时文件 + rename」原子替换，并把版本号（mtime + size）作为乐观锁：
 * 客户端保存时带上打开时的版本，宿主发现已变则回 `STALE_FILE`，由用户选择覆盖或重载。
 */
import { constants } from 'node:fs'
import { access, cp, mkdir, opendir, rename, readdir, readFile, stat, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { resolveWithin, WorkspaceError } from './workspace'

/** 目录列举上限，与宿主 workspaceFiles 保持一致的量级。 */
const MAX_ENTRIES = 2000

/** 探测子目录是否非空的条目数上限；更大的目录直接跳过，避免一次列举付出数百次 open。 */
const MAX_CHILDREN_PROBE = 500

/** 目录项。 */
export interface DirEntryInfo {
  /** 文件名。 */
  name: string
  /** 条目类型。 */
  type: 'file' | 'directory' | 'other'
  /** 字节数，仅普通文件。 */
  size?: number
  /** 目录是否有子项；仅目录，探测失败或跳过探测时缺省。 */
  hasChildren?: boolean
}

/** 一次目录列举的结果。 */
export interface DirListing {
  /** 已列举目录的绝对路径。 */
  path: string
  /** 直接子项，已按目录优先 + 自然序排好。 */
  entries: DirEntryInfo[]
  /** 是否因上限截断。 */
  truncated: boolean
}

/** 文件元信息。 */
export interface FileStatInfo {
  /** 绝对路径。 */
  absolutePath: string
  /** 不透明版本令牌，写操作据此做乐观锁。 */
  version: string
  /** 字节数。 */
  bytes: number
  /** 类型。 */
  type: 'file' | 'directory' | 'other'
  /** 修改时间（毫秒）。 */
  mtimeMs: number
}

/** 版本令牌：mtime + size 足以发现外部改动，且无需读文件内容。 */
function versionOf(info: { mtimeMs: number; size: number }): string {
  return `${Math.round(info.mtimeMs)}:${info.size}`
}

/**
 * 把 Node 的目录项统计收窄成本插件自己的类型。
 * @param entry dirent
 * @returns 条目信息
 */
function toEntryInfo(entry: { name: string; isFile(): boolean; isDirectory(): boolean; isSymbolicLink(): boolean }): DirEntryInfo {
  const type = entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other'

  return { name: entry.name, type }
}

/**
 * 目录优先、自然序、忽略大小写排序。
 * @param left 前一项
 * @param right 后一项
 * @returns 排序比较结果
 */
function compareEntries(left: DirEntryInfo, right: DirEntryInfo): number {
  const leftDirectory = left.type === 'directory'
  const rightDirectory = right.type === 'directory'

  if (leftDirectory !== rightDirectory) return leftDirectory ? -1 : 1

  return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' })
}

/**
 * 探测目录里是否有子项。
 *
 * 只读一个条目就关掉句柄，避免为了「有没有内容」把整个目录读一遍；项目树靠在
 * 这里得到的结论决定目录行要不要画展开箭头。
 * @param absolutePath 目录绝对路径
 * @returns 有子项为 true、空目录为 false；读取失败返回 undefined
 */
async function directoryHasChildren(absolutePath: string): Promise<boolean | undefined> {
  try {
    const handle = await opendir(absolutePath)

    try {
      const first = await handle.read()

      return first !== null
    } finally {
      await handle.close()
    }
  } catch (error) {
    console.error('[fs-service] 探测目录是否为空失败:', error)

    return undefined
  }
}

/**
 * 列出一个目录的直接子项。
 * @param root 工作区根
 * @param input 目标目录
 * @returns 子项列表
 */
export async function listDirectory(root: string, input: string): Promise<DirListing> {
  const resolved = await resolveWithin(root, input)
  const dirents = await readdir(resolved.absolute, { withFileTypes: true })
  const sliced = dirents.slice(0, MAX_ENTRIES)
  const entries: DirEntryInfo[] = []
  /** 大目录里省掉逐目录探测：几百次 open 会把一次列举拖成明显的等待。 */
  const probeChildren = sliced.length <= MAX_CHILDREN_PROBE

  for (const dirent of sliced) {
    const info = toEntryInfo(dirent)

    if (info.type === 'file') {
      // size 只在能廉价取到时补上，避免为一屏目录付 N 次 stat
      const fileStat = await stat(path.join(resolved.absolute, dirent.name)).catch(() => undefined)
      if (fileStat !== undefined) info.size = fileStat.size
    } else if (info.type === 'directory' && probeChildren) {
      const hasChildren = await directoryHasChildren(path.join(resolved.absolute, dirent.name))
      if (hasChildren !== undefined) info.hasChildren = hasChildren
    }

    entries.push(info)
  }

  entries.sort(compareEntries)

  return { path: resolved.absolute, entries, truncated: dirents.length > sliced.length }
}

/**
 * 读取文件元信息。
 * @param root 工作区根
 * @param input 目标路径
 * @returns 元信息；目标不存在时返回 undefined
 */
export async function statFile(root: string, input: string): Promise<FileStatInfo | undefined> {
  const resolved = await resolveWithin(root, input)
  const info = await stat(resolved.absolute).catch(() => undefined)

  if (info === undefined) return undefined

  return {
    absolutePath: resolved.absolute,
    version: versionOf(info),
    bytes: info.size,
    type: info.isDirectory() ? 'directory' : info.isFile() ? 'file' : 'other',
    mtimeMs: info.mtimeMs,
  }
}

/**
 * 读取整份文本文件。
 * @param root 工作区根
 * @param input 目标路径
 * @returns 文本内容与写入所需的版本令牌
 */
export async function readTextFile(
  root: string,
  input: string,
): Promise<{ text: string; version: string; absolutePath: string; bytes: number }> {
  const resolved = await resolveWithin(root, input)
  const info = await stat(resolved.absolute)

  const text = await readFile(resolved.absolute, 'utf8')

  return {
    text,
    version: versionOf(info),
    absolutePath: resolved.absolute,
    bytes: info.size,
  }
}

/**
 * 写入文本文件。
 *
 * 先写同目录临时文件再 rename，保证读者看到的要么是旧内容要么是新内容。
 * @param root 工作区根
 * @param input 目标路径
 * @param text 新内容
 * @param expectedVersion 客户端打开时的版本；空串表示不校验
 * @returns 写入后的版本与路径
 */
export async function writeTextFile(
  root: string,
  input: string,
  text: string,
  expectedVersion: string,
): Promise<{ version: string; absolutePath: string; created: boolean }> {
  const resolved = await resolveWithin(root, input)
  const current = await stat(resolved.absolute).catch(() => undefined)

  if (expectedVersion !== '') {
    if (current === undefined) {
      throw new WorkspaceError('PATH_INVALID', `Target no longer exists: ${resolved.absolute}`)
    }

    if (versionOf(current) !== expectedVersion) {
      throw new StaleFileError(versionOf(current))
    }
  }

  await mkdir(path.dirname(resolved.absolute), { recursive: true })

  const temporary = `${resolved.absolute}.dsh-ide-${process.pid}-${Date.now()}.tmp`

  try {
    await writeFile(temporary, text, 'utf8')
    await rename(temporary, resolved.absolute)
  } catch (error) { // 写临时文件或替换失败都要清掉残留，否则会在项目里留下垃圾
    await rm(temporary, { force: true }).catch((cleanupError: unknown) => {
      console.error('[dsh-ide] 清理临时文件失败:', temporary, cleanupError)
    })

    throw error
  }

  const after = await stat(resolved.absolute)

  return {
    version: versionOf(after),
    absolutePath: resolved.absolute,
    created: current === undefined,
  }
}

/** 保存时发现磁盘内容已被外部改动。 */
export class StaleFileError extends Error {
  /**
   * @param currentVersion 磁盘上的当前版本
   */
  constructor(readonly currentVersion: string) {
    super('File has been modified externally')
    this.name = 'StaleFileError'
  }
}

/**
 * 新建文件或目录。
 * @param root 工作区根
 * @param input 目标路径
 * @param kind 新建类型
 * @param text 新建文件时的初始内容
 * @returns 新建目标的绝对路径
 */
export async function createEntry(
  root: string,
  input: string,
  kind: 'file' | 'directory',
  text: string,
): Promise<{ absolutePath: string }> {
  const resolved = await resolveWithin(root, input)

  await mkdir(path.dirname(resolved.absolute), { recursive: true })

  if (kind === 'directory') {
    // recursive: false 让「已存在」变成明确错误，而不是静默成功
    await mkdir(resolved.absolute)
  } else {
    // wx 让并发创建落到明确的 EEXIST，避免互相覆盖
    await writeFile(resolved.absolute, text, { encoding: 'utf8', flag: 'wx' })
  }

  return { absolutePath: resolved.absolute }
}

/**
 * 重命名或移动条目。
 * @param root 工作区根
 * @param from 源路径
 * @param to 目标路径
 */
export async function renameEntry(root: string, from: string, to: string): Promise<void> {
  const source = await resolveWithin(root, from)
  const target = await resolveWithin(root, to)

  await access(source.absolute, constants.F_OK)
  await mkdir(path.dirname(target.absolute), { recursive: true })
  await rename(source.absolute, target.absolute)
}

/**
 * 判断绝对路径是否已存在。
 *
 * 只有 ENOENT 被当作「不存在」：权限、IO 等错误必须向上抛，
 * 否则会把「读不到」误当成「可以写入」。
 * @param absolute 绝对路径
 * @returns 存在时返回 true
 */
async function pathExists(absolute: string): Promise<boolean> {
  try {
    await stat(absolute)

    return true
  } catch (error) { // 探测存在性：仅 ENOENT 视为不存在，其余继续上抛
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false

    throw error
  }
}

/**
 * 计算复制目标名。
 *
 * 目标已存在时按 IDEA 的粘贴行为生成副本：文件保留扩展名加 `_copy`，
 * 目录整体加后缀，序号从 `_copy2` 递增。同目录复制粘贴因此得到副本而不是冲突。
 * @param sourceAbsolute 源绝对路径，用于区分文件与目录
 * @param targetAbsolute 期望的目标绝对路径
 * @returns 可用的目标绝对路径
 */
async function unusedCopyPath(sourceAbsolute: string, targetAbsolute: string): Promise<string> {
  if (!(await pathExists(targetAbsolute))) return targetAbsolute

  const extension = (await stat(sourceAbsolute)).isDirectory() ? '' : path.extname(targetAbsolute)
  const base = path.basename(targetAbsolute, extension)
  const parent = path.dirname(targetAbsolute)

  let candidate = targetAbsolute
  let index = 1

  while (await pathExists(candidate)) {
    const suffix = index === 1 ? '_copy' : `_copy${index}`
    candidate = path.join(parent, `${base}${suffix}${extension}`)
    index += 1
  }

  return candidate
}

/**
 * 复制条目（文件或整个目录）。
 * @param root 工作区根
 * @param from 源路径
 * @param to 目标路径
 */
export async function copyEntry(root: string, from: string, to: string): Promise<void> {
  const source = await resolveWithin(root, from)
  const target = await resolveWithin(root, to)

  await mkdir(path.dirname(target.absolute), { recursive: true })

  const destination = await unusedCopyPath(source.absolute, target.absolute)
  // errorOnExist + force:false 仍然兜底并发：探测后被别的进程抢占时报错而不是覆盖
  await cp(source.absolute, destination, { recursive: true, errorOnExist: true, force: false })
}

/**
 * 物理删除条目（文件或整个目录）。
 *
 * 删除不可恢复，客户端必须先向用户确认再调用。删工作区根等于清空项目，这里挡住。
 * @param root 工作区根
 * @param input 目标路径
 * @returns 被删除条目的绝对路径
 */
export async function deleteEntry(root: string, input: string): Promise<{ absolutePath: string }> {
  const resolved = await resolveWithin(root, input)

  // 工作区根必须挡住，否则一次误点就清空整个项目
  if (resolved.absolute === resolved.root) {
    throw new WorkspaceError('PATH_INVALID', 'The workspace root cannot be deleted')
  }

  // 不带 force：目标不存在时报错，避免把「路径写错」当成删除成功
  await rm(resolved.absolute, { recursive: true })

  return { absolutePath: resolved.absolute }
}
