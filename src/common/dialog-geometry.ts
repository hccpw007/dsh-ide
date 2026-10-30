/**
 * 弹窗几何计算：默认尺寸、尺寸收窄、位置收窄与当前位置测量。
 *
 * 独立成不含 React 依赖的纯函数模块：dialog-frame 的 hook 只保留拖拽状态机，
 * 这里的函数接收真实 DOM 元素而不是 ref，便于单测与复用。
 */
import type { DialogInitialSize, DialogOffset, DialogSize } from './dialog-size'

/** 弹窗与可用区域边缘之间至少保留的距离（px）；同时够遮罩层的 p-4 内边距。 */
const VIEWPORT_MARGIN = 16

/**
 * 取可用区域的尺寸。
 * @param bounds 参照元素；为空时用浏览器视口
 * @returns 可用的宽高
 */
function availableArea(bounds: HTMLElement | null): DialogSize {
  return {
    width: bounds === null ? window.innerWidth : bounds.clientWidth,
    height: bounds === null ? window.innerHeight : bounds.clientHeight,
  }
}

/**
 * 把尺寸收窄到「最小尺寸～可用区域」之间。
 * @param width 期望宽度
 * @param height 期望高度
 * @param min 最小尺寸
 * @param bounds 可用区域的参照元素；为空时用视口
 * @returns 收窄后的尺寸
 */
export function clampDialogSize(
  width: number,
  height: number,
  min: DialogSize,
  bounds: HTMLElement | null,
): DialogSize {
  const area = availableArea(bounds)

  // 上限不小于下限：可用区域极小时仍保证最小尺寸可用，否则弹窗会被压成 0
  const maxWidth = Math.max(min.width, area.width - VIEWPORT_MARGIN * 2)
  const maxHeight = Math.max(min.height, area.height - VIEWPORT_MARGIN * 2)

  return {
    width: Math.round(Math.min(Math.max(width, min.width), maxWidth)),
    height: Math.round(Math.min(Math.max(height, min.height), maxHeight)),
  }
}

/**
 * 按比例与上限算出默认尺寸。
 * @param initial 比例与上限
 * @param min 最小尺寸
 * @param bounds 可用区域的参照元素；为空时用视口
 * @returns 默认尺寸
 */
export function initialDialogSize(
  initial: DialogInitialSize,
  min: DialogSize,
  bounds: HTMLElement | null,
): DialogSize {
  const area = availableArea(bounds)

  return clampDialogSize(
    Math.min(initial.maxWidth, area.width * initial.widthRatio),
    Math.min(initial.maxHeight, area.height * initial.heightRatio),
    min,
    bounds,
  )
}

/**
 * 取位置与拖动范围的参照尺寸。
 *
 * left/top 相对弹窗的 offsetParent 计算，拖动范围也必须按同一个元素算，
 * 否则挂在面板里的弹窗会按整页视口跑出面板。
 * @param root 弹窗根元素
 * @param bounds 弹窗声明的参照元素
 * @returns 参照元素的客户端宽高
 */
export function frameArea(root: HTMLElement | null, bounds: HTMLElement | null): DialogSize {
  const parent = root?.offsetParent
  if (parent instanceof HTMLElement && parent.clientWidth > 0 && parent.clientHeight > 0) {
    return { width: parent.clientWidth, height: parent.clientHeight }
  }

  return availableArea(bounds)
}

/**
 * 把位置收窄到参照区域内，保证弹窗整个留在视野里。
 * @param offset 期望位置
 * @param size 弹窗尺寸
 * @param area 参照区域尺寸
 * @returns 收窄后的位置
 */
export function clampOffset(offset: DialogOffset, size: DialogSize, area: DialogSize): DialogOffset {
  // 弹窗比参照区域还大时上限为 0，此时贴左上角
  const maxX = Math.max(0, area.width - size.width)
  const maxY = Math.max(0, area.height - size.height)

  return {
    x: Math.round(Math.min(Math.max(offset.x, 0), maxX)),
    y: Math.round(Math.min(Math.max(offset.y, 0), maxY)),
  }
}

/**
 * 量出弹窗当前渲染位置相对定位参照元素的 left/top。
 * @param root 弹窗根元素
 * @returns 当前位置；切换成绝对定位后视觉位置不变
 */
export function measureOffset(root: HTMLElement): DialogOffset {
  const parent = root.offsetParent
  if (!(parent instanceof HTMLElement)) return { x: root.offsetLeft, y: root.offsetTop }

  const rect = root.getBoundingClientRect()
  const parentRect = parent.getBoundingClientRect()

  // left/top 以参照元素的 padding box 为原点，所以要扣掉它的边框宽度
  return {
    x: Math.round(rect.left - parentRect.left - parent.clientLeft),
    y: Math.round(rect.top - parentRect.top - parent.clientTop),
  }
}
