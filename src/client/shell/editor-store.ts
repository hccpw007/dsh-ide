/**
 * 编辑器标签页状态。
 *
 * 打开的文件与游标按会话持久化到 localStorage，关闭工作台或切换承载面后恢复。
 * 状态放在这里而不是组件里：标签与正文是两个组件，共享同一份状态比层层传 props 干净。
 */
import type { DiffSource, EditorTab, EditorTabKey } from './contract'

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
 * v2：界面统一英文，旧标签里持久化的中文标题（如「差异: xxx」）无法靠新文案覆盖，
 * 因此换版本让旧状态自然失效一次，而不是加载后逐个猜测并改写标题。
 */
const STORAGE_PREFIX = 'dsh-ide.editors.v2.'

/**
 * 标签 key 的序列化形式，同时用作 React key 与持久化 id。
 * @param key 标签身份
 * @returns 稳定字符串
 */
export function serializeTabKey(key: EditorTabKey): string {
  return `${key.kind}:${key.id}`
}

/**
 * 差异源的稳定身份。
 * @param source 差异来源
 * @returns 可比较的字符串
 */
export function diffSourceId(source: DiffSource): string {
  if (source.kind === 'worktree') return `worktree:${source.staged ? 'staged' : 'unstaged'}:${source.path}`
  if (source.kind === 'commits') return `commits:${source.from}..${source.to}:${source.path ?? ''}`

  return `files:${source.left}:${source.right}`
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
 * 读取某个会话的编辑器状态。
 * @param sessionId 会话 id
 * @returns 恢复的状态；没有或损坏时为空状态
 */
export function loadEditorState(sessionId: string): StoredEditorState {
  if (sessionId === '') return { tabs: [], active: '' }

  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${sessionId}`)
    if (raw === null) return { tabs: [], active: '' }

    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return { tabs: [], active: '' }

    const candidate = parsed as { tabs?: unknown; active?: unknown }
    const tabs = Array.isArray(candidate.tabs) ? candidate.tabs.filter(isEditorTab) : []

    // 脏标记不跨会话恢复：上次没保存的内容不该在工作台重开时假装还在
    return {
      tabs: tabs.map((tab) => ({ ...tab, dirty: false })),
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

  return true
}

/**
 * 写入某个会话的编辑器状态。
 * @param sessionId 会话 id
 * @param state 待保存的状态
 */
export function saveEditorState(sessionId: string, state: StoredEditorState): void {
  if (sessionId === '') return

  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${sessionId}`, JSON.stringify(state))
  } catch (error) { // 隐私模式写入会失败，仅影响刷新后的恢复
    console.error('[dsh-ide] 保存编辑器状态失败:', error)
  }
}
