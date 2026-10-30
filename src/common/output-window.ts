/**
 * 控制台输出的客户端尾部窗口。
 *
 * 宿主侧运行缓冲已经是环形的，但客户端只做字符串追加：长跑的 dev server 一天能喷出
 * 几十 MB，内存与每轮重新解析的成本都会单调上涨。运行面板与输出面板共用这里，
 * 统一只保留尾部一段。
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
  return text.length > MAX_OUTPUT_CHARS ? text.slice(text.length - MAX_OUTPUT_CHARS) : text
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
