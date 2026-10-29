/**
 * 插件设置服务。
 *
 * 设置文件放在 `$DSH_HOME/dsh-ide/settings.json`，跨会话共享；运行配置放在同目录的
 * `run-configs.json`，按工作目录分组。两者都是「读多写少」的小文件，因此每次读写都
 * 直连磁盘、不加缓存——宿主重启后用户能立刻看到上次的改动，不用猜缓存何时失效。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { pluginDataDir } from './home'

/** 编辑器与工作台的全局设置。 */
export interface IdeSettings {
  /** 编辑器字号（px）。 */
  fontSize: number
  /** 制表宽度。 */
  tabSize: number
  /** 是否自动保存。 */
  autoSave: boolean
  /** 自动保存的静止时长（毫秒）。 */
  autoSaveDelayMs: number
  /** 差异视图的上下文行数。 */
  diffContext: number
  /** 搜索默认排除的 glob，逗号分隔。 */
  searchExclude: string
  /** 诊断命令，如 `npx tsc --noEmit`；空串表示未配置。 */
  diagnoseCommand: string
  /** 终端默认 shell 的绝对路径；空串表示用宿主默认。 */
  terminalShell: string
  /** 工作台配色：跟随宿主、强制浅色或强制深色。 */
  theme: IdeTheme
}

/** 工作台配色选项。 */
export type IdeTheme = 'system' | 'light' | 'dark'

/** 默认设置。 */
const DEFAULT_SETTINGS: IdeSettings = {
  fontSize: 13,
  tabSize: 2,
  autoSave: false,
  autoSaveDelayMs: 2000,
  diffContext: 3,
  searchExclude: '',
  diagnoseCommand: '',
  terminalShell: '',
  theme: 'system',
}

/** 设置文件路径。 */
function settingsPath(): string {
  return path.join(pluginDataDir(), 'settings.json')
}

/** 运行配置文件路径。 */
function runConfigsPath(): string {
  return path.join(pluginDataDir(), 'run-configs.json')
}

/**
 * 把任意输入收窄为合法设置。
 *
 * 文件可能被用户手改坏，也可能来自旧版本；逐字段兜底比整体回退更有用——
 * 一个字段坏掉不该让其余设置一起丢失。
 * @param value 解析后的 JSON
 * @returns 补全后的设置
 */
function normalizeSettings(value: unknown): IdeSettings {
  const source = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  const number = (key: keyof IdeSettings, fallback: number, min: number, max: number): number => {
    const raw = source[key]

    return typeof raw === 'number' && Number.isFinite(raw) ? Math.min(Math.max(raw, min), max) : fallback
  }
  const text = (key: keyof IdeSettings, fallback: string): string => {
    const raw = source[key]

    return typeof raw === 'string' ? raw : fallback
  }
  return {
    fontSize: number('fontSize', DEFAULT_SETTINGS.fontSize, 9, 32),
    tabSize: number('tabSize', DEFAULT_SETTINGS.tabSize, 1, 8),
    autoSave: source.autoSave === true,
    autoSaveDelayMs: number('autoSaveDelayMs', DEFAULT_SETTINGS.autoSaveDelayMs, 500, 60_000),
    diffContext: number('diffContext', DEFAULT_SETTINGS.diffContext, 0, 20),
    searchExclude: text('searchExclude', DEFAULT_SETTINGS.searchExclude),
    diagnoseCommand: text('diagnoseCommand', DEFAULT_SETTINGS.diagnoseCommand),
    terminalShell: text('terminalShell', DEFAULT_SETTINGS.terminalShell),
    theme: themeOf(source.theme),
  }
}

/**
 * 收窄主题取值。
 * @param value 原始值
 * @returns 合法主题；无法识别时回到「跟随宿主」
 */
function themeOf(value: unknown): IdeTheme {
  return value === 'light' || value === 'dark' ? value : 'system'
}

/**
 * 读取设置；文件不存在或损坏时返回默认值。
 * @returns 当前设置
 */
export async function readSettings(): Promise<IdeSettings> {
  try {
    const text = await readFile(settingsPath(), 'utf8')

    return normalizeSettings(JSON.parse(text))
  } catch (error) { // 首次运行没有文件，属于正常路径
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('[dsh-ide] 读取设置失败，使用默认值:', error)
    }

    return { ...DEFAULT_SETTINGS }
  }
}

