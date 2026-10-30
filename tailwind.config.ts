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

/**
 * 生成「表面色阶」：以底层为底，混入一层前景色。
 *
 * 宿主的浅色主题里 base / layer-1 / layer-2 全等于纯白，直接拿它们做背景，
 * 选中的页签、选中的文件行与面板层级都会完全看不出来。这里改用前景色按比例
 * 混入底层：浅色主题下压暗成灰，深色主题下提亮成深灰，两套主题都有可辨识的
 * 层次，且仍然只引用宿主令牌，不出现字面色值。
 * @param percent 前景色占比（百分数）
 * @returns Tailwind 颜色函数，支持透明度修饰符
 */
function surface(percent: number): (options: OpacityOptions) => string {
  return ({ opacityValue }: OpacityOptions): string => {
    const mixed = `color-mix(in srgb, var(--dsw-alias-label-primary) ${String(percent)}%, var(--dsw-alias-bg-base))`

    if (opacityValue === undefined || opacityValue === '1') return mixed

    const alpha = Number(opacityValue) * 100
    if (!Number.isFinite(alpha)) return mixed

    return `color-mix(in srgb, ${mixed} ${String(alpha)}%, transparent)`
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
        // 表面色阶：1 = 工具窗口底，2 = 选中项，3 = 更强的强调块
        surface1: surface(5),
        surface2: surface(10),
        surface3: surface(16),
        overlay: token('--dsw-alias-bg-overlay'),
        line1: token('--dsw-alias-border-l1'),
        line2: token('--dsw-alias-border-l2'),
        line4: token('--dsw-alias-border-l4'),
        brand: token('--dsw-alias-brand-primary'),
        // 业务强调色：宿主用它标激活页签，这里用于选中行与强调文字
        info: token('--dsw-alias-state-business-primary'),
        primary: token('--dsw-alias-label-primary'),
        secondary: token('--dsw-alias-label-secondary'),
        // 反色前景：用于强调底色（如高亮菜单项）上的文字
        inverted: token('--dsw-alias-label-primary-inverted'),
        // 强调底色上的文字：IDEA 的主按钮（蓝底/红底）始终用纯白字
        onAccent: 'var(--dsw-static-neutral-bluish-00)',
        danger: token('--dsw-alias-state-error-primary'),
        success: token('--dsw-alias-state-success-primary'),
        warn: token('--dsw-alias-state-warn-primary'),
        // 编辑区配色：默认继承宿主令牌，深色下由 input.css 换成 IDEA 实测色值
        tabbar: token('--ide-tabbar-bg'),
        code: token('--ide-code-bg'),
        tabactive: token('--ide-tab-active-bg'),
        tabline: token('--ide-tab-active-border'),
        tablabel: token('--ide-tab-active-label'),
        // Git 文件状态色：取 IDEA 默认配色方案，深浅两套值由 input.css 定义
        // 项目树选中行的圆角蓝块
        treeselected: 'var(--ide-tree-selected-bg)',
        // 项目树根节点右侧的路径灰
        treepath: 'var(--ide-tree-path)',
        // 设置页输入框底色与描边：深浅两套 IDEA 实测值由 input.css 定义
        inputbg: 'var(--ide-input-bg)',
        inputborder: 'var(--ide-input-border)',
        'vcs-added': 'var(--ide-vcs-added)',
        'vcs-modified': 'var(--ide-vcs-modified)',
        'vcs-deleted': 'var(--ide-vcs-deleted)',
        'vcs-unknown': 'var(--ide-vcs-unknown)',
        'vcs-conflict': 'var(--ide-vcs-conflict)',
      } as unknown as Record<string, string>,
    },
  },
}

export default config
