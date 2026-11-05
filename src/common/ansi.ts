/**
 * 终端输出的 ANSI 转义序列解析。
 *
 * 运行面板拿到的输出是终端原始字节，彩色输出里混着 `\x1b[32m` 这类序列。直接丢进
 * `<pre>` 会显示成乱码，所以这里把 SGR（颜色/粗体）解析成可渲染的片段，把其它控制
 * 序列（光标移动、清屏、私有模式、窗口标题）丢掉——面板是一次性文本视图，不需要它们。
 *
 * 解析覆盖三类常见写法：基本色与亮色（30-37 / 90-97）、256 色（38;5;n）与真彩
 * （38;2;r;g;b）。不认识的序列一律静默丢弃，不能让残留的 `?25l`、`0;title` 之类
 * 出现在日志里。
 */

/** 一个片段的文字颜色：CSS 变量引用或直接的十六进制值。 */
export type AnsiColor = string

/** 一段同样式的文本。 */
export interface AnsiRun {
  /** 文本内容。 */
  text: string
  /** 颜色（CSS 可用值）；未设置时为 undefined。 */
  color?: AnsiColor
  /** 是否加粗。 */
  bold?: boolean
  /** 是否暗淡。 */
  dim?: boolean
  /** 是否下划线。 */
  underline?: boolean
}

/**
 * 一次完整的 CSI 序列。
 *
 * 参数字节允许 `0x30-0x3F`（含 `?`、`=`、`>`、`<` 这类私有前缀），中间字节
 * `0x20-0x2F`，终止字节 `0x40-0x7E`。旧实现只认 `[0-9;]`，`\x1b[?25l` 这类
 * 私有序列会原样留在正文里。
 */
