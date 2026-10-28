/**
 * Tailwind 配置。
 *
 * 颜色全部映射到宿主主题令牌（`--dsw-alias-*`），因此工作台随宿主的明暗主题
 * 自动切换，源码内不出现字面色值。preflight 关闭，避免重置宿主既有样式。
 *
 * 令牌是 `var(--x)` 字符串，Tailwind 的 `/10` 透明度修饰符对它无效（生成的类会
 * 被丢弃），所以令牌用函数形式声明：带透明度时输出 color-mix，真正做到按比例
 * 混合。差异底色、选中行与悬停态都依赖这一点。
 */
import type { Config } from 'tailwindcss'

/** Tailwind 传给颜色函数的参数。 */
interface OpacityOptions {
  /** 透明度修饰符，如 `0.1`；未写时为 undefined。 */
  opacityValue?: string
}

/**
 * 生成一个支持透明度修饰符的主题令牌颜色。
 * @param name CSS 变量名（含 `--`）
 * @returns Tailwind 颜色函数或变量值
 */
function token(name: string): (options: OpacityOptions) => string {
  return ({ opacityValue }: OpacityOptions): string => {
    if (opacityValue === undefined || opacityValue === '1') return `var(${name})`

    const percent = Number(opacityValue) * 100

    // 非法修饰符（Tailwind 偶尔传入 var(...)）退回不透明，避免生成无效声明
    if (!Number.isFinite(percent)) return `var(${name})`

    return `color-mix(in srgb, var(${name}) ${String(percent)}%, transparent)`
  }
}

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      // Tailwind 的类型声明不接受函数形式的颜色，但运行期支持；
      // 用 Record 转换绕过类型限制，透明度修饰符由 token() 输出 color-mix
      colors: {
        base: token('--dsw-alias-bg-base'),
        layer1: token('--dsw-alias-bg-layer-1'),
        layer2: token('--dsw-alias-bg-layer-2'),
        overlay: token('--dsw-alias-bg-overlay'),
        line1: token('--dsw-alias-border-l1'),
        line2: token('--dsw-alias-border-l2'),
        line4: token('--dsw-alias-border-l4'),
        brand: token('--dsw-alias-brand-primary'),
        // 业务强调色：宿主用它标激活页签，这里用于选中行与强调文字
        info: token('--dsw-alias-state-business-primary'),
        primary: token('--dsw-alias-label-primary'),
        secondary: token('--dsw-alias-label-secondary'),
        danger: token('--dsw-alias-state-error-primary'),
        success: token('--dsw-alias-state-success-primary'),
        warn: token('--dsw-alias-state-warn-primary'),
      } as unknown as Record<string, string>,
    },
  },
}

export default config
