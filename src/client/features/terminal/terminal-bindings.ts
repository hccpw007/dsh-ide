/**
 * 终端面板的本地状态辅助。
 *
 * 面板本身只关心交互与挂载，这里负责三件与呈现无关的事：会话级终端绑定的读写、
 * IDEA 风格的默认页签名、以及从宿主主题令牌构造 xterm 主题。抽成独立模块是为了
 * 让面板组件聚焦在生命周期上，同时让主题与持久化各自可单独修改。
 */
import type { TerminalTheme } from '../../lazy/terminal-api'

/** 绑定关系存储前缀：按会话隔离，换项目不会串终端。 */
const STORAGE_PREFIX = 'dsh-ide.terminal.v1.'

/** 默认页签名：第一个终端与 IDEA 一样叫 Local。 */
const DEFAULT_TITLE = 'Local'

/**
 * xterm ANSI 色板对应的主题变量。
 *
 * 变量定义在工作台根节点上，取值按 IDEA 终端配色维护；键名必须与 xterm 的
 * ITheme 字段一致，才能被终端内核直接合并进主题。
 */
const ANSI_TOKENS: Readonly<Record<string, string>> = {
  black: '--ide-term-black',
  red: '--ide-term-red',
  green: '--ide-term-green',
  yellow: '--ide-term-yellow',
  blue: '--ide-term-blue',
  magenta: '--ide-term-magenta',
  cyan: '--ide-term-cyan',
  white: '--ide-term-white',
  brightBlack: '--ide-term-bright-black',
  brightRed: '--ide-term-bright-red',
  brightGreen: '--ide-term-bright-green',
  brightYellow: '--ide-term-bright-yellow',
  brightBlue: '--ide-term-bright-blue',
  brightMagenta: '--ide-term-bright-magenta',
  brightCyan: '--ide-term-bright-cyan',
  brightWhite: '--ide-term-bright-white',
}

/**
 * 读取本会话保存的终端 id 列表。
 * @param sessionId 会话 id
 * @returns 终端 id 列表
 */
export function loadBindings(sessionId: string): string[] {
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${sessionId}`)
    const parsed: unknown = raw === null ? [] : JSON.parse(raw)

    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch (error) { // 存储损坏时从空列表开始，不影响新建终端
    console.error('[dsh-ide] 读取终端绑定失败:', error)

    return []
  }
}

/**
 * 保存本会话的终端 id 列表。
 * @param sessionId 会话 id
 * @param ids 终端 id
 */
export function saveBindings(sessionId: string, ids: string[]): void {
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${sessionId}`, JSON.stringify(ids))
  } catch (error) { // 隐私模式下写入失败，仅影响刷新后的恢复
    console.error('[dsh-ide] 保存终端绑定失败:', error)
  }
}

/**
 * 生成新终端的页签名。
 *
 * 与 IDEA 一致：先占 Local，再按序号补 Local 2、Local 3；用户手工改过的名字
 * 不参与编号，因此关闭中间的终端后新建也不会与现有页签重名。
 * @param existing 当前已存在的页签名
 * @returns 未被占用的默认页签名
 */
export function nextTerminalTitle(existing: readonly string[]): string {
  const used = new Set(existing)
  if (!used.has(DEFAULT_TITLE)) return DEFAULT_TITLE

  let index = 2
  while (used.has(`${DEFAULT_TITLE} ${String(index)}`)) index += 1

  return `${DEFAULT_TITLE} ${String(index)}`
}

/**
 * 从宿主主题令牌读取终端主题。
 *
 * 必须在工作台根节点内部取计算样式：ANSI 色板与选区色定义在 `.dsh-ide-root` 上，
 * 从 `document.documentElement` 读不到，终端会退回 xterm 自己的深色色板。
 * @param element 终端挂载点（位于工作台根节点内）
 * @returns xterm 主题
 */
export function readTerminalTheme(element: HTMLElement): TerminalTheme {
  const style = getComputedStyle(element)
  const read = (name: string, fallback: string): string => style.getPropertyValue(name).trim() || fallback

  const ansi: Record<string, string> = {}
  for (const [key, token] of Object.entries(ANSI_TOKENS)) {
    const value = read(token, '')
    if (value !== '') ansi[key] = value
  }

  return {
    background: read('--dsw-alias-bg-base', '#1e1f22'),
    foreground: read('--dsw-alias-label-primary', '#bcbec4'),
    cursor: read('--ide-caret', '#bcbec4'),
    selectionBackground: read('--ide-selection-bg', '#29417f'),
    ansi,
  }
}
