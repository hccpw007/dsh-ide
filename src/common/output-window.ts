/**
 * 控制台输出的客户端尾部窗口。
 *
 * 宿主侧运行缓冲已经是环形的，但客户端只做字符串追加：长跑的 dev server 一天能喷出
 * 几十 MB，内存与每轮重新解析的成本都会单调上涨。运行面板的输出区统一只保留
 * 尾部一段。
 */

/**
 * 客户端保留的输出字符上限。
 *
 * 取值与宿主侧 512KB 缓冲同一量级的一半：足够回看最近的构建日志，
 * 又不至于让每轮全量 ANSI 解析把主线程占满。
 */
const MAX_OUTPUT_CHARS = 256 * 1024

/**
 * 取文本的尾部窗口。
 * @param text 原始文本
 * @returns 不超过上限的尾部文本
 */
export function tailOutput(text: string): string {
  if (text.length <= MAX_OUTPUT_CHARS) return text

  let start = text.length - MAX_OUTPUT_CHARS

  // 先对齐到下一行开头：截断在行中间会把半条日志与半组 ANSI 序列都留下来
  const lineStart = text.indexOf('\n', start)

  if (lineStart !== -1 && lineStart - start < 4096) start = lineStart + 1

  // 仍可能落在代理对中间：跳过低的代理项，避免 emoji 变成乱码
  const code = text.charCodeAt(start)

  if (code >= 0xdc00 && code <= 0xdfff) start += 1

  // 再看截断点是否落在 CSI 序列内部：前缀末尾若有不完整的 `\x1b[...`，跳到序列结束
  const prefix = text.slice(Math.max(0, start - 64), start)

  if (/\x1b\[[0-9;?]*$/.test(prefix)) {
    const finalByte = /[@-~]/g
    finalByte.lastIndex = start
    const match = finalByte.exec(text)

    if (match !== null) start = match.index + 1
  }

  return text.slice(start)
}

/**
 * 追加一段输出并只保留尾部窗口。
 * @param previous 已有文本
 * @param incoming 新增文本
 * @returns 追加后的尾部窗口
 */
export function appendOutput(previous: string, incoming: string): string {
  return tailOutput(previous + incoming)
}

/**
 * 取文本的尾部若干行。
 *
 * 从末尾向前数换行，只扫描到需要的行数为止：`split('\n')` 会在每轮轮询时
 * 为整个窗口创建上万个临时字符串，而这里最多扫一千来行、不产生中间数组。
 * @param text 原始文本
 * @param maxLines 保留的最大行数
 * @returns 尾部文本
 */
export function tailLines(text: string, maxLines: number): string {
  if (maxLines <= 0) return ''

  let index = text.length
  let count = 0

  while (index > 0) {
    index = text.lastIndexOf('\n', index - 1)

    // 行数不足：整段都是要展示的内容
    if (index === -1) return text

    count += 1

    if (count >= maxLines) return text.slice(index + 1)
  }

  return text
}
