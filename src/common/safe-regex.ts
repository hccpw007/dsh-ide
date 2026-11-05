/**
 * 用户手写正则的安全编译。
 *
 * 搜索与 Git 日志过滤都允许用户输入正则，而 V8 的正则回溯**无法中断**：`^(a+)+$`
 * 这类嵌套量词遇到长行就是指数级回溯，单次 `exec` 能把线程钉住数分钟。插件路由跑在
 * 宿主进程里（与 DSH 共用事件循环），一次这样的搜索就会让整个界面卡死，表现和死循环
 * 一致。因此编译前先拦掉已知的爆炸形态，而不是等它开始跑。
 *
 * 早期实现用「扫描字符串 + 前缀比较」两条独立规则判定，既有绕过（等价字符类、
 * 非捕获分组、多层分组）又有误拦（把 `?` 当重复量词）。每补一类写法就会被另一种
 * 等价变换绕过，说明缺的是一套自洽的判定模型而不是个别规则。
 *
 * 现在的做法：先把正则解析成结构树（分组 / 交替 / 重复 / 字符集），再按两条与结构
 * 绑定的规则判定——
 *
 * 1. **嵌套重复**：外层重复次数大于 1，且内部含无上界重复时拒绝。`(a+)+`、`(\w+\s?)+`
 *    都属于这一形态；`(\d+)?` 外层最多一次，不构成嵌套，正常放行。
 * 2. **重复分组里的歧义交替**：交替分支在重复分组内（任意层级）且首字符集相交、
 *    无法仅靠字面量前缀区分时拒绝。`(a|aa)+`、`([a-z]|[a-z0-9])+`、`((a|aa))+` 都命中；
 *    `(cat|dog)+` 首字符不相交，放行。
 *
 * 判定仍是保守近似：宁可拒绝少数安全写法，也不让一次搜索钉死宿主。但所有常见
 * 日常写法（`(\d+)?`、`(\d{1,3}\.){3}`、`(?:ab)+`、`(cat|dog)+`）都不再被误拦。
 */

/** 正则源长度上限：正常检索写不到这么长，超过的多半是误粘贴。 */
const MAX_PATTERN_LENGTH = 200

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
 * 一组可能的首字符。
 *
 * 无法枚举的字符集（`.`、取反字符类、`\D`、Unicode 属性）用 `any` 表示——
 * 它与任何非空字符集都相交，判定因此偏保守。
 */
interface CharSet {
  /** 是否可能匹配任意字符。 */
  any: boolean
  /** 具体字符；`any` 为真时不使用。 */
  chars: Set<string>
}

/**
 * 建一个空字符集。
 * @returns 空集
 */
function emptySet(): CharSet {
  return { any: false, chars: new Set() }
}

/**
 * 建一个「任意字符」字符集。
 * @returns 任意集
 */
function anySet(): CharSet {
  return { any: true, chars: new Set() }
}

/**
 * 把字符区间并入字符集。
 * @param set 目标集合
 * @param from 起始码点
 * @param to 结束码点
 */
function addRange(set: CharSet, from: number, to: number): void {
  // 区间过大时退化为「任意」：继续枚举只会白耗内存，判定也更保守
  if (to - from > 512) {
    set.any = true

    return
  }

  for (let code = from; code <= to; code += 1) set.chars.add(String.fromCodePoint(code))
}

/** 两个字符集是否可能匹配同一个字符。 */
function intersects(left: CharSet, right: CharSet): boolean {
  if (left.any || right.any) return true

  for (const char of left.chars) {
    if (right.chars.has(char)) return true
  }

  return false
}

/** 结构树节点。 */
type RegexNode =
  | { type: 'set'; set: CharSet }
  /** 零宽断言（`^`、`$`、`\b`、前后瞻）；不消费字符。 */
  | { type: 'assert' }
  /** 分组；`lookaround` 为真时整组视为零宽断言。 */
  | { type: 'group'; body: Alternation; lookaround: boolean }
  /** 重复修饰。 */
  | { type: 'repeat'; body: RegexNode; min: number; max: number }
  /** 交替；每个分支是一段拼接序列。 */
  | { type: 'alt'; branches: RegexNode[][] }

/** 一段交替（至少一个分支）。 */
type Alternation = RegexNode[]

/** 解析器：游标 + 源串。 */
interface Parser {
  source: string
  index: number
}

/** 判断某个位置的 `{n}` / `{n,}` / `{n,m}` 是否构成量词。 */
const BRACE_QUANTIFIER = /^\{(\d+)(?:,(\d*))?\}/u

