/**
 * 用户手写正则的安全编译。
 *
 * 搜索与 Git 日志过滤都允许用户输入正则，而 V8 的正则回溯**无法中断**：`^(a+)+$`
 * 这类嵌套量词遇到长行就是指数级回溯，单次 `exec` 能把线程钉住数分钟。插件路由跑在
 * 宿主进程里（与 DSH 共用事件循环），一次这样的搜索就会让整个界面卡死，表现和死循环
 * 一致。因此编译前先拦掉已知的爆炸形态，而不是等它开始跑。
 */

/** 正则源长度上限：正常检索写不到这么长，超过的多半是误粘贴。 */
const MAX_PATTERN_LENGTH = 200

/** `{n}` / `{n,}` / `{n,m}` 形式的量词。 */
const BRACE_QUANTIFIER = /^\{\d+(?:,\d*)?\}/u

/** 安全编译失败的类型，调用方据此给出可读提示。 */
export type SafeRegexFailure = 'REGEX_TOO_LONG' | 'REGEX_NESTED_QUANTIFIER' | 'REGEX_INVALID'

/** 正则被拒绝：要么写错，要么是已知的回溯爆炸形态。 */
export class SafeRegexError extends Error {
  /** 失败类型，客户端按它区分提示文案。 */
  readonly code: SafeRegexFailure

  /**
   * @param code 失败类型
   * @param message 诊断信息
   */
  constructor(code: SafeRegexFailure, message: string) {
    super(message)
    this.code = code
    this.name = 'SafeRegexError'
  }
}

/**
 * 判断正则里是否出现「含量词的分组又被量词修饰」。
 *
 * `(a+)+`、`(\w+\s?)+`、`(.*a){20}` 都是这一形态：内层可以匹配同一段文本的多种长度，
 * 外层再重复时回溯分支数呈指数增长。只把 `*`、`+`、`{n,}` 记为量词，`?` 不计——
 * 它是懒惰/可选修饰，不会单独制造回溯分支，这样 `(?:ab)+` 之类正常写法不会被误拦。
 * @param source 正则源
 * @returns 命中时返回 true
 */
function hasNestedQuantifier(source: string): boolean {
  /** 每层未闭合分组是否已含量词；下标 0 是最外层。 */
  const stack: boolean[] = []

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]

    // 转义后的字符一律按字面量看待，跳过它以及对它的判断
    if (char === '\\') {
      index += 1

      continue
    }

    // 字符类里的 * + { 都是普通字符，整段跳过
    if (char === '[') {
      for (index += 1; index < source.length && source[index] !== ']'; index += 1) {
        if (source[index] === '\\') index += 1
      }

      continue
    }

    if (char === '(') {
      // `(?:`、`(?=`、`(?<name>` 里的问号是分组修饰符，不是量词
      if (source[index + 1] === '?') index += 1

      stack.push(false)

      continue
    }

    if (char === ')') {
      const innerQuantified = stack.pop() ?? false
      const next = source[index + 1] ?? ''
      const quantified =
        next === '*' || next === '+' || next === '?' || (next === '{' && BRACE_QUANTIFIER.test(source.slice(index + 1)))

      if (innerQuantified && quantified) return true

      // 分组整体是否算「含量词」要传给父层，否则 `((a+))+` 这类嵌套会漏判
      if (stack.length > 0 && (innerQuantified || quantified)) stack[stack.length - 1] = true

      continue
    }

    if (char === '*' || char === '+') {
      if (stack.length > 0) stack[stack.length - 1] = true

      continue
    }

    if (char === '{' && BRACE_QUANTIFIER.test(source.slice(index)) && stack.length > 0) {
      stack[stack.length - 1] = true
    }
  }

  return false
}

/**
 * 拆出正则源里所有「被重复量词修饰的分组」的内部写法。
 *
 * 只关心 `*`、`+`、`{n,}` 这类重复：`?` 是可选或懒惰修饰，不会把内层分支数相乘。
 * @param source 正则源
 * @returns 分组内部写法（不含外层括号）
 */
