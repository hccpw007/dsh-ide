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

import { compileSafeRegex } from '../../common/safe-regex'
import { resolveWithin } from './workspace'

/** 单次递归遍历的文件上限，超出即停并标记截断。 */
const MAX_WALK_FILES = 20000

/**
 * 单次递归遍历的目录上限。
 *
 * 只限文件数不足以收住工作量：依赖与构建目录（`Pods`、`.venv`、`target`）往往文件不多但
 * 目录极深，遍历会长时间占满 CPU。超限按截断处理，与文件数上限同一语义。
 */
const MAX_WALK_DIRECTORIES = 5000

/** 搜索时单文件读取上限；超过的文件按二进制/超大跳过。 */
const MAX_SEARCH_FILE_BYTES = 1024 * 1024

/** 搜索单次返回的匹配上限。 */
const MAX_SEARCH_MATCHES = 2000

/** 搜索时的并发读文件数：兼顾吞吐与文件句柄上限。 */
const SEARCH_CONCURRENCY = 32

/**
 * 单条排除 glob 的长度上限。
 *
 * 排除项直接编译成正则并对每个目录、每个文件各执行一次；超长写法（多半是误粘贴）
 * 会让编译与匹配成本成倍上涨，因此只接受正常手写的长度。
 */
const MAX_EXCLUDE_LENGTH = 200

/** 排除项数量上限：搜索框里手写的排除项通常只有几项。 */
const MAX_EXCLUDE_ITEMS = 32

/**
 * 正则搜索时的单行匹配长度上限。
 *
 * 用户正则的回溯开销随输入长度快速增长（`(a|aa)+` 一类在几十字符上就能到秒级），
 * 而压缩后的单行文件动辄几十万字符。只取行首一段参与匹配，把最坏输入长度收口到可控范围；
 * 字面量搜索不受此限制，因为它不会回溯。
 */
const MAX_REGEX_LINE_LENGTH = 4096

/**
 * 遍历时始终跳过的目录名：既无搜索价值，又往往是海量文件。
 *
 * 除版本库与前端产物外，这里也覆盖各语言的依赖/构建缓存目录——它们动辄上万个小文件，
 * 且内容从不属于用户要搜的代码。`vendor`、`out` 这类可能与源码同名的目录不列入。
 */
const SKIP_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  '.svn',
  '.hg',
  'dist',
  '.build',
  '.next',
  '.cache',
  'Pods',
  'target',
  '.venv',
  'venv',
  '__pycache__',
  '.gradle',
  '.terraform',
  'coverage',
])

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
 *
 * 超长项与超量项直接丢弃并记日志：编译成正则后它们会对每个条目各执行一次，
 * 属于用户误粘贴就会持续拖慢每次搜索的输入，不能带进匹配循环。
 * @param exclude 用户输入
 * @returns 编译后的排除项
 */
function compileExcludes(exclude: string): CompiledExclude[] {
  const items = exclude
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '')

  if (items.length > MAX_EXCLUDE_ITEMS) {
    console.error(
      '[dsh-ide] 排除项过多，只取前若干项:',
      items.length,
      `(limit ${String(MAX_EXCLUDE_ITEMS)})`,
    )
  }

  return items
    .slice(0, MAX_EXCLUDE_ITEMS)
    .filter((source) => {
      if (source.length <= MAX_EXCLUDE_LENGTH) return true

      console.error('[dsh-ide] 排除项过长，已忽略:', source.slice(0, 80), `(${String(source.length)} chars)`)

      return false
    })
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
  /** 已遍历的目录数；`pending` 只受文件数上限约束，目录数需要单独收口。 */
  let visited = 0

  while (pending.length > 0) {
    const relative = pending.pop() ?? ''
    const absolute = relative === '' ? root : path.join(root, relative)

    visited += 1

    if (visited > MAX_WALK_DIRECTORIES) return { files, truncated: true }

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
 *
 * 用户正则会逐行执行且无法中断，因此统一过一遍安全编译：超长与嵌套量词都在这里被拒，
 * 而不是等指数级回溯把宿主事件循环钉住。
 * @param request 搜索参数
 * @returns 逐行匹配用的正则
 * @throws SafeRegexError 正则过长、含嵌套量词或语法非法
 */
function compileQuery(request: SearchRequest): RegExp {
  const escaped = request.regex ? request.query : request.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const worded = request.wholeWord ? `\\b(?:${escaped})\\b` : escaped

  return compileSafeRegex(worded, request.caseSensitive ? 'g' : 'gi')
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
   * @param limit 本文件最多返回的命中数，避免单个高频命中文件撑爆内存
   * @returns 该文件的命中
   */
  const searchFile = async (absolute: string, limit: number): Promise<SearchMatch[]> => {
    const found: SearchMatch[] = []
    if (limit <= 0) return found

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
      // 正则逐行执行无法中断，超长行只取行首一段，避免回溯成本随行长度失控
      const haystack =
        request.regex && line.length > MAX_REGEX_LINE_LENGTH ? line.slice(0, MAX_REGEX_LINE_LENGTH) : line
      pattern.lastIndex = 0

      const hit = pattern.exec(haystack)
      if (hit === null) continue

      found.push({
        path: relative,
        absolutePath: absolute,
        line: index + 1,
        column: hit.index + 1,
        text: line.trim().slice(0, 400),
      })

      if (found.length >= limit) break
    }

    return found
  }

  while (cursor < files.length) {
    const remaining = MAX_SEARCH_MATCHES - matches.length

    if (remaining <= 0) {
      truncated = true

      break
    }

    const batch = files.slice(cursor, cursor + SEARCH_CONCURRENCY)
    cursor += batch.length

    const results = await Promise.all(batch.map((file) => searchFile(file, remaining)))

    for (const found of results) {
      // 逐条追加而不是展开参数：单文件命中可达数十万条，展开会击穿调用栈
      for (const match of found) {
        if (matches.length >= MAX_SEARCH_MATCHES) break

        matches.push(match)
      }

      if (matches.length >= MAX_SEARCH_MATCHES) {
        truncated = true

        return { matches, truncated, filesScanned: files.length }
      }
    }
  }

  return { matches, truncated, filesScanned: files.length }
}

