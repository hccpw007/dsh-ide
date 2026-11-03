/**
 * 编辑器标签页状态。
 *
 * 打开的文件与游标按工作空间持久化到 localStorage，关闭工作台或切换承载面后恢复。
 * 同一项目的不同对话共用一份记录：在哪里打开的文件，从哪个对话进去都还在。
 * 状态放在这里而不是组件里：标签与正文是两个组件，共享同一份状态比层层传 props 干净。
 */
import { diffSourceId, type DiffSource } from '../../common/diff-source'
import { safeSetItem } from '../../common/storage-maintenance'
import type { EditorTab, EditorTabKey } from './contract'

/** 持久化的会话编辑器状态。 */
export interface StoredEditorState {
  /** 打开的标签，按显示顺序。 */
  tabs: EditorTab[]
  /** 当前激活标签的序列化 key；空串表示无。 */
  active: string
}

/**
 * localStorage 前缀；带版本段，格式变更时换版本而不迁移。
 *
 * v3：状态改为按工作空间持久化，同一项目的不同对话共用一份；旧版本按会话存的
 * 数据不再读取（换版本使其自然失效，不做迁移）。
 */
const STORAGE_PREFIX = 'dsh-ide.editors.v3.'

/** 编辑器区支持的标签类型；持久化数据里出现其它类型时直接丢弃。 */
const EDITOR_TAB_KINDS: EditorTab['key']['kind'][] = ['file', 'diff', 'settings', 'conflict']

/**
 * 标签 key 的序列化形式，同时用作 React key 与持久化 id。
 * @param key 标签身份
 * @returns 稳定字符串
 */
export function serializeTabKey(key: EditorTabKey): string {
  return `${key.kind}:${key.id}`
}

/**
 * 由路径派生文件标签。
 * @param path 相对工作区根的路径
 * @returns 标签
 */
export function fileTab(path: string): EditorTab {
  return {
    key: { kind: 'file', id: path },
    title: path.slice(path.lastIndexOf('/') + 1),
    path,
  }
}

/**
 * 由差异源派生差异标签。
 * @param source 差异来源
 * @returns 标签
 */
export function diffTab(source: DiffSource): EditorTab {
  const id = diffSourceId(source)
  const name =
    source.kind === 'files'
      ? `${source.left.split('/').pop() ?? source.left} ↔ ${source.right.split('/').pop() ?? source.right}`
      : source.kind === 'commits'
        ? (source.path?.split('/').pop() ?? `${source.from}..${source.to}`)
        : (source.path.split('/').pop() ?? source.path)

  return { key: { kind: 'diff', id }, title: `Diff: ${name}`, source }
}

/**
 * 读取某个工作空间的编辑器状态。
 * @param storageKey 持久化键（工作空间键）
 * @returns 恢复的状态；没有或损坏时为空状态
 */
export function loadEditorState(storageKey: string): StoredEditorState {
  if (storageKey === '') return { tabs: [], active: '' }

  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${storageKey}`)
    if (raw === null) return { tabs: [], active: '' }

    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return { tabs: [], active: '' }

    const candidate = parsed as { tabs?: unknown; active?: unknown }
    const tabs = Array.isArray(candidate.tabs) ? candidate.tabs.filter(isEditorTab) : []

    return {
      tabs,
      active: typeof candidate.active === 'string' ? candidate.active : '',
    }
  } catch (error) { // 存储不可用或内容损坏时退回空状态
    console.error('[dsh-ide] 读取编辑器状态失败:', error)

    return { tabs: [], active: '' }
  }
}

/**
 * 判断持久化数据是否是可用的标签。
 * @param value 未知值
 * @returns 收窄结果
 */
function isEditorTab(value: unknown): value is EditorTab {
  if (typeof value !== 'object' || value === null) return false

  const candidate = value as { key?: unknown; title?: unknown; source?: unknown; path?: unknown }
  const key = candidate.key as { kind?: unknown; id?: unknown } | undefined

  if (key === undefined || typeof key.kind !== 'string' || typeof key.id !== 'string') return false
  if (typeof candidate.title !== 'string') return false
  if (candidate.source !== undefined && typeof candidate.source !== 'object') return false

  // 只认当前仍由编辑器区渲染的标签类型：旧版本留下的 `merge` 标签已经没有渲染器，
  // 恢复出来只会是一个打不开的空标签
  return EDITOR_TAB_KINDS.includes(key.kind as EditorTab['key']['kind'])
}

/**
 * 写入某个工作空间的编辑器状态。
 *
 * 走 `safeSetItem` 而不是直接写 localStorage：配额不足时会先清理旧版本记录，
 * 保证刷新后仍能恢复标签，而不是静默丢失。
 * @param storageKey 持久化键（工作空间键）
 * @param state 待保存的状态
 */
export function saveEditorState(storageKey: string, state: StoredEditorState): void {
  if (storageKey === '') return

  safeSetItem(`${STORAGE_PREFIX}${storageKey}`, JSON.stringify(state))
}