function repeatedGroupBodies(source: string): string[] {
  /** 未闭合分组的起始下标；下标越靠后越内层。 */
  const stack: number[] = []
  const bodies: string[] = []

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]

    if (char === '\\') {
      index += 1

      continue
    }

    // 字符类里的括号是普通字符
    if (char === '[') {
      for (index += 1; index < source.length && source[index] !== ']'; index += 1) {
        if (source[index] === '\\') index += 1
      }

      continue
    }

    if (char === '(') {
      stack.push(index + 1)

      continue
    }

    if (char !== ')') continue

    const start = stack.pop()
    if (start === undefined) continue

    const next = source[index + 1] ?? ''
    const repeated = next === '*' || next === '+' || (next === '{' && BRACE_QUANTIFIER.test(source.slice(index + 1)))

    if (repeated) bodies.push(source.slice(start, index))
  }

  return bodies
}

/**
 * 判断分组内部是否存在互为前缀的顶层交替分支。
 *
 * `(a|aa)` 的两种切分能覆盖同一段文本，外层重复时分支数指数增长（`(a|aa)+$` 在
 * 40 个字符上就能跑几秒）。`(cat|dog)` 这类分支互不重叠，是安全的，不该被拦。
 * @param body 分组内部写法
 * @returns 命中时返回 true
 */
function hasOverlappingBranches(body: string): boolean {
  // 去掉 `(?:`、`(?=`、`(?<name>` 这类分组修饰符，只留真正参与匹配的内容
  const content = body.startsWith('?') ? body.replace(/^\?[<A-Za-z=!]+/u, '') : body
  const branches: string[] = []
  let current = ''
  let depth = 0
  let inClass = false

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index]

    if (char === '\\') {
      current += char + (content[index + 1] ?? '')
      index += 1

      continue
    }

    if (char === '[') inClass = true
    else if (char === ']') inClass = false
    else if (!inClass && char === '(') depth += 1
    else if (!inClass && char === ')') depth -= 1

    if (!inClass && depth === 0 && char === '|') {
      branches.push(current)
      current = ''

      continue
    }

    current += char
  }

  branches.push(current)

  if (branches.length < 2) return false

  // 任一分支是另一分支的前缀（含相等）即视为重叠
  return branches.some((left, leftIndex) =>
    branches.some(
      (right, rightIndex) =>
        leftIndex !== rightIndex && left.length > 0 && (left.startsWith(right) || right.startsWith(left)),
    ),
  )
}

/**
 * 判断正则里是否存在「交替分支重叠 + 整体重复」。
 * @param source 正则源
 * @returns 命中时返回 true
 */
function hasOverlappingAlternation(source: string): boolean {
  return repeatedGroupBodies(source).some((body) => hasOverlappingBranches(body))
}

/**
 * 编译用户正则；拒绝过长、含嵌套量词或语法非法的写法。
 * @param source 正则源
 * @param flags 正则标志
 * @returns 编译好的正则
 * @throws SafeRegexError 源过长、含嵌套量词或语法非法
 */
export function compileSafeRegex(source: string, flags: string): RegExp {
  if (source.length > MAX_PATTERN_LENGTH) {
    throw new SafeRegexError(
      'REGEX_TOO_LONG',
      `Pattern is too long: ${source.length} characters, limit is ${MAX_PATTERN_LENGTH}`,
    )
  }

  if (hasNestedQuantifier(source) || hasOverlappingAlternation(source)) {
    throw new SafeRegexError(
      'REGEX_NESTED_QUANTIFIER',
      'Repeating a group that contains alternatives or quantifiers can backtrack exponentially and hang the process',
    )
  }

  try {
    return new RegExp(source, flags)
  } catch (error) { // 语法错误属用户输入问题，转成带错误码的异常交给界面提示
    console.error('[dsh-ide] 正则语法非法:', source, error)

    throw new SafeRegexError('REGEX_INVALID', `Invalid regular expression: ${String(error)}`)
  }
}
