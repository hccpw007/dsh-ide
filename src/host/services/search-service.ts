/**
 * 宿主侧搜索服务。
 *
 * 一次搜索同时覆盖文件名与文件内容：文件名直接在递归遍历的结果上比对，不需要读文件；
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

/**
 * 单次返回的文件名命中上限。
 *
 * 文件名命中按整个文件计，界面里一行一个文件；查询过短（如 `a`）时可能命中近万个文件，
 * 全部回传既撑大响应也淹没内容命中，因此单独收口。
 */
const MAX_FILE_MATCHES = 200

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
 * 而压缩后的单行文件动辄几十万字符。只取行首一段参与匹配，把最坏输入长度收口到
 * 可控范围；字面量搜索不受此限制，因为它不会回溯。
 */
const MAX_REGEX_LINE_LENGTH = 1024

/**
 * 正则搜索的时间预算（毫秒）。
 *
 * 安全编译只能拦住已知的爆炸形态，用户仍可能写出判定器覆盖不到的指数写法；而且
 * 常规正则在两万行上逐行执行也要几百毫秒。宿主与 DSH 全部会话共用事件循环，
 * 因此执行侧必须有硬预算：累计超过即停止本轮，把已找到的结果连同截断标记返回。
 */
const REGEX_TIME_BUDGET_MS = 200

/**
 * 单次搜索的总时间预算（毫秒）。
 *
 * 字面量搜索不做回溯，但冷缓存下读两万个文件仍可能远超一次交互的耐心上限；
 * 到点后返回已有结果并标记截断，好过让请求一直挂着。
 */
const TOTAL_TIME_BUDGET_MS = 15_000

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

/** 文件名命中：整个文件命中查询，与内容命中分开返回。 */
export interface SearchFileHit {
  /** 相对工作区根的路径。 */
  path: string
  /** 文件名（不含目录）。 */
  name: string
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

/**
 * 排除规则的编译结果。
 *
 * 早期实现为每条 glob 各建一个正则，遍历时对每个条目、每条规则各跑两次 test：
 * 两万个文件配三十条规则就是一百二十万次正则执行，纯粹是白烧 CPU。这里合并成
 * 两条正则（完整相对路径、文件名各一条），每个条目固定两次执行。
 */
interface CompiledExcludes {
  /** 原始写法，用于诊断日志。 */
  sources: string[]
  /**
   * 判断相对路径是否命中任一排除规则。
   * @param relative 相对工作区根的路径
   * @returns 命中时返回 true
   */
  test(relative: string): boolean
}

/**
 * 把极简 glob（`*`、`?`、`**`）编译成正则源片段。
 *
 * 只支持搜索框里真正会用到的三种通配，不引入第三方 glob 库。
 * @param pattern glob 写法
 * @returns 正则源片段
 */
function globSource(pattern: string): string {
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

    source += (char ?? '').replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }

  return source
}

/**
 * 把一组 glob 合并成一条锚定正则；空集合返回 null。
 * @param patterns glob 写法列表
 * @returns 正则；没有可用写法时为 null
 */
function combineGlobs(patterns: string[]): RegExp | null {
  if (patterns.length === 0) return null

  const body = patterns
    .map((pattern) => globSource(pattern))
    .filter((source) => source !== '')
    .map((source) => `(?:${source})`)
    .join('|')

  if (body === '') return null

  try {
    return new RegExp(`^(?:${body})$`)
  } catch (error) { // 已转义，理论上不会发生；仍要给出可诊断日志
    console.error('[dsh-ide] 编译排除规则失败:', error)

    return null
  }
}

/**
 * 解析逗号分隔的排除 glob。
 *
 * 超长项与超量项直接丢弃并记日志：它们会被编译进匹配正则，属于用户误粘贴就会
 * 持续拖慢每次搜索的输入，不能带进匹配循环。
 * @param exclude 用户输入
 * @returns 合并后的排除规则
 */