/**
 * 解析完整正则。
 * @param source 正则源
 * @returns 顶层拼接序列
 * @throws Error 结构无法解析
 */
function parseRegex(source: string): RegexNode[] {
  const parser: Parser = { source, index: 0 }
  const branches = parseAlternation(parser)

  if (parser.index < source.length) throw new Error(`Unexpected token at ${String(parser.index)}`)

  return branches
}

/**
 * 解析交替：`a|b|c`。
 * @param parser 解析器
 * @returns 交替节点；只有一段时直接返回该段
 */
function parseAlternation(parser: Parser): RegexNode[] {
  const branches: RegexNode[][] = [parseSequence(parser)]

  while (parser.source[parser.index] === '|') {
    parser.index += 1
    branches.push(parseSequence(parser))
  }

  if (branches.length === 1) return branches[0] ?? []

  return [{ type: 'alt', branches }]
}

/**
 * 解析一段拼接序列。
 * @param parser 解析器
 * @returns 节点列表
 */
function parseSequence(parser: Parser): RegexNode[] {
  const nodes: RegexNode[] = []

  while (parser.index < parser.source.length) {
    const char = parser.source[parser.index]

    if (char === '|' || char === ')') break

    const atom = parseAtom(parser)

    if (atom === null) continue

    nodes.push(parseQuantifier(parser, atom))
  }

  return nodes
}

/**
 * 解析一个原子，并把紧随其后的重复量词挂上去。
 * @param parser 解析器
 * @param atom 原子节点
 * @returns 可能带重复修饰的节点
 */
function parseQuantifier(parser: Parser, atom: RegexNode): RegexNode {
  const char = parser.source[parser.index]

  /** 读取 `{n,m}`，不成立时返回 null。 */
  const readBrace = (): { min: number; max: number } | null => {
    const match = BRACE_QUANTIFIER.exec(parser.source.slice(parser.index))

    if (match === null) return null

    const min = Number(match[1])
    // `{n}` 与 `{n,}` 的差别只在是否有第二个数字；`{n,}` 的上界为无穷
    const max = match[2] === undefined ? min : match[2] === '' ? Number.POSITIVE_INFINITY : Number(match[2])

    return { min, max }
  }

  let min: number
  let max: number

  if (char === '*') {
    min = 0
    max = Number.POSITIVE_INFINITY
    parser.index += 1
  } else if (char === '+') {
    min = 1
    max = Number.POSITIVE_INFINITY
    parser.index += 1
  } else if (char === '?') {
    min = 0
    max = 1
    parser.index += 1
  } else if (char === '{') {
    const brace = readBrace()

    if (brace === null) return atom

    min = brace.min
    max = brace.max
    parser.index += BRACE_QUANTIFIER.exec(parser.source.slice(parser.index))?.[0].length ?? 0
  } else {
    return atom
  }

  // 懒惰量词（`*?`、`+?`）不影响每轮可匹配的长度，跳过修饰符即可
  if (parser.source[parser.index] === '?') parser.index += 1

  return { type: 'repeat', body: atom, min, max }
}

/**
 * 解析一个原子：字面量、字符类、转义、分组或断言。
 * @param parser 解析器
 * @returns 节点；无法识别时返回 null（例如未闭合分组的收尾字符）
 * @throws Error 语法无法解析
 */
function parseAtom(parser: Parser): RegexNode | null {
  const char = parser.source[parser.index]

  if (char === undefined) return null

  if (char === '^' || char === '$') {
    parser.index += 1

    return { type: 'assert' }
  }

  if (char === '.') {
    parser.index += 1

    return { type: 'set', set: anySet() }
  }

  if (char === '[') return { type: 'set', set: parseClass(parser) }

  if (char === '(') return parseGroup(parser)

  if (char !== '\\') {
    parser.index += 1

    const set = emptySet()
    set.chars.add(char)

    return { type: 'set', set }
  }

  return parseEscape(parser, false)
}

/**
 * 解析分组（`(...)`、`(?:...)`、前后瞻、具名分组）。
 * @param parser 解析器
 * @returns 分组节点
 * @throws Error 括号未闭合
 */
