/**
 * 弹窗几何信息的类型与存取契约。
 *
 * 独立成不含 React 依赖的模块：宿主侧设置服务也要复用这些类型来校验落盘字段，
 * 避免把 React 带进宿主 bundle。
 */

/** 弹窗尺寸（px）。 */
export interface DialogSize {
  /** 宽度。 */
  width: number
  /** 高度。 */
  height: number
}

/** 弹窗位置：左上角相对其定位参照元素左上角的偏移（px）。 */
export interface DialogOffset {
  /** 横坐标。 */
  x: number
  /** 纵坐标。 */
  y: number
}

/** 弹窗的尺寸与位置；位置缺省表示沿用布局给出的默认位置（居中）。 */
export interface DialogFrame extends DialogSize {
  /** 左上角横坐标（px）；缺省表示按默认位置居中。 */
  x?: number
  /** 左上角纵坐标（px）；缺省表示按默认位置居中。 */
  y?: number
}

/**
 * 弹窗的默认尺寸。
 *
 * 用「占可用区域的比例 + 像素上限」而不是固定像素：低分辨率屏幕上按比例收缩，
 * 高分屏上也不会撑到半屏以上，等价于 CSS 的 `min(比例 × 可用区域, 上限)`。
 */
export interface DialogInitialSize {
  /** 占可用区域宽度的比例（0～1）；1 表示用到上限或可用宽度。 */
  widthRatio: number
  /** 占可用区域高度的比例（0～1）；1 表示用到上限或可用高度。 */
  heightRatio: number
  /** 宽度上限（px）。 */
  maxWidth: number
  /** 高度上限（px）。 */
  maxHeight: number
}

/** 弹窗几何信息的存取入口；由服务总线注入，弹窗只依赖这一层。 */
export interface DialogFrameStore {
  /**
   * 读取已保存的几何信息表。
   * @returns 键为弹窗标识的尺寸与位置表；没有记录时为空对象
   */
  read(): Record<string, DialogFrame>
  /**
   * 保存某个弹窗的几何信息。
   * @param key 弹窗标识
   * @param frame 拖拽结束时的尺寸与位置
   */
  save(key: string, frame: DialogFrame): void
}