function compileExcludes(exclude: string): CompiledExcludes {
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

  const sources = items.slice(0, MAX_EXCLUDE_ITEMS).filter((source) => {
    if (source.length <= MAX_EXCLUDE_LENGTH) return true

    console.error('[dsh-ide] 排除项过长，已忽略:', source.slice(0, 80), `(${String(source.length)} chars)`)

    return false
  })

  const pathPattern = combineGlobs(sources)
  const namePattern = combineGlobs(sources)

  return {
    sources,
    test: (relative) => {
      if (pathPattern?.test(relative) === true) return true

      // 用户写的 `*.lock` 命中任意层级的文件名，因此文件名也要参与匹配
      const name = relative.slice(relative.lastIndexOf('/') + 1)

      return namePattern?.test(name) === true
    },
  }
}

/**
 * 判断相对路径是否命中排除规则。
 * @param relative 相对路径
 * @param excludes 排除规则
 * @returns 命中时返回 true
 */
function isExcluded(relative: string, excludes: CompiledExcludes): boolean {
  return excludes.test(relative)
}

/**
 * 递归遍历工作区里的全部文件。
 * @param root 工作区根
 * @param excludes 排除规则
 * @param signal 取消信号；客户端断开或发起新搜索时停止遍历
 * @returns 相对工作区根的文件路径列表与截断标记
 */
export async function walkFiles(
  root: string,
  excludes: CompiledExcludes,
  signal?: AbortSignal,
): Promise<{ files: string[]; truncated: boolean }> {
  const files: string[] = []
  const pending = ['']
  /** 已遍历的目录数；`pending` 只受文件数上限约束，目录数需要单独收口。 */
  let visited = 0

  while (pending.length > 0) {
    // 每处理一个目录检查一次取消：目录粒度足够细，也不会给循环引入明显开销
    if (signal?.aborted === true) return { files, truncated: true }

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

      files.push(child)

      if (files.length >= MAX_WALK_FILES) return { files, truncated: true }
    }
  }

  return { files, truncated: false }
}

/**
 * 把查询串转成正则源：字面量搜索先整体转义，正则搜索原样使用。
 * @param request 搜索参数
 * @returns 可直接交给 compileSafeRegex 的正则源
 */
function querySource(request: SearchRequest): string {
  return request.regex ? request.query : request.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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
  const escaped = querySource(request)
  const worded = request.wholeWord ? `\\b(?:${escaped})\\b` : escaped

  return compileSafeRegex(worded, request.caseSensitive ? 'g' : 'gi')
}

/**
 * 编译文件名匹配用的正则。
 *
 * 文件名不是词序列：整词边界会让查询 `Search` 匹配不到 `SearchPanel.tsx`，与「按文件名
 * 找文件」的用途相悖，因此这里忽略 wholeWord；不加 `g` 标志，逐文件 `test` 时无需复位状态。
 * @param request 搜索参数
 * @returns 匹配单个文件名的正则
 * @throws SafeRegexError 正则过长、含嵌套量词或语法非法
 */
function compileFileNameQuery(request: SearchRequest): RegExp {
  return compileSafeRegex(querySource(request), request.caseSensitive ? '' : 'i')
}

/**
 * 在工作区内搜索文本与文件名。
 *
 * 文件读取按批并发：串行读 2000 个文件在冷缓存下要十几秒，而并发度压在 32
 * 时既能把磁盘与 CPU 吃满，又不会因为同时打开太多句柄触发 EMFILE。
 *
 * 两类时间预算在循环里逐段检查：正则匹配累计超过 200ms、整次搜索超过 15s 都
 * 立刻停止并置 `truncated`。宿主与全部 DSH 会话共用事件循环，宁可少给几条结果，
 * 也不能让一次搜索把界面钉住。
 * @param request 搜索参数
 * @param signal 取消信号；客户端断开或发起新搜索时停止
 * @returns 文件名命中、内容命中（按文件聚合前的扁平列表）、截断标记与扫描文件数
 */
