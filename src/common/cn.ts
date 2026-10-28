/**
 * 合并组件的 Tailwind 类名。
 *
 * 公共组件允许调用方用 className 追加布局类，这里过滤空值避免拼出多余空格。
 * @param classes 类名列表，允许 false/null/undefined 表示条件不成立
 * @returns 以单个空格连接后的类名
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}
