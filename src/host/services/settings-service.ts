/**
 * 插件设置服务。
 *
 * 设置文件放在 `$DSH_HOME/dsh-ide/settings.json`，跨会话共享；运行配置放在同目录的
 * `run-configs.json`，按工作目录分组。两者都是「读多写少」的小文件。
 *
 * 设置读取按 `mtime + size` 缓存：每个工作台挂载、每次弹窗尺寸读取都会读一次，
 * 每次都解析 JSON 属于重复劳动；命中条件严格到字节数，文件被外部改动后立刻失效，
 * 不会出现「宿主重启后还看到旧值」。写入一律串行 + 唯一临时文件 + rename。
 */
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { DialogFrame } from '../../common/dialog-size'
import { pluginDataDir } from './home'

/** 编辑器与工作台的全局设置。 */
export interface IdeSettings {
  /** 编辑器字号（px）。 */
  fontSize: number
  /** 编辑器行距，相对字号的倍数。 */
  lineHeight: number
  /** 制表宽度。 */
  tabSize: number
  /** 是否自动保存；默认开启，编辑后停止输入即落盘。 */
  autoSave: boolean
  /** 自动保存的静止时长（毫秒）。 */
  autoSaveDelayMs: number
  /** 后台自动 fetch 的间隔（秒）；0 表示关闭，默认 60 秒。 */
  autoFetchSeconds: number
  /** 搜索默认排除的 glob，逗号分隔。 */
  searchExclude: string
  /** 终端默认 shell 的绝对路径；空串表示用宿主默认。 */
  terminalShell: string
  /** 工作台配色：跟随宿主、强制浅色或强制深色。 */
  theme: IdeTheme
  /** 更新工程时远端改动进入当前分支的方式。 */
  updateProjectMode: UpdateProjectMode
  /** 更新工程时是否跳过方式选择对话框，直接按上次的选择执行。 */
  updateProjectSkipDialog: boolean
  /** 各弹窗拖拽后的尺寸与位置；键为弹窗标识。 */
  dialogSizes: Record<string, DialogFrame>
}

/** 工作台配色选项。 */
export type IdeTheme = 'system' | 'light' | 'dark'

/** 更新工程的方式：合并进当前分支，或把当前分支变基到远端之上。 */
export type UpdateProjectMode = 'merge' | 'rebase'

/** 默认设置。 */
const DEFAULT_SETTINGS: IdeSettings = {
  fontSize: 12,
  // 行距 1.2 与 IDEA 默认一致：比默认的 1.6 紧凑，单屏能看到更多代码行
  lineHeight: 1.2,
  tabSize: 2,
  autoSave: true,
  autoSaveDelayMs: 500,
  // 60 秒：同事推送的新提交能在一分钟内被发现，又不至于把 git 进程开得太频繁
  autoFetchSeconds: 60,
  searchExclude: '',
  terminalShell: '',
  theme: 'system',
  // 默认与 IDEA 一致：合并进当前分支，并且每次都询问
  updateProjectMode: 'merge',
  updateProjectSkipDialog: false,
  dialogSizes: {},
}

/** 弹窗尺寸的合法区间（px）：更小的值会让弹窗内容挤成一团，更大的值没有任何意义。 */
const DIALOG_SIZE_LIMITS = { min: 200, max: 4000 }

/** 弹窗标识允许的字符：与各弹窗里写死的 key 一致，防止坏文件塞进任意键。 */
const DIALOG_SIZE_KEY_PATTERN = /^[a-z0-9-]{1,64}$/u

/**
 * 原子写一个小 JSON 文件。
 *
 * 直接 writeFile 在写入中途被打断（宿主退出、磁盘满）会留下半截 JSON，
 * 下次启动整份设置就解析失败；先写临时文件再 rename 可保证读到的一定是完整内容。
 *
 * 临时文件名必须唯一：固定 `${file}.tmp` 时两个并发写入会共用同一个临时文件，
 * A 的 rename 把 B 写入的内容一起提交，B 再 rename 就拿到 ENOENT，接口回 500；
 * 更糟的是半份内容落盘，下次读取 JSON 解析失败，整份设置回退默认值。
 * @param file 目标路径
 * @param text 文件内容
 */
