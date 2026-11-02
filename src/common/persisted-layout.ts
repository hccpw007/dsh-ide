/**
 * 界面布局尺寸的记忆存取。
 *
 * 分隔条拖出来的宽度与高度要在下次打开工作台时还原，整个插件共用一套，不区分
 * 项目与会话。数值存在 localStorage：读取时做类型与范围校验，写入合并到停手后
 * 一次，避免拖拽期间每帧同步落盘阻塞主线程。
 */
import { useCallback, useEffect, useRef, useState } from 'react'

/** localStorage 前缀；带版本段，格式变更时直接换版本而不是迁移。 */
const STORAGE_PREFIX = 'dsh-ide.layout-size.v1.'

/** 落盘合并延迟（ms）：拖拽期间尺寸每帧都变，停手后再写一次。 */
const SAVE_DELAY_MS = 200

/**
 * 把数值收进合法区间。
 * @param value 原始值
 * @param min 下限
 * @param max 上限
 * @returns 收窄后的数值
 */
function clampSize(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * 读取已保存的尺寸。
 *
 * 存储里可能是旧格式或被外部改坏的数据，因此只接受有限数字，并按当前上下限
 * 收窄——调整过上下限的版本读旧值时不会把面板撑坏。
 * @param key 布局标识
 * @param min 允许的下限
 * @param max 允许的上限
 * @returns 收窄后的尺寸；没有记录或数据不合法时为 null
 */
export function readLayoutSize(key: string, min: number, max: number): number | null {
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${key}`)
    if (raw === null) return null

    const parsed: unknown = JSON.parse(raw)

    // 非有限数字（字符串、null、NaN）一律当作没有记录，回退到调用方的默认值
    return typeof parsed === 'number' && Number.isFinite(parsed) ? clampSize(parsed, min, max) : null
  } catch (error) { // 隐私模式下读取可能抛错，退回默认尺寸即可
    console.error(`[dsh-ide] 读取布局尺寸失败（${key}）:`, error)

    return null
  }
}

/**
 * 写入布局尺寸。
 *
 * 只在拖拽停手后调用，不需要再做合并。
 * @param key 布局标识
 * @param value 尺寸（px）
 */
export function writeLayoutSize(key: string, value: number): void {
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(value))
  } catch (error) { // 隐私模式下写入会失败，此时布局只在本次打开期间有效
    console.error(`[dsh-ide] 保存布局尺寸失败（${key}）:`, error)
  }
}

/**
 * 让某个分隔条尺寸可拖拽并跨打开记忆。
 *
 * 重载一：初始值是固定像素，返回值恒为数字。
 * 重载二：初始值为 null，表示默认按容器比例自适应（如占一半），此时只有用户
 * 拖过之后才变成固定像素并落盘。
 * @param key 布局标识；同一标识全局共用一份值
 * @param initial 尚无记录时的尺寸；null 表示不固定尺寸
 * @param min 下限（px）
 * @param max 上限（px）
 * @returns 当前尺寸与设置函数；设置函数接收拖拽给出的原始值，内部收窄
 */
export function usePersistedLayout(
  key: string,
  initial: number,
  min: number,
  max: number,
): [number, (next: number) => void]
export function usePersistedLayout(
  key: string,
  initial: null,
  min: number,
  max: number,
): [number | null, (next: number) => void]
export function usePersistedLayout(
  key: string,
  initial: number | null,
  min: number,
  max: number,
): [number | null, (next: number) => void] {
  const [value, setValue] = useState<number | null>(() => readLayoutSize(key, min, max) ?? initial)
  /** 待写盘的尺寸；null 表示没有待写值。 */
  const pending = useRef<number | null>(null)
  /** 合并写入的定时器；null 表示没有排期。 */
  const timer = useRef<number | null>(null)

  /** 立即把待写值落盘；卸载与重新排期前都走这里。 */
  const flush = useCallback((): void => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }

    const next = pending.current
    if (next === null) return

    pending.current = null
    writeLayoutSize(key, next)
  }, [key])

  // 关闭面板或弹窗时补写最后一次拖拽结果，避免停在合并窗口内丢掉这次调整
  useEffect(() => () => {
    flush()
  }, [flush])

  const set = useCallback(
    (next: number): void => {
      const clamped = clampSize(next, min, max)

      setValue(clamped)
      pending.current = clamped

      // 停手 200ms 才写；拖拽期间持续重排定时器，只落最后的值
      if (timer.current !== null) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(flush, SAVE_DELAY_MS)
    },
    [flush, max, min],
  )

  return [value, set]
}
