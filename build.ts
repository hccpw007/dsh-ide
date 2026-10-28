/**
 * 构建脚本：Tailwind 生成样式，esbuild 打包宿主侧与浏览器端入口。
 *
 * 宿主按 package.json 的 exports 直接加载根目录的 index.js（必须是 JS），
 * 浏览器端产物由 ModuleLoader 工厂包裹成 client.js。用 tsx 直接执行本脚本，
 * 不需要额外的编译步骤。
 *
 * 传 `--watch` 进入监听模式：源码变化后只重建受影响的产物，交给宿主热重载取用；
 * 此时跳过 tsc 全量类型检查，改由开发者在提交前单独执行。
 */
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { build, context, type BuildContext, type BuildOptions, type BuildResult } from 'esbuild'

/** 工程根目录。 */
const ROOT = dirname(fileURLToPath(import.meta.url))
/** 中间产物目录。 */
const BUILD_DIR = join(ROOT, '.build')
/** Tailwind 输出的样式表，会被当作字符串打进 client.js。 */
const STYLE_FILE = join(BUILD_DIR, 'styles.css')
/** 懒加载 chunk 的输出目录；由宿主侧的 asset 路由按需下发。 */
const CHUNK_DIR = join(ROOT, 'chunks')
/** 是否监听源码变化持续重建。 */
const WATCH = process.argv.includes('--watch')

/**
 * 懒加载 chunk 清单：源码入口与产物文件名。
 *
 * 编辑器内核与终端内核各自打包成独立的 ES 模块，主 bundle 只保留一个动态
 * `import()` 调用。CodeMirror 与 xterm 加起来接近一兆，放进主 bundle 会让每次
 * 打开会话都付出解析成本，而它们只有用户真正打开文件或终端时才需要。
 */
const LAZY_CHUNKS: ReadonlyArray<{ entry: string; output: string }> = [
  { entry: 'src/client/lazy/editor-kernel.ts', output: 'editor-kernel.js' },
  { entry: 'src/client/lazy/terminal-kernel.ts', output: 'terminal-kernel.js' },
  { entry: 'src/client/lazy/diff-kernel.ts', output: 'diff-kernel.js' },
]

/**
 * 把多行文本整体缩进，便于嵌入 ModuleLoader 的工厂函数。
 * @param text 原始文本
 * @param spaces 缩进空格数
 * @returns 缩进后的文本
 */
function indent(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces)

  return text
    .split('\n')
    .map((line) => (line === '' ? line : pad + line))
    .join('\n')
}

/**
 * 取出 esbuild 的输出文本。
 * @param result esbuild 构建结果（write: false 时使用其中内存产物）
 * @returns 首个输出文件的文本
 */
function firstOutputText(result: BuildResult): string {
  const output = result.outputFiles?.[0]
  if (!output) throw new Error('esbuild 未返回输出文件')

  return output.text
}

/** 步骤一：Tailwind 扫描源码，只生成实际用到的类。 */
function buildStyles(): void {
  const args = [
    join(ROOT, 'node_modules/tailwindcss/lib/cli.js'),
    '--config',
    join(ROOT, 'tailwind.config.ts'),
    '--input',
    join(ROOT, 'src/client/styles/input.css'),
    '--output',
    STYLE_FILE,
    '--minify',
  ]

  // 两种模式都先同步生成一次：客户端入口直接 import 该文件，首次打包时缺文件会立即失败。
  execFileSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit' })

  if (!WATCH) return

  // 样式表被 esbuild 的依赖图包含，样式变化会连带重建 client.js。
  const watcher = spawn(process.execPath, [...args, '--watch'], { cwd: ROOT, stdio: 'inherit' })
  watcher.on('error', (error) => console.error('[build] Tailwind 监听启动失败:', error))
}

/**
 * 编译一个入口：普通模式立即构建并写出；监听模式交给 esbuild 持续重建，
 * 每次重建成功后调用 write 写出产物。
 * @param options esbuild 配置（必须 write: false，产物从内存取）
 * @param write 产物写出函数
 * @param label 产物名，仅用于监听模式下的重建日志
 * @returns 监听模式下的 esbuild context，普通模式返回 undefined
 */
async function compile(
  options: BuildOptions,
  write: (code: string) => void,
  label: string,
): Promise<BuildContext | undefined> {
  if (!WATCH) {
    write(firstOutputText(await build(options)))

    return undefined
  }

  const ctx = await context({
    ...options,
    plugins: [
      ...(options.plugins ?? []),
      {
        name: 'write-bundle',
        setup(buildContext) {
          buildContext.onEnd((result) => {
            // 重建失败时保留上一份产物，避免热重载读到写了一半的模块。
            if (result.errors.length > 0) {
              console.error('[build] 重建失败:', result.errors.map((item) => item.text).join('; '))

              return
            }

            try {
              write(firstOutputText(result))
              console.log(`[build] 已重建 ${label}`)
            } catch (error) {
              console.error('[build] 写出产物失败:', error)
            }
          })
        },
      },
    ],
  })
  await ctx.watch()

  return ctx
}