async function writeAtomic(file: string, text: string): Promise<void> {
  const temporary = `${file}.${String(process.pid)}.${randomUUID()}.tmp`

  try {
    await writeFile(temporary, text, 'utf8')
    await rename(temporary, file)
  } catch (error) {
    // 失败时临时文件可能已经落盘，清掉避免在数据目录里堆无主文件
    await rm(temporary, { force: true }).catch((cleanupError: unknown) => {
      console.error('[dsh-ide] 清理设置临时文件失败:', temporary, cleanupError)
    })

    throw error
  }
}

/**
 * 设置读取缓存。
 *
 * 设置是「读多写少」的小文件：每个工作台挂载、每次弹窗尺寸读取都要读一次。
 * 按 mtime + size 命中时省掉一次 JSON 解析；命中条件严格到字节数，文件被外部
 * 改动后大小不变但 mtime 变化同样会失效。
 */
let settingsCache: { mtimeMs: number; size: number; settings: IdeSettings } | null = null

/** 设置写入队列：与运行配置同理，避免并发写互相覆盖。 */
let settingsQueue: Promise<unknown> = Promise.resolve()

/**
 * 复制一份设置，避免调用方改到缓存里的对象。
 * @param settings 缓存的设置
 * @returns 可直接交给调用方的副本
 */
function cloneSettings(settings: IdeSettings): IdeSettings {
  return { ...settings, dialogSizes: { ...settings.dialogSizes } }
}

/**
 * 运行配置的写入队列。
 *
 * 保存流程是「读整份 → 改一个工作空间 → 写整份」，两个请求并发时后写会覆盖前写，
 * 用户会莫名丢配置；按顺序串起来执行即可。
 */
let runConfigQueue: Promise<unknown> = Promise.resolve()

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
    lineHeight: number('lineHeight', DEFAULT_SETTINGS.lineHeight, 1, 2.5),
    tabSize: number('tabSize', DEFAULT_SETTINGS.tabSize, 1, 8),
    autoSave: source.autoSave === true,
    autoSaveDelayMs: number('autoSaveDelayMs', DEFAULT_SETTINGS.autoSaveDelayMs, 500, 60_000),
    autoFetchSeconds: Math.round(number('autoFetchSeconds', DEFAULT_SETTINGS.autoFetchSeconds, 0, 3600)),
    searchExclude: text('searchExclude', DEFAULT_SETTINGS.searchExclude),
    terminalShell: text('terminalShell', DEFAULT_SETTINGS.terminalShell),
    theme: themeOf(source.theme),
    updateProjectMode: source.updateProjectMode === 'rebase' ? 'rebase' : 'merge',
    updateProjectSkipDialog: source.updateProjectSkipDialog === true,
    dialogSizes: dialogSizesOf(source.dialogSizes),
  }
}

/**
 * 收窄弹窗位置坐标。
 * @param value 原始值
 * @returns 合法坐标；缺失或非法时返回 undefined，表示沿用默认位置
 */
function dialogOffsetOf(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined

  return Math.round(Math.min(Math.max(value, 0), DIALOG_SIZE_LIMITS.max))
}

/**
 * 收窄弹窗几何信息表。
 * @param value 原始值
 * @returns 只保留标识合法、宽高均为有限数的条目；位置缺失或非法时按未记录处理
 */
