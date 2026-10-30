/**
 * IDE feature 契约。
 *
 * 与 all-in-one 的差异：那边的 feature 只有「设置页卡片」一种形态（entry/page 或 switch），
 * 这里的功能是**常驻槽位**，因此按「渲染到哪里」分类，而不是按「有没有独立页面」分类。
 * 五类槽位互斥，各自只要求一个必需字段，具体校验见 registry.ts。
 *
 * 服务接口也定义在这里：feature 只能依赖契约，不能反向 import 外壳实现，
 * 否则「功能自包含、壳子零功能」的边界会在第一次需要共享状态时被打破。
 */
import type { ComponentType, ReactNode } from 'react'

import type { IdeContextMenuRequest } from '../../common/context-menu'
import type { LocaleDictionaries } from '../../common/locale'
import type { FeatureHostExtension } from '../../types/host'
import type { Translate } from '../../types/plugin'

// 右键菜单的请求类型定义在公共层：feature 只依赖契约，不直接 import 外壳
export type { IdeContextMenuRequest } from '../../common/context-menu'

/** 差异来源：三种来源共用同一套渲染器。 */
export type DiffSource =
  | { kind: 'worktree'; path: string; staged: boolean }
  | { kind: 'commits'; from: string; to: string; path?: string }
  | { kind: 'files'; left: string; right: string }

/** 编辑器标签页的身份，决定持久化与去重键。 */
export interface EditorTabKey {
  /** 标签类型：文件、差异、冲突或内置页面。 */
  kind: 'file' | 'diff' | 'settings' | 'conflict'
  /** 同类型内的唯一标识（路径、差异源序列化串等）。 */
  id: string
}

/** 一个打开的编辑器标签页。 */
export interface EditorTab {
  /** 标签身份。 */
  key: EditorTabKey
  /** 标签标题。 */
  title: string
  /** 差异来源；仅 diff 标签有值。 */
  source?: DiffSource
  /** 文件相对工作区根的路径；仅 file 标签有值。 */
  path?: string
  /** 是否处于未保存状态。 */
  dirty?: boolean
}

/** 通知条的种类。 */
export type NoticeKind = 'info' | 'error' | 'success'

/** 一条通知。 */
export interface Notice {
  /** 自增 id。 */
  id: number
  /** 类型，决定配色。 */
  kind: NoticeKind
  /** 正文。 */
  message: string
  /** 可选操作按钮文案；点它执行 action。 */
  actionLabel?: string
  /** 可选操作。 */
  action?: () => void
}

/** 右下角的一条临时提示；几秒后自动消失，不占通知条的位置。 */
export interface IdeToast {
  /** 自增 id。 */
  id: number
  /** 类型，决定图标与配色。 */
  kind: NoticeKind
  /** 正文。 */
  message: string
}

/** 工作台对 feature 暴露的能力。feature 只能通过这些入口与外界交互。 */
export interface IdeServices {
  /** 当前会话的工作区根（绝对路径）；未绑定时为空串。 */
  readonly root: string
  /** 订阅工作区根变化。 */
  subscribeRoot(listener: () => void): () => void
  /** 打开文件（相对工作区根的路径），已打开时聚焦。 */
  openFile(path: string): void
  /** 打开差异视图。 */
  openDiff(source: DiffSource): void
  /** 打开内置页面。 */
  openPage(kind: 'settings'): void
  /** 打开冲突解决视图。 */
  openConflict(path: string): void
  /** 当前活动文件（相对路径）；没有时为 null。 */
  activeFile(): string | null
  /** 订阅活动文件变化。 */
  subscribeActiveFile(listener: () => void): () => void
  /** 打开文件并跳到指定行（1 起）；由编辑器标签自行消费这次跳转请求。 */
  revealLine(path: string, line: number): void
  /** 订阅跳转请求；编辑器只认路径与自己一致的请求。 */
  subscribeRevealLine(listener: (path: string, line: number) => void): () => void
  /** 弹一条通知。 */
  notify(kind: NoticeKind, message: string, action?: { label: string; run: () => void }): void
  /** 订阅通知列表（外壳渲染通知条）。 */
  subscribeNotices(listener: () => void): () => void
  /** 当前通知列表。 */
  notices(): Notice[]
  /** 关闭一条通知。 */
  dismissNotice(id: number): void
  /** 在右下角弹一条临时提示，几秒后自动消失。 */
  toast(kind: NoticeKind, message: string): void
  /** 订阅临时提示列表（外壳渲染右下角的提示层）。 */
  subscribeToasts(listener: () => void): () => void
  /** 当前临时提示列表。 */
  toasts(): IdeToast[]
  /** 关掉一条临时提示。 */
  dismissToast(id: number): void
  /** 全局设置。 */
  settings(): IdeSettingsView
  /** 保存设置补丁。 */
  updateSettings(patch: Partial<IdeSettingsView>): void
  /** 订阅设置变化。 */
  subscribeSettings(listener: () => void): () => void
  /** Git 状态映射：相对路径 → 状态字母。 */
  gitStatus(): ReadonlyMap<string, string>
  /** 被 .gitignore 忽略的路径集合；目录条目以 / 结尾。 */
  gitIgnored(): ReadonlySet<string>
  /** 订阅 Git 状态变化。 */
  subscribeGitStatus(listener: () => void): () => void
  /** 立即刷新 Git 状态。 */
  refreshGitStatus(): void
  /** 触发一次统一的「文件系统可能变了」广播。 */
  invalidate(path?: string): void
  /** 订阅文件系统变更广播。 */
  subscribeInvalidate(listener: (path?: string) => void): () => void
  /** 展开某个底部面板（终端、搜索…）。 */
  openBottomPanel(id: string): void
  /** 收起当前底部面板。 */
  closeBottomPanel(): void
  /** 切换到某个工具窗口。 */
  openToolWindow(id: string): void
  /** 在指针位置弹出右键菜单；新菜单直接替换旧菜单。 */
  openContextMenu(request: IdeContextMenuRequest): void
  /** 关闭当前右键菜单。 */
  closeContextMenu(): void
  /** 当前右键菜单；null 表示未打开。 */
  contextMenu(): IdeContextMenuRequest | null
  /** 订阅右键菜单变化。 */
  subscribeContextMenu(listener: () => void): () => void
  /** 打开运行面板并让它编辑指定配置。 */
  requestRunConfigEdit(id: string): void
  /** 打开运行面板并让它进入新建状态。 */
  requestRunConfigCreate(): void
  /** 取走待处理的配置意图；无待办时返回 null。 */
  consumeRunConfigIntent(): RunConfigIntent | null
  /** 订阅配置意图变化。 */
  subscribeRunConfigIntent(listener: () => void): () => void
}

