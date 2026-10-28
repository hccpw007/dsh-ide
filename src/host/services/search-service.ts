/**
 * 宿主侧搜索服务。
 *
 * 内容搜索要把工作区递归读一遍，宿主没有对应接口，只能自己实现。这里用极简 glob
 * 做排除（只支持 `*` `?` `**`，不引入第三方 glob 库），文件读取按批并发：
 * 串行读两千个文件在冷缓存下要十几秒，并发度压在 32 既吃满磁盘又不会撑爆句柄。
 *
 * 大文件（> 1 MiB）与二进制按设计跳过，不是故障。
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'

import { resolveWithin } from './workspace'

/** 单次递归遍历的文件上限，超出即停并标记截断。 */
const MAX_WALK_FILES = 20000

/** 搜索时单文件读取上限；超过的文件按二进制/超大跳过。 */
const MAX_SEARCH_FILE_BYTES = 1024 * 1024

/** 搜索单次返回的匹配上限。 */
const MAX_SEARCH_MATCHES = 2000

/** 搜索时的并发读文件数：兼顾吞吐与文件句柄上限。 */
const SEARCH_CONCURRENCY = 32

/** 遍历时始终跳过的目录名：既无搜索价值，又往往是海量文件。 */
const SKIP_DIRECTORIES = new Set(['.git', 'node_modules', '.svn', '.hg', 'dist', '.build', '.next', '.cache'])

/** 搜索匹配。 */
export interface SearchMatch {
  /** 相对工作区根的路径。 */
  path: string
  /** 绝对路径。 */
  absolutePath: string
  /** 行号，从 1 开始。 */
  line: number
  /** 列号，从 1 开始。 */
  column: number
  /** 该行文本，已裁掉首尾空白。 */
  text: string
}

/** 搜索参数。 */
export interface SearchRequest {
  /** 工作区根。 */
  root: string
  /** 查询串。 */
  query: string
  /** 是否按正则匹配。 */
  regex: boolean
  /** 是否区分大小写。 */
  caseSensitive: boolean
  /** 是否全词匹配。 */
  wholeWord: boolean
  /** 逗号分隔的排除 glob；空串表示不排除。 */
  exclude: string
}

/** glob 排除项的编译结果。 */
interface CompiledExclude {
  /** 原始写法，用于错误提示。 */
  source: string
  /** 匹配函数。 */
  test(name: string): boolean
}

/**
 * 把极简 glob（`*`、`?`、`**`）编译成正则。
 *
 * 只支持搜索框里真正会用到的三种通配，不引入第三方 glob 库。
 * @param pattern glob 写法
 * @returns 匹配函数
 */
function compileGlob(pattern: string): (name: string) => boolean {
  let source = ''

  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]

    if (char === '*') {
      // `**` 跨目录，单个 `*` 不跨目录分隔符
      if (pattern[index + 1] === '*') {
        source += '.*'
        index += 1
      } else {
        source += '[^/]*'
      }

      continue
    }

    if (char === '?') {
      source += '[^/]'

      continue
    }

    source += char.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }

  let regex: RegExp

  try {
    regex = new RegExp(`^${source}$`)
  } catch (error) { // 理论上不会发生（已转义），仍要给出可诊断日志
    console.error('[dsh-ide] 编译排除规则失败:', pattern, error)
    regex = /^$/u
  }

  return (name: string) => regex.test(name)
}

/**
 * 解析逗号分隔的排除 glob。
 * @param exclude 用户输入
 * @returns 编译后的排除项
 */
function compileExcludes(exclude: string): CompiledExclude[] {
  return exclude
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '')
    .map((source) => ({ source, test: compileGlob(source) }))
}

/**
 * 判断相对路径是否命中任一排除规则。
 *
 * 用户写的 `*.lock` 命中任意层级的文件名，`dist/**` 命中目录下全部内容，
 * 因此文件名与完整相对路径都参与匹配。
 * @param relative 相对路径
 * @param excludes 排除项
 * @returns 命中任一规则时返回 true
 */
function isExcluded(relative: string, excludes: CompiledExclude[]): boolean {
  const name = relative.slice(relative.lastIndexOf('/') + 1)

  return excludes.some((exclude) => exclude.test(relative) || exclude.test(name))
}

