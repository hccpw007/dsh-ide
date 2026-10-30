/**
 * 工作台服务总线。
 *
 * feature 之间不互相 import，共享状态一律经过这里：工作台外壳在挂载时创建一份，
 * 通过 props 交给每个 feature 视图。总线只持有「状态 + 订阅」，不做任何渲染，
 * 因此它可以在不依赖 React 的情况下被单测或脚本调用。
 */
import { apiGet, apiPost } from '../../common/api'
import type { DialogSizeStore } from '../../common/dialog-size'
import type {
  DiffSource,
  IdeContextMenuRequest,
  IdeServices,
  IdeSettingsView,
  IdeToast,
  ToastKind,
  TreeSelection,
} from './contract'

/** 右下角提示的停留时长：与 IDEA 的通知气球一致，3 秒后自动消失。 */
const TOAST_DURATION_MS = 3000

/** 默认设置；宿主设置接口返回前先用它渲染。 */
const DEFAULT_SETTINGS: IdeSettingsView = {
  fontSize: 12,
  lineHeight: 1.2,
  tabSize: 2,
  autoSave: true,
  autoSaveDelayMs: 500,
  diffContext: 3,
  searchExclude: '',
  diagnoseCommand: '',
  terminalShell: '',
  theme: 'system',
  updateProjectMode: 'merge',
  updateProjectSkipDialog: false,
  dialogSizes: {},
}

/** 简单的订阅集合。 */
class Listeners<T extends unknown[]> {
  private readonly set = new Set<(...args: T) => void>()

  /**
   * 注册监听。
   * @param listener 回调
   * @returns 取消订阅函数
   */
  add(listener: (...args: T) => void): () => void {
    this.set.add(listener)

    return () => {
      this.set.delete(listener)
    }
  }

  /**
   * 通知全部监听；单个监听抛错不影响其它监听。
   * @param args 转发给监听者的参数
   */
  emit(...args: T): void {
    for (const listener of this.set) {
      try {
        listener(...args)
      } catch (error) { // 一个订阅者出错不应打断其余订阅者
        console.error('[dsh-ide] 服务总线监听器抛错:', error)
      }
    }
  }
}

/** 运行配置的跨组件意图：编辑某条，或新建一条。 */
export type RunConfigIntent = { kind: 'edit'; id: string } | { kind: 'create' }

/** 工作台服务实现。 */
export class WorkbenchServices implements IdeServices {
  private rootValue = ''
  private readonly rootListeners = new Listeners<[]>()

  private activeFileValue: string | null = null
  private readonly activeFileListeners = new Listeners<[]>()
  /** 项目树选中项；由项目树写入，工具栏等外壳部件据此判断能否对选中项执行操作。 */
  private selectionValue: TreeSelection | null = null
  private readonly selectionListeners = new Listeners<[]>()

  private readonly revealLineListeners = new Listeners<[string, number]>()
  private readonly invalidateListeners = new Listeners<[string | undefined]>()

  private toastList: IdeToast[] = []
  private toastSequence = 0
  private readonly toastListeners = new Listeners<[]>()

  private settingsValue: IdeSettingsView = DEFAULT_SETTINGS
  private readonly settingsListeners = new Listeners<[]>()

  /** 弹窗尺寸存取：与其它设置同一份文档，按弹窗标识各存一份。 */
  readonly dialogSizes: DialogSizeStore = {
    read: () => this.settingsValue.dialogSizes,
    save: (key, size) => {
      this.updateSettings({ dialogSizes: { ...this.settingsValue.dialogSizes, [key]: size } })
    },
  }

  /** 待处理的运行配置意图；顶部下拉点「编辑」「新增」时写入，运行面板消费后清空。 */
  private runConfigIntentValue: RunConfigIntent | null = null
  private readonly runConfigIntentListeners = new Listeners<[]>()

  private gitStatusValue: ReadonlyMap<string, string> = new Map()
  private gitIgnoredValue: ReadonlySet<string> = new Set()
  private readonly gitStatusListeners = new Listeners<[]>()

  /** 当前打开的右键菜单；全插件同一时间只显示一个。 */
  private contextMenuValue: IdeContextMenuRequest | null = null
  private readonly contextMenuListeners = new Listeners<[]>()

  /** 外部注入的动作：打开文件、差异、页面。由外壳接线，避免总线直接依赖 React 状态。 */
  readonly actions: {
    openFile(path: string): void
    openDiff(source: DiffSource): void
    openPage(kind: 'settings'): void
    openConflict(path: string): void
    revealLine(path: string, line: number): void
    openBottomPanel(id: string): void
    closeBottomPanel(): void
    openToolWindow(id: string): void
  }