function parseGroup(parser: Parser): RegexNode {
  parser.index += 1

  let lookaround = false

  if (parser.source[parser.index] === '?') {
    const rest = parser.source.slice(parser.index)

    if (rest.startsWith('?:') || rest.startsWith('?<=') || rest.startsWith('?<!')) {
      lookaround = rest.startsWith('?<=')
      parser.index += rest.startsWith('?:') ? 2 : 3
    } else if (rest.startsWith('?=') || rest.startsWith('?!')) {
      lookaround = true
      parser.index += 2
    } else if (rest.startsWith('?<')) {
      // 具名捕获组 `(?<name>`：跳到右尖括号
      const end = parser.source.indexOf('>', parser.index)

      if (end === -1) throw new Error('Unterminated group name')
      parser.index = end + 1
      lookaround = false
    } else {
      // 未知修饰符交给 RegExp 报语法错误，这里按普通分组继续解析
      parser.index += 1
    }
  }

  const body = parseAlternation(parser)

  if (parser.source[parser.index] !== ')') throw new Error('Unterminated group')
  parser.index += 1

  return { type: 'group', body, lookaround }
}

/**
 * 解析字符类 `[...]`。
 * @param parser 解析器
 * @returns 可能的首字符集合
 */
function parseClass(parser: Parser): CharSet {
  parser.index += 1

  let negated = false

  if (parser.source[parser.index] === '^') {
    negated = true
    parser.index += 1
  }

  const set = emptySet()

  // 取反类无法枚举补集，直接按「任意」处理
  const absorb = (item: CharSet): void => {
    if (negated) {
      set.any = true

      return
    }

    if (item.any) {
      set.any = true

      return
    }

    for (const char of item.chars) set.chars.add(char)
  }

  while (parser.index < parser.source.length && parser.source[parser.index] !== ']') {
    const first = readClassChar(parser)

    if (first === null) continue

    // 区间 `a-z`：前一项是单字符且下一项是 `-` 且再下一项不是 `]`
    if (
      parser.source[parser.index] === '-' &&
      parser.source[parser.index + 1] !== undefined &&
      parser.source[parser.index + 1] !== ']'
    ) {
      parser.index += 1
      const second = readClassChar(parser)

      if (second !== null && !first.any && !second.any) {
        const from = first.chars.values().next().value
        const to = second.chars.values().next().value

        if (from !== undefined && to !== undefined && first.chars.size === 1 && second.chars.size === 1) {
          addRange(set, from.codePointAt(0) ?? 0, to.codePointAt(0) ?? 0)

          continue
        }
      }

      // 区间不成立时按字面量处理 `-`
      absorb(first)
      set.chars.add('-')

      continue
    }

    absorb(first)
  }

  if (parser.source[parser.index] !== ']') throw new Error('Unterminated character class')
  parser.index += 1

  return set
}

/**
 * 读字符类里的一个成员。
 * @param parser 解析器
 * @returns 成员的字符集；读到 `\` 转义时可能是预定义类
 */
function readClassChar(parser: Parser): CharSet | null {
  const char = parser.source[parser.index]

  if (char === undefined) return null

  if (char !== '\\') {
    parser.index += 1

    const set = emptySet()
    set.chars.add(char)

    return set
  }

  const escape = parseEscape(parser, true)

  return escape.type === 'set' ? escape.set : null
}

/**
 * 解析转义序列。
 * @param parser 解析器
 * @param inClass 是否位于字符类内部（`\b` 在此表示退格而不是词边界）
 * @returns 节点
 */
