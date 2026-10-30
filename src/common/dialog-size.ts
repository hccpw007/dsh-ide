/**
 * 弹窗尺寸的类型与存取契约。
 *
 * 独立成不含 React 依赖的模块：宿主侧设置服务也要复用这两个类型来校验落盘字段，
 * 避免把 React 带进宿主 bundle。
 */

/** 弹窗尺寸（px）。 */
export interface DialogSize {
  /** 宽度。 */
  width: number
  /** 高度。 */
  height: number
}

/** 弹窗尺寸的存取入口；由服务总线注入，弹窗只依赖这一层。 */
export interface DialogSizeStore {
  /**
   * 读取已保存的尺寸表。
   * @returns 键为弹窗标识的尺寸表；没有记录时为空对象
   */
  read(): Record<string, DialogSize>
  /**
   * 保存某个弹窗的尺寸。
   * @param key 弹窗标识
   * @param size 拖拽结束时的尺寸
   */
  save(key: string, size: DialogSize): void
}
