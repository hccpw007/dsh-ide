/**
 * 编辑器内核 chunk 的接口声明。
 *
 * 主 bundle 不打包 CodeMirror，只依赖这个类型；真实实现在 `editor-kernel.ts`，
 * 由 loader 在首次打开文件时下载。
 */
/** 编辑器内核的创建参数。 */
export interface EditorKernelOptions {
  /** 挂载点。 */
  parent: HTMLElement
  /** 文件路径，用于按扩展名挑选语法高亮。 */
  path: string
  /** 初始文档。 */
  doc: string
  /** 只读模式（超大文件降级时使用）。 */
  readOnly: boolean
  /** 字号（px）。 */
  fontSize: number
  /** 制表宽度。 */
  tabSize: number
  /** 文档变化回调。 */
  onChange(text: string): void
  /** 光标位置变化回调，参数是 1 起的行号与列号。 */
  onCursor(line: number, column: number): void
  /** 保存快捷键回调。 */
  onSave(): void
}

/** 编辑器内核实例。 */
export interface EditorKernel {
  /** 用新内容替换整个文档，不触发 onChange 的保存链路。 */
  setValue(text: string): void
  /** 读取当前文档。 */
  getValue(): string
  /** 跳到指定行（1 起）并聚焦。 */
  revealLine(line: number): void
  /** 打开查找面板。 */
  openSearch(): void
  /** 更新只读状态。 */
  setReadOnly(readOnly: boolean): void
  /** 更新字号与制表宽度。 */
  setMetrics(fontSize: number, tabSize: number): void
  /** 销毁编辑器。 */
  destroy(): void
}

/** chunk 的默认导出形态。 */
export interface EditorKernelModule {
  /** 创建内核。 */
  create(options: EditorKernelOptions): Promise<EditorKernel>
}