/**
 * 写入设置。
 * @param value 待保存的设置，逐字段兜底后落盘
 * @returns 落盘后的设置
 */
export async function writeSettings(value: unknown): Promise<IdeSettings> {
  const settings = normalizeSettings(value)

  await mkdir(pluginDataDir(), { recursive: true })
  await writeFile(settingsPath(), `${JSON.stringify(settings, null, 2)}\n`, 'utf8')

  return settings
}

/** 运行配置。 */
export interface RunConfig {
  /** 配置 id，创建时生成后不再变化。 */
  id: string
  /** 配置名称，同时作为进程标题。 */
  name: string
  /** 交给登录 shell 执行的完整命令串。 */
  command: string
  /** 工作目录。 */
  cwd: string
  /** 最近一次运行的退出码；未运行过为 null。 */
  lastExitCode?: number | null
}

/** 运行配置的存储结构：工作空间根路径 → 该空间的配置列表。 */
type RunConfigStore = Record<string, RunConfig[]>

/**
 * 收窄一条配置。
 * @param item 原始项
 * @returns 合法配置；字段缺失时返回 null
 */
function parseConfig(item: unknown): RunConfig | null {
  if (typeof item !== 'object' || item === null) return null

  const candidate = item as Record<string, unknown>

  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.name !== 'string' ||
    typeof candidate.command !== 'string' ||
    typeof candidate.cwd !== 'string'
  ) {
    return null
  }

  return {
    id: candidate.id,
    name: candidate.name,
    command: candidate.command,
    cwd: candidate.cwd,
    lastExitCode: typeof candidate.lastExitCode === 'number' ? candidate.lastExitCode : null,
  }
}

/**
 * 读取整份分组存储。
 *
 * 旧版本把配置存成一个裸数组（全局共享），这里按「读到的第一个工作空间」接管，
 * 用户的既有配置不会因为升级而消失。
 * @param migrateTo 读到旧格式时归属的工作空间根
 * @returns 分组合集；文件缺失或损坏时为空
 */
async function readStore(migrateTo: string): Promise<RunConfigStore> {
  try {
    const text = await readFile(runConfigsPath(), 'utf8')
    const parsed: unknown = JSON.parse(text)

    if (Array.isArray(parsed)) {
      const migrated = parsed.map(parseConfig).filter((item): item is RunConfig => item !== null)
      const store: RunConfigStore = migrated.length === 0 ? {} : { [migrateTo]: migrated }

      // 旧格式只在首次读取时迁移一次；写完再返回，别的工作空间随后就看不到这批配置了
      await persistStore(store)

      return store
    }

    if (typeof parsed !== 'object' || parsed === null) return {}

    const store: RunConfigStore = {}

    for (const [root, value] of Object.entries(parsed)) {
      if (!Array.isArray(value)) continue

      store[root] = value.map(parseConfig).filter((item): item is RunConfig => item !== null)
    }

    return store
  } catch (error) { // 没有配置文件是首次使用的正常状态
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('[dsh-ide] 读取运行配置失败:', error)
    }

    return {}
  }
}

/**
 * 读取某个工作空间的运行配置。
 *
 * 配置按工作空间隔离：不同目录互不可见，同一目录（含它的多个会话）共享一份。
 * @param root 工作空间根路径
 * @returns 该空间的配置列表
 */
export async function readRunConfigs(root: string): Promise<RunConfig[]> {
  const store = await readStore(root)

  return store[root] ?? []
}

/**
 * 把整份分组存储落盘。
 * @param store 分组合集
 */
async function persistStore(store: RunConfigStore): Promise<void> {
  await mkdir(pluginDataDir(), { recursive: true })
  await writeFile(runConfigsPath(), `${JSON.stringify(store, null, 2)}\n`, 'utf8')
}

/**
 * 写入某个工作空间的运行配置；其它工作空间的配置原样保留。
 * @param root 工作空间根路径
 * @param configs 该空间的全量配置列表
 */
export async function writeRunConfigs(root: string, configs: RunConfig[]): Promise<void> {
  const store = await readStore(root)
  store[root] = configs

  await persistStore(store)
}