  /** 进行中的 Git 状态请求，用于避免并发重复拉取。 */
  private gitStatusInFlight = false

  /**
   * @param platform 宿主提供的平台能力
   */
  constructor(
    platform: {
      openFile(path: string): void
      openDiff(source: DiffSource): void
      openPage(kind: 'settings'): void
      openConflict(path: string): void
      revealLine(path: string, line: number): void
      openBottomPanel(id: string): void
      closeBottomPanel(): void
      openToolWindow(id: string): void
    },
  ) {
    this.actions = platform
  }

  get root(): string {
    return this.rootValue
  }

  /**
   * 设置当前会话的工作区根；变化时通知订阅者。
   * @param root 绝对路径
   */
  setRoot(root: string): void {
    if (this.rootValue === root) return

    this.rootValue = root
    this.rootListeners.emit()
    // 会话换了项目，Git 状态必须重新取
    this.refreshGitStatus()
  }

  subscribeRoot(listener: () => void): () => void {
    return this.rootListeners.add(listener)
  }

  openFile(path: string): void {
    this.actions.openFile(path)
  }

  openDiff(source: DiffSource): void {
    this.actions.openDiff(source)
  }

  openPage(kind: 'settings'): void {
    this.actions.openPage(kind)
  }

  openConflict(path: string): void {
    this.actions.openConflict(path)
  }

  activeFile(): string | null {
    return this.activeFileValue
  }

  /**
   * 更新活动文件；变化时通知订阅者。
   * @param path 相对路径；null 表示编辑器区没有文件标签
   */
  setActiveFile(path: string | null): void {
    if (this.activeFileValue === path) return

    this.activeFileValue = path
    this.activeFileListeners.emit()
  }

  subscribeActiveFile(listener: () => void): () => void {
    return this.activeFileListeners.add(listener)
  }

  selection(): TreeSelection | null {
    return this.selectionValue
  }

  /**
   * 更新项目树选中项；变化时通知订阅者。
   * @param selection 选中项；null 表示清空
   */
  setSelection(selection: TreeSelection | null): void {
    // 路径与类型都没变时不广播，避免工具栏跟着无意义的重复选中重渲染
    if (this.selectionValue !== null && selection !== null) {
      if (this.selectionValue.path === selection.path && this.selectionValue.directory === selection.directory) return
    } else if (this.selectionValue === null && selection === null) {
      return
    }

    this.selectionValue = selection
    this.selectionListeners.emit()
  }

  subscribeSelection(listener: () => void): () => void {
    return this.selectionListeners.add(listener)
  }

  revealLine(path: string, line: number): void {
    this.actions.revealLine(path, line)
  }

  subscribeRevealLine(listener: (path: string, line: number) => void): () => void {
    return this.revealLineListeners.add(listener)
  }

  /**
   * 发布一次跳转请求；由编辑器区在打开标签后调用。
   * @param path 相对路径
   * @param line 行号（1 起）
   */
  publishRevealLine(path: string, line: number): void {
    this.revealLineListeners.emit(path, line)
  }

  /**
   * 弹一条右下角的临时提示（工作台唯一的消息提示通道）。
   *
   * 不打断操作、不需要关闭：到时自动消失，只保留最近几条，连续操作时旧的提示
   * 直接顶掉，避免在角落堆一列。
   * @param kind 类型，决定图标配色
   * @param message 正文
   */
  toast(kind: ToastKind, message: string): void {
    this.toastSequence += 1

    const toast: IdeToast = { id: this.toastSequence, kind, message }

    this.toastList = [...this.toastList, toast].slice(-3)
    this.toastListeners.emit()

    // 到时按 id 移除：期间可能又弹了新的提示，不能整列表清空
    setTimeout(() => {
      this.toastList = this.toastList.filter((item) => item.id !== toast.id)
      this.toastListeners.emit()
    }, TOAST_DURATION_MS)
  }

  subscribeToasts(listener: () => void): () => void {
    return this.toastListeners.add(listener)
  }

  toasts(): IdeToast[] {
    return this.toastList
  }

  dismissToast(id: number): void {
    this.toastList = this.toastList.filter((toast) => toast.id !== id)
    this.toastListeners.emit()
  }

  settings(): IdeSettingsView {
    return this.settingsValue
  }

  /**
   * 从宿主读取设置。
   */
  async loadSettings(): Promise<void> {
    const result = await apiGet<IdeSettingsView>('/settings')

    if (result.ok) {
      this.settingsValue = { ...DEFAULT_SETTINGS, ...result.value }
      this.settingsListeners.emit()
    }
  }