/** 步骤二：打包宿主侧入口，产出根目录的 index.js。 */
async function buildHostEntry(): Promise<void> {
  await compile(
    {
      entryPoints: [join(ROOT, 'src/host/index.ts')],
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'node',
      target: ['node20'],
      legalComments: 'none',
      logLevel: 'warning',
    },
    (code) => writeFileSync(join(ROOT, 'index.js'), code),
    'index.js',
  )
}

/**
 * 步骤三：打包浏览器端入口。
 *
 * React 保持 external，由 ModuleLoader 工厂的 require 参数提供；宿主的 UI 基础包
 * 同样 external，避免把宿主组件打进插件产物造成双份实现。
 *
 * 懒加载 chunk 不走 esbuild 的拆包：产物由 ModuleLoader 以工厂形式包裹，模块内
 * 无法直接用相对路径 `import()`。改为把它们编译成独立的 ES 模块文件，由宿主侧
 * 资产路由按固定 URL 下发，运行时用 `import(url)` 拉取——见 client/lazy/loader.ts。
 */
async function buildClientScript(): Promise<void> {
  await compile(
    {
      entryPoints: [join(ROOT, 'src/client/index.tsx')],
      bundle: true,
      write: false,
      format: 'cjs',
      platform: 'neutral',
      target: ['chrome110'],
      jsx: 'transform',
      external: ['react', '@deepseek-ai/dsh-client-ui-primitives'],
      loader: { '.css': 'text', '.svg': 'text' },
      legalComments: 'none',
      // 主包直接进浏览器解析路径，压缩能显著降低首次打开会话的成本
      minify: !WATCH,
      define: { 'process.env.NODE_ENV': '"production"' },
      logLevel: 'warning',
    },
    writeClient,
    'client.js',
  )
}

/**
 * 步骤四：打包懒加载 chunk。
 *
 * 每个 chunk 是独立的自包含 ES 模块，React 依旧 external（由 loader 注入的
 * 全局共享实例提供），避免编辑器 chunk 里再打包一份 React。
 */
async function buildLazyChunks(): Promise<void> {
  mkdirSync(CHUNK_DIR, { recursive: true })

  for (const chunk of LAZY_CHUNKS) {
    await compile(
      {
        entryPoints: [join(ROOT, chunk.entry)],
        outfile: join(CHUNK_DIR, chunk.output),
        bundle: true,
        write: false,
        format: 'esm',
        platform: 'browser',
        target: ['chrome110'],
        jsx: 'transform',
        external: ['react', 'react-dom', 'react/jsx-runtime'],
        loader: { '.css': 'text', '.svg': 'text' },
        legalComments: 'none',
        // 监听模式下保留可读输出便于调试；正式构建压缩
        minify: !WATCH,
        define: { 'process.env.NODE_ENV': '"production"' },
        logLevel: 'warning',
      },
      (code) => writeFileSync(join(CHUNK_DIR, chunk.output), code),
      chunk.output,
    )
  }
}

/**
 * 步骤四：包裹成 ModuleLoader 产物并写出 client.js。
 * @param bundleCode esbuild 输出的模块代码
 */
function writeClient(bundleCode: string): void {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { name: string }
  const output = `/* 本文件由 build.ts 生成，请勿手工修改。 */
window.__ModuleLoader__.load({
  id: ${JSON.stringify(manifest.name)},
  factory(require) {
    const module = { exports: {} };
    const exports = module.exports;
${indent(bundleCode, 4)}
    return module.exports.default || module.exports;
  },
});
`
  writeFileSync(join(ROOT, 'client.js'), output)
}

/** 串起全部步骤，并在失败时给出可诊断的日志。 */
async function main(): Promise<void> {
  try {
    mkdirSync(BUILD_DIR, { recursive: true })
    buildStyles()
    await buildHostEntry()
    await buildClientScript()
    await buildLazyChunks()
    console.log(
      WATCH
        ? '[build] 监听中：源码变化后自动重建，产物由宿主热重载接管'
        : '[build] 已生成 index.js、client.js 与 chunks/',
    )
  } catch (error) { // 构建失败必须以非零码退出，避免带着旧产物继续
    console.error('[build] 构建失败:', error)
    process.exitCode = 1
  }
}

await main()
