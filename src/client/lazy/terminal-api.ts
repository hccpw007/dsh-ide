/**
 * 终端内核 chunk 的接口声明。
 *
 * 主 bundle 不打包 xterm，只依赖这个类型；真实实现在 `terminal-kernel.ts`。
 */

/** 终端主题：全部取自宿主主题令牌，跟随明暗切换。 */
export interface TerminalTheme {
  background: string
  foreground: string
  cursor: string
  selectionBackground: string
}

/** 创建终端的参数。 */
export interface TerminalKernelOptions {
  /** 挂载点。 */
  parent: HTMLElement
  /** 主题令牌值。 */
  theme: TerminalTheme
  /** 字号。 */
  fontSize: number
  /** 用户输入回调。 */
  onData(data: string): void
  /** 尺寸变化回调。 */
  onResize(cols: number, rows: number): void
}

/** 终端内核实例。 */
export interface TerminalKernel {
  /** 写入输出。 */
  write(data: string): void
  /** 清屏。 */
  clear(): void
  /** 按容器尺寸重算列行并回报。 */
  fit(): { cols: number; rows: number }
  /** 聚焦终端。 */
  focus(): void
  /** 读取当前选中的文本；没有选中时为空串。 */
  getSelection(): string
  /** 全选终端缓冲区内容。 */
  selectAll(): void
  /** 销毁终端并释放 DOM。 */
  destroy(): void
}

/** chunk 的默认导出形态。 */
export interface TerminalKernelModule {
  /** 创建终端。 */
  create(options: TerminalKernelOptions): TerminalKernel
}
