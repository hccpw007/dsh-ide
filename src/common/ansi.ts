/**
 * 终端输出的 ANSI 转义序列解析。
 *
 * 运行面板拿到的输出是终端原始字节，彩色输出里混着 `\x1b[32m` 这类序列。直接丢进
 * `<pre>` 会显示成乱码，所以这里把 SGR（颜色/粗体）解析成可渲染的片段，把其它控制
 * 序列（光标移动、清屏等）丢掉——面板是一次性文本视图，不需要它们。
 */

/** 一段同样式的文本。 */
export interface AnsiRun {
  /** 文本内容。 */
  text: string
  /** 前景色变量名，如 `--ide-term-green`；未设置时为 undefined。 */
  color?: string
  /** 是否加粗。 */
  bold?: boolean
  /** 是否暗淡。 */
  dim?: boolean
  /** 是否下划线。 */
  underline?: boolean
}

/** 一次转义序列：参数串 + 终止字母。 */
const SEQUENCE = /\x1b\[([0-9;]*)([A-Za-z])/g

/** 8 个基本色的变量名后缀，索引对应 SGR 30-37。 */
const BASIC_COLORS = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white']

/**
 * 把 SGR 参数应用到当前样式。
 * @param params 分号分隔的参数串
 * @param style 当前样式，就地修改
 */
function applySgr(params: string, style: AnsiRun): void {
  const codes = params === '' ? [0] : params.split(';').map((part) => Number.parseInt(part, 10))

  for (const code of codes) {
    if (Number.isNaN(code)) continue

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
      style.color = `--ide-term-${BASIC_COLORS[code - 30]}`

      continue
    }

    if (code >= 90 && code <= 97) {
      style.color = `--ide-term-bright-${BASIC_COLORS[code - 90]}`
    }
  }
}

/**
 * 解析终端输出。
 * @param input 带 ANSI 序列的原始文本
 * @returns 按样式切分的片段；没有序列时返回单个片段
 */
export function parseAnsi(input: string): AnsiRun[] {
  const runs: AnsiRun[] = []
  const style: AnsiRun = { text: '' }
  let last = 0

  SEQUENCE.lastIndex = 0

  for (let match = SEQUENCE.exec(input); match !== null; match = SEQUENCE.exec(input)) {
    if (match.index > last) runs.push({ text: input.slice(last, match.index), ...snapshot(style) })

    // 只有 m 结尾的是颜色/字重，其余（K 清行、H 定位…）一律丢弃
    if (match[2] === 'm') applySgr(match[1], style)

    last = SEQUENCE.lastIndex
  }

  if (last < input.length) runs.push({ text: input.slice(last), ...snapshot(style) })

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