export async function searchWorkspace(
  request: SearchRequest,
  signal?: AbortSignal,
): Promise<{
  files: SearchFileHit[]
  filesTruncated: boolean
  matches: SearchMatch[]
  truncated: boolean
  filesScanned: number
}> {
  const startedAt = Date.now()
  const hardDeadline = startedAt + TOTAL_TIME_BUDGET_MS
  const resolved = await resolveWithin(request.root, '.')
  const excludes = compileExcludes(request.exclude)
  const pattern = compileQuery(request)
  const namePattern = compileFileNameQuery(request)
  const { files, truncated: walkedOut } = await walkFiles(resolved.absolute, excludes, signal)
  const fileHits: SearchFileHit[] = []
  const matches: SearchMatch[] = []
  let truncated = walkedOut
  let filesTruncated = false
  let cursor = 0
  /** 正则执行的累计耗时（毫秒）；只统计匹配时间，不把文件 I/O 算进预算。 */
  let regexSpentMs = 0

  /** 正则预算是否已用尽。 */
  const regexBudgetExhausted = (): boolean => request.regex && regexSpentMs >= REGEX_TIME_BUDGET_MS

  // 文件名匹配：遍历结果已是相对路径，逐个比对文件名即可，无需再读文件
  for (let index = 0; index < files.length; index += 1) {
    // 文件名正则同样逐条执行，大仓库上也要让出取消与预算检查点
    if (index % 512 === 0 && (signal?.aborted === true || Date.now() > hardDeadline || regexBudgetExhausted())) {
      truncated = true

      break
    }

    const relative = files[index] ?? ''
    const name = relative.slice(relative.lastIndexOf('/') + 1)

    if (!namePattern.test(name)) continue

    fileHits.push({ path: relative, name })

    if (fileHits.length >= MAX_FILE_MATCHES) {
      filesTruncated = true

      break
    }
  }

  /**
   * 搜索一个文件的全部行。
   * @param relative 相对工作区根的路径
   * @param limit 本文件最多返回的命中数，避免单个高频命中文件撑爆内存
   * @returns 该文件的命中
   */
  const searchFile = async (relative: string, limit: number): Promise<SearchMatch[]> => {
    const found: SearchMatch[] = []
    if (limit <= 0 || signal?.aborted === true) return found

    const absolute = path.join(resolved.absolute, relative)
    const info = await stat(absolute).catch((error: unknown) => {
      // 权限不足与文件消失都会让搜索跳过该文件；留一条日志才能区分「没搜到」与「没权限」
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('[dsh-ide] 搜索无法读取文件信息:', absolute, error)
      }

      return undefined
    })
    if (info === undefined || info.size > MAX_SEARCH_FILE_BYTES) return found

    // 先按 Buffer 读再判大小：stat 与 readFile 之间文件可能已被写大（正在写入的日志）
    const data = await readFile(absolute).catch((error: unknown) => {
      // 二进制或编码异常的文件按设计跳过，不是故障
      console.error('[dsh-ide] 搜索跳过不可读文件:', absolute, error)

      return undefined
    })

    if (data === undefined || data.byteLength > MAX_SEARCH_FILE_BYTES) return found

    const text = data.toString('utf8')
    if (text.includes('\0')) return found

    const lines = text.split('\n')
    const matchStartedAt = Date.now()

    for (let index = 0; index < lines.length; index += 1) {
      // 累计预算与单文件预算都要看：一行也可能因为写法刁钻而明显超时
      if (regexBudgetExhausted() || (request.regex && Date.now() - matchStartedAt > REGEX_TIME_BUDGET_MS)) {
        truncated = true

        break
      }

      const line = lines[index] ?? ''
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

    if (request.regex) regexSpentMs += Date.now() - matchStartedAt

    return found
  }

  while (cursor < files.length) {
    const remaining = MAX_SEARCH_MATCHES - matches.length

    if (remaining <= 0) {
      truncated = true

      break
    }

    // 取消、总预算、正则预算任一触发都立刻收工，返回已找到的部分
    if (signal?.aborted === true || Date.now() > hardDeadline || regexBudgetExhausted()) {
      truncated = true

      break
    }

    const batch = files.slice(cursor, cursor + SEARCH_CONCURRENCY)
    cursor += batch.length

    const results = await Promise.all(batch.map((relative) => searchFile(relative, remaining)))

    for (const found of results) {
      // 逐条追加而不是展开参数：单文件命中可达数十万条，展开会击穿调用栈
      for (const match of found) {
        if (matches.length >= MAX_SEARCH_MATCHES) break

        matches.push(match)
      }

      if (matches.length >= MAX_SEARCH_MATCHES) {
        truncated = true

        return { files: fileHits, filesTruncated, matches, truncated, filesScanned: files.length }
      }
    }
  }

  return { files: fileHits, filesTruncated, matches, truncated, filesScanned: files.length }
}