  updateSettings(patch: Partial<IdeSettingsView>): void {
    const next = { ...this.settingsValue, ...patch }

    this.settingsValue = next
    this.settingsListeners.emit()

    void apiPost<IdeSettingsView>('/settings', next).then((result) => {
      if (!result.ok) {
        console.error('[dsh-ide] 保存设置失败:', result.error)
        this.toast('error', `Settings were not saved: ${result.error.message}`)
      }
    })
  }

  subscribeSettings(listener: () => void): () => void {
    return this.settingsListeners.add(listener)
  }

  gitStatus(): ReadonlyMap<string, string> {
    return this.gitStatusValue
  }

  gitIgnored(): ReadonlySet<string> {
    return this.gitIgnoredValue
  }

  subscribeGitStatus(listener: () => void): () => void {
    return this.gitStatusListeners.add(listener)
  }

  /**
   * 从宿主拉取 Git 状态并映射成「相对路径 → 状态字母」。
   *
   * 项目树与状态栏都消费这份映射，所以只在总线里拉一次；并发触发直接合并。
   */
  refreshGitStatus(): void {
    if (this.rootValue === '' || this.gitStatusInFlight) return

    this.gitStatusInFlight = true

    void apiPost<{
      branch: string
      staged: { path: string; indexStatus: string; worktreeStatus: string }[]
      unstaged: { path: string; indexStatus: string; worktreeStatus: string }[]
      untracked: { path: string; indexStatus: string; worktreeStatus: string }[]
      conflicted: { path: string; indexStatus: string; worktreeStatus: string }[]
      ignored?: string[]
    }>('/git/exec', { method: 'status', cwd: this.rootValue })
      .then((result) => {
        if (result.ok === false) {
          // 不是仓库属于正常状态，不打扰用户；其余错误才提示
          if (result.error.code !== 'GIT_NOT_REPOSITORY') console.error('[dsh-ide] 读取 Git 状态失败:', result.error)
          this.gitStatusValue = new Map()
          this.gitIgnoredValue = new Set()
        } else {
          const map = new Map<string, string>()
          const value = result.value

          // 同一个文件可能同时在暂存区与工作区有状态（如已 add 的新增又改了），
          // 此时以索引区状态为准：IDEA 里 `A` + `M` 仍显示为绿色的新增。
          // 先写工作区状态，再让索引区状态与冲突覆盖它。
          for (const item of value.unstaged) map.set(item.path, item.worktreeStatus)
          for (const item of value.staged) map.set(item.path, item.indexStatus)
          for (const item of value.conflicted) map.set(item.path, 'C')
          for (const item of value.untracked) map.set(item.path, '?')

          this.gitStatusValue = map
          this.gitIgnoredValue = new Set(value.ignored ?? [])
        }

        this.gitStatusListeners.emit()
      })
      .finally(() => {
        this.gitStatusInFlight = false
      })
  }

  invalidate(path?: string): void {
    this.invalidateListeners.emit(path)
  }

  subscribeInvalidate(listener: (path?: string) => void): () => void {
    return this.invalidateListeners.add(listener)
  }

  openBottomPanel(id: string): void {
    this.actions.openBottomPanel(id)
  }

  requestRunConfigEdit(id: string): void {
    this.runConfigIntentValue = { kind: 'edit', id }
    this.runConfigIntentListeners.emit()
    this.actions.openBottomPanel('run')
  }

  requestRunConfigCreate(): void {
    this.runConfigIntentValue = { kind: 'create' }
    this.runConfigIntentListeners.emit()
    this.actions.openBottomPanel('run')
  }

  consumeRunConfigIntent(): RunConfigIntent | null {
    const intent = this.runConfigIntentValue
    this.runConfigIntentValue = null

    return intent
  }

  subscribeRunConfigIntent(listener: () => void): () => void {
    return this.runConfigIntentListeners.add(listener)
  }

  closeBottomPanel(): void {
    this.actions.closeBottomPanel()
  }

  openToolWindow(id: string): void {
    this.actions.openToolWindow(id)
  }

  openContextMenu(request: IdeContextMenuRequest): void {
    this.contextMenuValue = request
    this.contextMenuListeners.emit()
  }

  closeContextMenu(): void {
    if (this.contextMenuValue === null) return

    this.contextMenuValue = null
    this.contextMenuListeners.emit()
  }

  contextMenu(): IdeContextMenuRequest | null {
    return this.contextMenuValue
  }

  subscribeContextMenu(listener: () => void): () => void {
    return this.contextMenuListeners.add(listener)
  }
}
