/**
 * feature 注册表：校验、排序并按槽位分组。
 *
 * 单个 feature 定义写错不应拖垮整个工作台，因此这里逐条收窄，非法定义被跳过并记日志。
 * 分组在注册时一次算好，避免每次渲染都重新过滤。
 */
import type { FeatureSlot, IdeFeature } from './contract'

/** 未声明 order 的 feature 排在已声明者之后。 */
const DEFAULT_ORDER = 100

/** 每个槽位唯一必需的字段；缺它则该定义不成立。 */
const REQUIRED_FIELD: Record<FeatureSlot, keyof IdeFeature> = {
  toolWindow: 'view',
  bottomPanel: 'view',
  editorTab: 'editor',
  statusBar: 'status',
  service: 'host',
}

/** 五个槽位的合法取值，用于收窄外部传入的 slot 字段。 */
const SLOTS: readonly FeatureSlot[] = ['toolWindow', 'bottomPanel', 'editorTab', 'statusBar', 'service']

/**
 * 判定单条 feature 是否满足最小契约。
 * @param value 来自 features 目录默认导出的候选值
 * @returns 收窄后的判定结果
 */
function isIdeFeature(value: unknown): value is IdeFeature {
  if (typeof value !== 'object' || value === null) return false

  const candidate = value as {
    id?: unknown
    slot?: unknown
    locales?: unknown
    view?: unknown
    editor?: unknown
    status?: unknown
    host?: unknown
  }

  if (typeof candidate.id !== 'string' || candidate.id === '') return false
  if (typeof candidate.locales !== 'object' || candidate.locales === null) return false
  if (typeof candidate.slot !== 'string') return false
  if (!SLOTS.includes(candidate.slot as FeatureSlot)) return false

  const slot = candidate.slot as FeatureSlot
  const required = (candidate as Record<string, unknown>)[REQUIRED_FIELD[slot]]

  // 组件与扩展都必须是对象或函数，写成字面量说明契约被误解了
  return typeof required === 'object' || typeof required === 'function'
}

/** 只读注册表：通过校验的 feature 与按槽位分组的视图。 */
export interface IdeFeatureRegistry {
  /** 通过校验的 feature，按 order 升序。 */
  list: IdeFeature[]
  /** 取某个槽位下的 feature，顺序与 list 一致。 */
  bySlot(slot: FeatureSlot): IdeFeature[]
}

/**
 * 校验并排序 feature 列表，产出只读注册表。
 * @param list 各功能文件夹默认导出的集合
 * @returns 按 order 升序并已分组的注册表
 */
export function createIdeRegistry(list: readonly unknown[]): IdeFeatureRegistry {
  const seen = new Set<string>()
  const accepted: IdeFeature[] = []

  for (const item of list) {
    if (!isIdeFeature(item)) {
      // 定位到具体条目几乎不可能，这里输出原始值让开发者能对照 features/index.ts
      console.error('[dsh-ide] feature 定义不合法，已跳过:', item)

      continue
    }

    if (seen.has(item.id)) {
      console.error('[dsh-ide] feature id 重复，只保留第一个:', item.id)

      continue
    }

    seen.add(item.id)
    accepted.push(item)
  }

  // 权重相同时保持注册顺序，避免工作台顺序随构建波动
  accepted.sort((a, b) => (a.order ?? DEFAULT_ORDER) - (b.order ?? DEFAULT_ORDER))

  const groups: Record<FeatureSlot, IdeFeature[]> = {
    toolWindow: [],
    bottomPanel: [],
    editorTab: [],
    statusBar: [],
    service: [],
  }

  for (const feature of accepted) groups[feature.slot].push(feature)

  return {
    list: accepted,
    bySlot(slot) {
      return groups[slot]
    },
  }
}