function dialogSizesOf(value: unknown): Record<string, DialogFrame> {
  if (typeof value !== 'object' || value === null) return {}

  const frames: Record<string, DialogFrame> = {}
  const clamp = (raw: number): number =>
    Math.round(Math.min(Math.max(raw, DIALOG_SIZE_LIMITS.min), DIALOG_SIZE_LIMITS.max))

  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!DIALOG_SIZE_KEY_PATTERN.test(key)) continue
    if (typeof raw !== 'object' || raw === null) continue

    const item = raw as Record<string, unknown>
    if (typeof item.width !== 'number' || typeof item.height !== 'number') continue
    if (!Number.isFinite(item.width) || !Number.isFinite(item.height)) continue

    const frame: DialogFrame = { width: clamp(item.width), height: clamp(item.height) }

    // 旧版本只存过尺寸；两个坐标都合法时才记住位置，否则继续按默认位置居中
    const x = dialogOffsetOf(item.x)
    const y = dialogOffsetOf(item.y)
    if (x !== undefined && y !== undefined) {
      frame.x = x
      frame.y = y
    }

    frames[key] = frame
  }

  return frames
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
    const info = await stat(settingsPath())

    if (settingsCache !== null && settingsCache.mtimeMs === info.mtimeMs && settingsCache.size === info.size) {
      return cloneSettings(settingsCache.settings)
    }

    const text = await readFile(settingsPath(), 'utf8')
    const settings = normalizeSettings(JSON.parse(text))

    settingsCache = { mtimeMs: info.mtimeMs, size: info.size, settings }

    return cloneSettings(settings)
  } catch (error) { // 首次运行没有文件，属于正常路径
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('[dsh-ide] 读取设置失败，使用默认值:', error)
    }

    // 文件缺失或被写坏时不能让旧缓存继续生效，否则用户改回默认值也读不到默认值
    settingsCache = null

    return cloneSettings(DEFAULT_SETTINGS)
  }
}

/**
 * 写入设置。
 * @param value 待保存的设置，逐字段兜底后落盘
 * @returns 落盘后的设置
 */
export async function writeSettings(value: unknown): Promise<IdeSettings> {
  const settings = normalizeSettings(value)

  // 串行执行：客户端连点设置页、弹窗尺寸落盘与设置保存同时到达时，
  // 后写会覆盖前写；排队后最后一次写入胜出，不会互相踩掉
  const task = async (): Promise<IdeSettings> => {
    await mkdir(pluginDataDir(), { recursive: true })
    await writeAtomic(settingsPath(), `${JSON.stringify(settings, null, 2)}\n`)
    settingsCache = null

    return settings
  }

  const next = settingsQueue.then(task, task)
  settingsQueue = next.catch(() => undefined)

  return next
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

      // 旧格式只在首次读取时迁移一次。这里不能再排进 runConfigQueue：
      // 本函数可能已经在队列任务内部（保存配置时的读改写），再等队列会自锁。
      // 原子写 + 唯一临时文件已经保证并发迁移不会写坏文件，两份内容也完全相同。
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
  await writeAtomic(runConfigsPath(), `${JSON.stringify(store, null, 2)}\n`)
}


/**
 * 写入某个工作空间的运行配置；其它工作空间的配置原样保留。
 * @param root 工作空间根路径
 * @param configs 该空间的全量配置列表
 */
export async function writeRunConfigs(root: string, configs: RunConfig[]): Promise<void> {
  await mutateRunConfigs(root, () => configs)
}

/**
 * 在写入队列内完成「读整份 → 改本工作空间 → 写整份」。
 *
 * 调用方自行「先 readRunConfigs 再 writeRunConfigs」时，读取发生在队列之外：
 * 两个并发保存（例如连点两次保存、保存与删除交错）会各自基于同一份旧列表计算，
 * 后写的一方把前一次新增的配置整条覆盖掉。把读改写一起放进队列才能消除这个窗口。
 * @param root 工作空间根路径
 * @param mutate 基于当前列表计算新列表；可以在这里生成新 id，避免同毫秒撞号
 * @returns 写入后的列表
 */
export async function mutateRunConfigs(
  root: string,
  mutate: (configs: RunConfig[]) => RunConfig[],
): Promise<RunConfig[]> {
  let next: RunConfig[] = []

  const task = async (): Promise<void> => {
    const store = await readStore(root)

    next = mutate(store[root] ?? [])
    store[root] = next

    await persistStore(store)
  }

  // 排队执行并保留失败信息给调用方，同时让队列本身不会因为一次失败而中断
  const queued = runConfigQueue.then(task, task)
  runConfigQueue = queued.catch(() => undefined)

  await queued

  return next
}

/**
 * 生成一个不会与既有配置冲突的 id。
 *
 * 旧实现用 `Date.now().toString(36)`，同一毫秒内连续新建两条会得到同一个 id，
 * 后一条把前一条覆盖掉。
 * @param existing 当前列表
 * @returns 新 id
 */
export function createRunConfigId(existing: RunConfig[]): string {
  const ids = new Set(existing.map((item) => item.id))
  let candidate = `cfg-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`

  while (ids.has(candidate)) candidate = `cfg-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`

  return candidate
}