/**
 * 递归遍历工作区里的全部文件。
 * @param root 工作区根
 * @param excludes 排除项
 * @returns 文件绝对路径列表与截断标记
 */
export async function walkFiles(
  root: string,
  excludes: CompiledExclude[],
): Promise<{ files: string[]; truncated: boolean }> {
  const files: string[] = []
  const pending = ['']

  while (pending.length > 0) {
    const relative = pending.pop() ?? ''
    const absolute = relative === '' ? root : path.join(root, relative)
    const dirents = await readdir(absolute, { withFileTypes: true }).catch((error: unknown) => {
      // 无权限的子目录不应让整次搜索失败，记录后跳过
      console.error('[dsh-ide] 读取目录失败，已跳过:', absolute, error)

      return []
    })

    for (const dirent of dirents) {
      const child = relative === '' ? dirent.name : `${relative}/${dirent.name}`

      if (dirent.isDirectory()) {
        if (SKIP_DIRECTORIES.has(dirent.name) || isExcluded(child, excludes)) continue

        pending.push(child)

        continue
      }

      if (!dirent.isFile() || isExcluded(child, excludes)) continue

      files.push(path.join(root, child))

      if (files.length >= MAX_WALK_FILES) return { files, truncated: true }
    }
  }

  return { files, truncated: false }
}

/**
 * 编译用户查询。
 * @param request 搜索参数
 * @returns 逐行匹配用的正则
 */
function compileQuery(request: SearchRequest): RegExp {
  const escaped = request.regex ? request.query : request.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const worded = request.wholeWord ? `\\b(?:${escaped})\\b` : escaped

  return new RegExp(worded, request.caseSensitive ? 'g' : 'gi')
}

/**
 * 在工作区内搜索文本。
 *
 * 文件读取按批并发：串行读 2000 个文件在冷缓存下要十几秒，而并发度压在 32
 * 时既能把磁盘与 CPU 吃满，又不会因为同时打开太多句柄触发 EMFILE。
 * @param request 搜索参数
 * @returns 按文件聚合前的扁平匹配列表与截断标记
 */
export async function searchWorkspace(
  request: SearchRequest,
): Promise<{ matches: SearchMatch[]; truncated: boolean; filesScanned: number }> {
  const resolved = await resolveWithin(request.root, '.')
  const excludes = compileExcludes(request.exclude)
  const pattern = compileQuery(request)
  const { files, truncated: walkedOut } = await walkFiles(resolved.absolute, excludes)
  const matches: SearchMatch[] = []
  let truncated = walkedOut
  let cursor = 0

  /**
   * 搜索一个文件的全部行。
   * @param absolute 文件绝对路径
   * @returns 该文件的命中
   */
  const searchFile = async (absolute: string): Promise<SearchMatch[]> => {
    const found: SearchMatch[] = []
    const info = await stat(absolute).catch(() => undefined)
    if (info === undefined || info.size > MAX_SEARCH_FILE_BYTES) return found

    const text = await readFile(absolute, 'utf8').catch((error: unknown) => {
      // 二进制或编码异常的文件按设计跳过，不是故障
      console.error('[dsh-ide] 搜索跳过不可读文件:', absolute, error)

      return undefined
    })

    if (text === undefined || text.includes('\0')) return found

    const lines = text.split('\n')
    const relative = path.relative(resolved.absolute, absolute).split(path.sep).join('/')

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      pattern.lastIndex = 0

      const hit = pattern.exec(line)
      if (hit === null) continue

      found.push({
        path: relative,
        absolutePath: absolute,
        line: index + 1,
        column: hit.index + 1,
        text: line.trim().slice(0, 400),
      })
    }

    return found
  }

  while (cursor < files.length) {
    const batch = files.slice(cursor, cursor + SEARCH_CONCURRENCY)
    cursor += batch.length

    const results = await Promise.all(batch.map((file) => searchFile(file)))

    for (const found of results) {
      matches.push(...found)

      if (matches.length >= MAX_SEARCH_MATCHES) {
        truncated = true

        return { matches: matches.slice(0, MAX_SEARCH_MATCHES), truncated, filesScanned: files.length }
      }
    }
  }

  return { matches, truncated, filesScanned: files.length }
}