const CSI_SEQUENCE = /\x1b\[([0-?]*)([ -/]*)([@-~])/g

/** OSC 序列（窗口标题等）：以 BEL 或 ST 结束。 */
const OSC_SEQUENCE = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g

/** 其余两字节转义（如 `\x1b(B`、`\x1b=`）。 */
const SIMPLE_ESCAPE = /\x1b[@-Z\\-_()=><78c]/g

/** 8 个基本色的变量名后缀，索引对应 SGR 30-37。 */
const BASIC_COLORS = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white']

/**
 * 取 xterm 256 色板中的颜色。
 *
 * 0-15 是基本色/亮色（由主题变量给出），16-231 是 6×6×6 色立方，232-255 是灰阶。
 * @param index 颜色号
 * @returns CSS 颜色；超出范围时返回 undefined
 */
function colorOf256(index: number): AnsiColor | undefined {
  if (index < 0 || index > 255) return undefined

  if (index < 8) return `var(--ide-term-${BASIC_COLORS[index] ?? 'white'})`
  if (index < 16) return `var(--ide-term-bright-${BASIC_COLORS[index - 8] ?? 'white'})`

  if (index < 232) {
    const value = index - 16
    const steps = [0, 95, 135, 175, 215, 255]
    const red = steps[Math.floor(value / 36) % 6] ?? 0
    const green = steps[Math.floor(value / 6) % 6] ?? 0
    const blue = steps[value % 6] ?? 0

    return `rgb(${String(red)}, ${String(green)}, ${String(blue)})`
  }

  // 232-255：从 8 到 238 的 24 级灰
  const level = 8 + (index - 232) * 10

  return `rgb(${String(level)}, ${String(level)}, ${String(level)})`
}

/**
 * 把 SGR 参数应用到当前样式。
 *
 * 逐段消费而不是逐码消费：`38;5;n` 与 `38;2;r;g;b` 是多码一组的扩展色，
 * 按单码处理会把后面的数字误当成新的 SGR 指令。
 * @param params 分号分隔的参数串
 * @param style 当前样式，就地修改
 */
function applySgr(params: string, style: AnsiRun): void {
  const codes = params === '' ? [0] : params.split(';').map((part) => Number.parseInt(part, 10))

  for (let index = 0; index < codes.length; index += 1) {
    const code = codes[index]
    if (code === undefined || Number.isNaN(code)) continue

    if (code === 0) {
      // 重置：清掉除文本外的全部属性
      delete style.color
      delete style.bold
      delete style.dim
      delete style.underline

      continue
    }

    if (code === 1) {
      style.bold = true

      continue
    }

    if (code === 2) {
      style.dim = true

      continue
    }

    if (code === 4) {
      style.underline = true

      continue
    }

    if (code === 22) {
      delete style.bold
      delete style.dim

      continue
    }

    if (code === 24) {
      delete style.underline

      continue
    }

    if (code === 39) {
      delete style.color

      continue
    }

    // 30-37 基本色，90-97 亮色
    if (code >= 30 && code <= 37) {
      style.color = `var(--ide-term-${BASIC_COLORS[code - 30] ?? 'white'})`

      continue
    }

    if (code >= 90 && code <= 97) {
      style.color = `var(--ide-term-bright-${BASIC_COLORS[code - 90] ?? 'white'})`

      continue
    }

    // 扩展色：38;5;n（256 色）或 38;2;r;g;b（真彩）；48 是背景色，文本视图不展示
    if (code === 38 || code === 48) {
      const mode = codes[index + 1]

      if (mode === 5) {
        const color = colorOf256(codes[index + 2] ?? -1)

        index += 2
        if (code === 38 && color !== undefined) style.color = color

        continue
      }

      if (mode === 2) {
        const red = codes[index + 2] ?? 0
        const green = codes[index + 3] ?? 0
        const blue = codes[index + 4] ?? 0

        index += 4
        if (code === 38) style.color = `rgb(${String(red)}, ${String(green)}, ${String(blue)})`

        continue
      }

      // 不认识的扩展色：跳过这一组，避免把参数当普通 SGR
      index += 1

      continue
    }
  }
}

/**
 * 逐行处理回车覆盖。
 *
 * 进度条（`10%\r20%\r30%`）在真实终端里只显示最后一段，直接渲染会把每一段都
 * 拼到一行里。逐行取最后一个 `\r` 之后的内容即可。
 * @param input 原始文本
 * @returns 覆盖处理后的文本
 */
function collapseCarriageReturns(input: string): string {
  if (!input.includes('\r')) return input

  return input
    .split('\n')
    .map((line) => line.slice(line.lastIndexOf('\r') + 1))
    .join('\n')
}

/**
 * 解析终端输出。
 * @param input 带 ANSI 序列的原始文本
 * @returns 按样式切分的片段；没有序列时返回单个片段
 */
export function parseAnsi(input: string): AnsiRun[] {
  const runs: AnsiRun[] = []
  const style: AnsiRun = { text: '' }

  // 先剥掉不参与排版的序列：OSC（窗口标题）与两字节转义
  const text = collapseCarriageReturns(input.replace(OSC_SEQUENCE, '').replace(SIMPLE_ESCAPE, ''))
  let last = 0

  CSI_SEQUENCE.lastIndex = 0

  for (let match = CSI_SEQUENCE.exec(text); match !== null; match = CSI_SEQUENCE.exec(text)) {
    if (match.index > last) runs.push({ text: text.slice(last, match.index), ...snapshot(style) })

    // 只有 m 结尾的是颜色/字重，其余（K 清行、H 定位、私有模式…）一律丢弃
    if (match[3] === 'm') applySgr(match[1] ?? '', style)

    last = CSI_SEQUENCE.lastIndex
  }

  if (last < text.length) runs.push({ text: text.slice(last), ...snapshot(style) })

  return runs
}

/**
 * 取出当前样式的副本；文本字段留空，由调用方填充。
 * @param style 当前样式
 * @returns 可展开的样式对象
 */
function snapshot(style: AnsiRun): Omit<AnsiRun, 'text'> {
  return { color: style.color, bold: style.bold, dim: style.dim, underline: style.underline }
}