function parseEscape(parser: Parser, inClass: boolean): RegexNode {
  parser.index += 1

  const char = parser.source[parser.index] ?? ''

  parser.index += 1

  const literal = (value: string): RegexNode => {
    const set = emptySet()
    set.chars.add(value)

    return { type: 'set', set }
  }

  if (char === 'd') {
    const set = emptySet()
    addRange(set, 0x30, 0x39)

    return { type: 'set', set }
  }

  if (char === 'w') {
    const set = emptySet()
    addRange(set, 0x30, 0x39)
    addRange(set, 0x41, 0x5a)
    addRange(set, 0x61, 0x7a)
    set.chars.add('_')

    return { type: 'set', set }
  }

  if (char === 's') {
    const set = emptySet()

    for (const space of [' ', '\t', '\n', '\r', '\f', '\v', '\u00a0', '\ufeff']) set.chars.add(space)

    return { type: 'set', set }
  }

  // 取反预定义类与 Unicode 属性无法枚举，按任意字符保守处理
  if (char === 'D' || char === 'W' || char === 'S' || char === 'p' || char === 'P') {
    // `\p{...}` / `\P{...}` 还要跳过花括号里的属性名
    if ((char === 'p' || char === 'P') && parser.source[parser.index] === '{') {
      const end = parser.source.indexOf('}', parser.index)

      if (end !== -1) parser.index = end + 1
    }

    return { type: 'set', set: anySet() }
  }

  if (char === 'b' || char === 'B' || char === 'A' || char === 'z' || char === 'Z') {
    // 字符类内部的 `\b` 是退格字符，不是断言
    if (char === 'b' && inClass) return literal('\b')

    return { type: 'assert' }
  }

  // 数字反向引用与 `\k<name>`：引用内容长度不定，按任意字符处理
  if ((char >= '1' && char <= '9') || char === 'k') {
    if (char === 'k' && parser.source[parser.index] === '<') {
      const end = parser.source.indexOf('>', parser.index)

      if (end !== -1) parser.index = end + 1
    }

    return { type: 'set', set: anySet() }
  }

  if (char === 'n') return literal('\n')
  if (char === 'r') return literal('\r')
  if (char === 't') return literal('\t')
  if (char === 'f') return literal('\f')
  if (char === 'v') return literal('\v')
  if (char === '0') return literal('\0')

  // `\xHH` / `\uHHHH` / `\u{H...}` / `\cX`：只关心首字符，数值本身不影响首字符集判定
  if (char === 'x') {
    parser.index += 2

    return { type: 'set', set: anySet() }
  }

  if (char === 'u') {
    if (parser.source[parser.index] === '{') {
      const end = parser.source.indexOf('}', parser.index)

      if (end !== -1) parser.index = end + 1
    } else {
      parser.index += 4
    }

    return { type: 'set', set: anySet() }
  }

  if (char === 'c') {
    parser.index += 1

    return { type: 'set', set: anySet() }
  }

  return literal(char)
}

/**
 * 计算节点可能匹配的首字符集。
 * @param node 节点
 * @returns 首字符集
 */
function firstOf(node: RegexNode): CharSet {
  if (node.type === 'set') return node.set
  if (node.type === 'assert') return emptySet()
  if (node.type === 'repeat') return firstOf(node.body)

  if (node.type === 'group') {
    return node.lookaround ? emptySet() : firstOfSequence(node.body)
  }

  const merged = emptySet()

  // 任意一个分支的首字符都可能成为整体的首字符，逐个并入即可
  for (const branch of node.branches) {
    const set = firstOfSequence(branch)

    if (set.any) merged.any = true
    else for (const char of set.chars) merged.chars.add(char)
  }

  return merged
}

/**
 * 计算一段序列可能匹配的首字符集。
 *
 * 前面的节点都可能匹配空串时，后面的节点首字符同样可能出现；这里取保守近似：
 * 一旦遇到不能确定消费字符的节点就停止。
 * @param sequence 序列
 * @returns 首字符集
 */
function firstOfSequence(sequence: RegexNode[]): CharSet {
  const merged = emptySet()

  for (const node of sequence) {
    const set = firstOf(node)

    if (set.any) merged.any = true
    else for (const char of set.chars) merged.chars.add(char)

    // 只有断言或固定消费字符的节点不会让位给后继；重复与可选节点可能为空，继续并入
    if (!couldBeEmpty(node)) break
  }

  return merged
}

/**
 * 判断节点是否可能匹配空串。
 * @param node 节点
 * @returns 可能为空时返回 true
 */
function couldBeEmpty(node: RegexNode): boolean {
  if (node.type === 'assert') return true
  if (node.type === 'set') return false
  if (node.type === 'repeat') return node.min === 0 || couldBeEmpty(node.body)
  if (node.type === 'group') return node.body.every(couldBeEmpty)

  return node.branches.some((branch) => branch.every(couldBeEmpty))
}

/**
 * 取一段序列的字面量首部；含字符集或断言时返回空串。
 * @param sequence 序列
 * @returns 字面前缀（仅由确定字面量组成）
 */
function literalHeadOf(sequence: RegexNode[]): string | null {
  let head = ''

  for (const node of sequence) {
    if (node.type === 'assert') continue

    if (node.type === 'set') {
      if (node.set.any || node.set.chars.size !== 1) return null

      head += node.set.chars.values().next().value ?? ''

      continue
    }

    if (node.type === 'repeat') {
      // 量词让后续字面量不再确定：只保留已读到的部分
      if (node.max === 0) continue
      if (node.min !== 1 || node.max !== 1) return head === '' ? null : head

      const inner = literalHeadOf([node.body])

      if (inner === null) return null

      head += inner

      continue
    }

    if (node.type === 'group') {
      if (node.lookaround) continue

      const inner = literalHeadOf(node.body)

      if (inner === null) return null

      head += inner

      continue
    }

    return null
  }

  return head
}

