/**
 * Tailwind 配置。
 *
 * 颜色全部映射到宿主主题令牌（`--dsw-alias-*`），因此工作台随宿主的明暗主题
 * 自动切换，源码内不出现字面色值。preflight 关闭，避免重置宿主既有样式。
 */
import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        base: 'var(--dsw-alias-bg-base)',
        layer1: 'var(--dsw-alias-bg-layer-1)',
        layer2: 'var(--dsw-alias-bg-layer-2)',
        overlay: 'var(--dsw-alias-bg-overlay)',
        line1: 'var(--dsw-alias-border-l1)',
        line2: 'var(--dsw-alias-border-l2)',
        line4: 'var(--dsw-alias-border-l4)',
        brand: 'var(--dsw-alias-brand-primary)',
        primary: 'var(--dsw-alias-label-primary)',
        secondary: 'var(--dsw-alias-label-secondary)',
        danger: 'var(--dsw-alias-state-error-primary)',
        success: 'var(--dsw-alias-state-success-primary)',
        warn: 'var(--dsw-alias-state-warn-primary)',
      },
    },
  },
}

export default config