/** 运行配置的跨组件意图：编辑某条，或新建一条。 */
export type RunConfigIntent = { kind: 'edit'; id: string } | { kind: 'create' }

/** 设置里客户端可见的字段（与宿主侧 IdeSettings 对应）。 */
export interface IdeSettingsView {
  /** 编辑器字号。 */
  fontSize: number
  /** 编辑器行距，相对字号的倍数。 */
  lineHeight: number
  /** 制表宽度。 */
  tabSize: number
  /** 是否自动保存。 */
  autoSave: boolean
  /** 自动保存的静止时长。 */
  autoSaveDelayMs: number
  /** 差异上下文行数。 */
  diffContext: number
  /** 搜索排除 glob。 */
  searchExclude: string
  /** 诊断命令。 */
  diagnoseCommand: string
  /** 终端默认 shell。 */
  terminalShell: string
  /** 工作台配色：跟随宿主、强制浅色或强制深色。 */
  theme: 'system' | 'light' | 'dark'
  /** 更新工程时远端改动进入当前分支的方式。 */
  updateProjectMode: UpdateProjectMode
  /** 更新工程时是否跳过方式选择对话框，直接按上次的选择执行。 */
  updateProjectSkipDialog: boolean
}

/** 更新工程的方式：合并进当前分支，或把当前分支变基到远端之上。 */
export type UpdateProjectMode = 'merge' | 'rebase'

/** feature 视图收到的 props。 */
export interface FeatureViewProps {
  /** 已绑定本 feature 前缀的翻译函数，组件内直接用 `title` 这类短 key。 */
  t: Translate
  /** 当前会话 id；承载面未绑定会话时是空串。 */
  sessionId: string
  /** 工作台服务总线。 */
  services: IdeServices
}

/** 编辑器区的标签类型：按地址认领内容并渲染。 */
export interface EditorContribution {
  /** 认领一个资源地址；返回 true 表示该地址由本类型渲染。 */
  canOpen(address: string): boolean
  /**
   * 渲染指定地址的内容。
   *
   * `source` 只对差异标签有值：外壳已经把差异源解析成标签身份，渲染器不必再
   * 从地址字符串里反序列化。
   */
  render: ComponentType<FeatureViewProps & { address: string; source?: DiffSource }>
}

/** feature 的槽位形态。 */
export type FeatureSlot = 'toolWindow' | 'bottomPanel' | 'editorTab' | 'statusBar' | 'service'

/**
 * 一条 IDE feature。
 *
 * 五个槽位字段互斥：
 *   toolWindow / bottomPanel  → view
 *   editorTab                 → editor
 *   statusBar                 → status
 *   service                   → host
 */
export interface IdeFeature {
  /** 唯一标识，同时作为语言 key 前缀与持久化 key，重复时只保留第一个。 */
  id: string
  /** 槽位形态，决定外壳从哪里读取组件。 */
  slot: FeatureSlot
  /** 本功能的中英文文案，外壳统一加 `<id>.` 前缀后注册。 */
  locales: LocaleDictionaries
  /** 排序权重，越小越靠前，默认 100，相同权重保持注册顺序。 */
  order?: number
  /** 工具条按钮与引导胶囊的图标；自带 SVG，不依赖宿主图标集。 */
  icon?: () => ReactNode
  /** toolWindow / bottomPanel 的主体。 */
  view?: ComponentType<FeatureViewProps>
  /** editorTab 的贡献。 */
  editor?: EditorContribution
  /** statusBar 的条目。 */
  status?: ComponentType<FeatureViewProps>
  /** 宿主侧扩展（路由、进程、目录监听）。 */
  host?: FeatureHostExtension
  /** 默认占用的位置：`primary` 表示打开工作台时就显示。 */
  defaultActive?: boolean
  /** 容器宽度小于该阈值时仍然显示在工具条上（默认全部显示）。 */
  compactHidden?: boolean
  /**
   * 是否隐藏外壳的底部面板标题栏。
   *
   * 像 Git 这样自带 IDEA 风格页签头部的面板需要整块头部空间；隐藏后由 feature
   * 自己渲染关闭入口，避免出现两条标题栏。
   */
  hideHeader?: boolean
}
