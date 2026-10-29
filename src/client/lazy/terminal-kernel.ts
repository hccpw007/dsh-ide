/**
 * 终端内核：xterm.js 的封装。
 *
 * 本文件属于懒加载 chunk，不进主 bundle。主题完全由宿主令牌的当前值填充，
 * 明暗切换时由外层重新创建或更新主题，因此终端不会在浅色界面里留下黑底。
 */
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import terminalStyles from '@xterm/xterm/css/xterm.css'

import type { TerminalKernel, TerminalKernelModule, TerminalKernelOptions } from './terminal-api'

/** xterm 的样式只需注入一次；多个终端实例共用。 */
let styleInjected = false

/**
 * 注入 xterm 自带样式。
 *
 * xterm 的 DOM 结构依赖自己的类名，缺少这份样式时字符会重叠成一团。
 * 只注入一次，并带上插件标记，插件卸载时由入口统一直清理。
 */
function injectStyles(): void {
  if (styleInjected) return

  const style = document.createElement('style')
  style.setAttribute('data-dsh-plugin', 'dsh-ide-terminal')
  style.textContent = terminalStyles
  document.head.appendChild(style)
  styleInjected = true
}

/**
 * 创建终端实例。
 * @param options 创建参数
 * @returns 终端内核
 */
function create(options: TerminalKernelOptions): TerminalKernel {
  injectStyles()

  const terminal = new Terminal({
    fontSize: options.fontSize,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    cursorBlink: true,
    scrollback: 1000,
    theme: {
      background: options.theme.background,
      foreground: options.theme.foreground,
      cursor: options.theme.cursor,
      selectionBackground: options.theme.selectionBackground,
    },
    allowProposedApi: true,
  })

  const fit = new FitAddon()
  terminal.loadAddon(fit)
  terminal.open(options.parent)

  terminal.onData((data) => options.onData(data))
  terminal.onResize(({ cols, rows }) => options.onResize(cols, rows))

  // 首次 fit 必须等容器有尺寸；用微任务避开挂载当帧的 0×0
  queueMicrotask(() => {
    try {
      fit.fit()
    } catch (error) { // 容器尚不可见时 fit 会抛错，等下一次 ResizeObserver 回调即可
      console.error('[dsh-ide] 终端首次适配失败:', error)
    }
  })

  return {
    write(data: string) {
      terminal.write(data)
    },
    clear() {
      terminal.clear()
    },
    fit() {
      try {
        fit.fit()
      } catch (error) { // 同上的可见性竞态，不阻断输入输出
        console.error('[dsh-ide] 终端适配失败:', error)
      }

      return { cols: terminal.cols, rows: terminal.rows }
    },
    focus() {
      terminal.focus()
    },
    getSelection() {
      return terminal.getSelection()
    },
    selectAll() {
      terminal.selectAll()
    },
    destroy() {
      terminal.dispose()
    },
  }
}

/** chunk 的默认导出。 */
const module: TerminalKernelModule = { create }

export default module