/**
 * 判断两个交替分支是否可能匹配同一段文本（从而在重复分组里制造歧义）。
 *
 * 先用字面前缀区分：两个分支都有确定的字面量首部时，只有互为前缀才算歧义
 * （`abc` / `abd` 互不重叠，`a` / `ab` 命中）。任一首部不确定时退回首字符集
 * 相交判定，宁可多拦，避免 `([a-z]|[a-z0-9])` 这类等价字符类漏网。
 * @param left 左分支
 * @param right 右分支
 * @returns 可能歧义时返回 true
 */
function branchesOverlap(left: RegexNode[], right: RegexNode[]): boolean {
  const leftHead = literalHeadOf(left)
  const rightHead = literalHeadOf(right)

  if (leftHead !== null && rightHead !== null) {
    if (leftHead === '' || rightHead === '') return intersects(firstOfSequence(left), firstOfSequence(right))

    return leftHead.startsWith(rightHead) || rightHead.startsWith(leftHead)
  }

  return intersects(firstOfSequence(left), firstOfSequence(right))
}

/**
 * 判断结构里是否含无上界重复。
 * @param node 节点
 * @returns 命中时返回 true
 */
function hasUnboundedRepeat(node: RegexNode): boolean {
  if (node.type === 'repeat') {
    return node.max === Number.POSITIVE_INFINITY || hasUnboundedRepeat(node.body)
  }

  if (node.type === 'group') return node.body.some(hasUnboundedRepeat)
  if (node.type === 'alt') return node.branches.some((branch) => branch.some(hasUnboundedRepeat))

  return false
}

/**
 * 判断结构里是否存在「分支重叠的交替」。
 * @param node 节点
 * @returns 命中时返回 true
 */
function hasOverlappingAlternation(node: RegexNode): boolean {
  if (node.type === 'repeat') return hasOverlappingAlternation(node.body)

  if (node.type === 'group') {
    return node.lookaround ? false : node.body.some(hasOverlappingAlternation)
  }

  if (node.type !== 'alt') return false

  for (let left = 0; left < node.branches.length; left += 1) {
    for (let right = left + 1; right < node.branches.length; right += 1) {
      if (branchesOverlap(node.branches[left] ?? [], node.branches[right] ?? [])) return true
    }
  }

  // 分支内部还可以嵌着别的交替
  return node.branches.some((branch) => branch.some(hasOverlappingAlternation))
}

/**
 * 递归判定一个节点是否含已知的回溯爆炸形态。
 * @param node 节点
 * @returns 命中时返回 true
 */
function isRiskyNode(node: RegexNode): boolean {
  if (node.type === 'repeat') {
    // 重复次数大于 1 才有「同样的文本存在多种切分」的可能
    if (node.max > 1) {
      // 外层重复 + 内层无上界重复：经典指数形态 `(a+)+`、`(\w+\s?)+`
      // 外层有上界且很小（如 `(\d+){3}`）时仅是多项式，不在此列
      const boundedOuter = node.max !== Number.POSITIVE_INFINITY && node.max < 8

      if (!boundedOuter && hasUnboundedRepeat(node.body)) return true

      // 重复分组里的歧义交替：`(a|aa)+`、`([a-z]|[a-z0-9])+`、`((a|aa))+`
      if (hasOverlappingAlternation(node.body)) return true
    }

    return isRiskyNode(node.body)
  }

  if (node.type === 'group') return node.lookaround ? false : node.body.some(isRiskyNode)
  if (node.type === 'alt') return node.branches.some((branch) => branch.some(isRiskyNode))

  return false
}

/**
 * 判断正则源是否含已知的回溯爆炸形态。
 * @param source 正则源
 * @returns 命中时返回 true；结构无法解析时返回 false，交给 `new RegExp` 报语法错误
 */
function isRiskySource(source: string): boolean {
  let nodes: RegexNode[]

  try {
    nodes = parseRegex(source)
  } catch (error) { // 解析失败说明写法超出本判定器覆盖范围，交给 RegExp 给准确的语法错误
    console.error('[dsh-ide] 正则结构解析失败，跳过安全检查:', source, error)

    return false
  }

  return nodes.some(isRiskyNode)
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

  if (isRiskySource(source)) {
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
