/**
 * 浏览器端入口：把工作台注册到宿主的三个承载面上。
 *
 * - 主区视图 `conversation.view`：会话顶部「对话 / 轨迹 / IDE」里的 IDE 页签；
 * - 右侧栏页签：`sidebarRightTabs` 注册 tab 类型 + `sidebar.right.pane.tab` 注册正文；
 * - 右侧栏浮窗：由宿主原生的浮出操作触发，插件不需要额外实现，只要页签注册正确。
 *
 * 由 build.ts 打包并包裹成 ModuleLoader 的工厂函数，React 来自宿主模块表。
 */
import React from 'react'

import cssText from '../../.build/styles.css'
import { collectFeatureLocales, mergeDictionaries } from '../common/locale'
import { scheduleStorageMaintenance } from '../common/storage-maintenance'
import { asTerminalRemote, setTerminalRemote } from '../common/terminal-remote'
import { registry } from './features/registry'
import { bindComposerMention } from './shell/composer-mention'
import { registerComposerBranch } from './shell/composer-branch'
import { registerIdePopup } from './shell/ide-popup'
import { registerIdeSettings } from './shell/ide-settings'
import { bindSessionSource, readSessionId } from './shell/session-cwd'
import { setWorkbenchDictionaries, useWorkbenchTranslate } from './shell/ide-translate'
import { Workbench } from './shell/Workbench'
import type {
  ClientPlugin,
  PluginContext,
  SidebarRightTabsApi,
  SlotsApi,
} from '../types/plugin'

/** 语言命名空间，与插件的其它字典互不干扰。 */
const LOCALE_NAMESPACE = 'dsh-ide'

/** 主区视图的注册 id；同时用于右侧栏 tab 类型 id。 */
const VIEW_ID = 'dsh-ide'

/** 右侧栏 tab 类型；不复用宿主的 files / terminal / git，避免接管已装插件的格子。 */
const TAB_KIND = 'ide'

/** 引导页入口 id，在同一 tab 类型内唯一。 */
const GUIDE_ID = 'ide'

/** 外壳自身的界面文案；feature 文案由各功能自带的 locales 提供。 */
const SHELL_DICTIONARIES: Record<string, Record<string, string>> = {
  zh: {
    // 会话顶部 View 页签的名称
    'shell.viewTitle': 'IDE',
    // 编辑器区顶部标签条的空态标题
    'shell.editorTitle': '编辑器',
    // 编辑器区没有任何打开文件时的主文案
    'shell.emptyEditor': '还没有打开文件',
    // 空态说明
    'shell.emptyEditorHint': '从左侧「项目」里双击文件即可打开。',
    // 设置页标签标题
    'shell.settingsTitle': 'IDE 设置',
    // 底部面板没有可用面板时的标题
    'shell.bottomPanelTitle': '面板',
    // 底部面板内容区空态文案
    'shell.emptyBottomPanel': '还没有可用的底部面板',
    // 底部面板关闭按钮的悬停提示
    'shell.closeBottomPanel': '关闭面板',
    // 状态栏最左侧的工作台标识
    'shell.statusLabel': 'IDE',
    // 状态栏：当前在主区视图里
    'shell.surfaceMain': '主区',
    // 状态栏：当前在右侧栏里
    'shell.surfaceSidebar': '右侧栏',
    // 状态栏：当前在对话页弹窗里
    'shell.surfaceDialog': '弹窗',
    // 弹窗入口按钮的悬停提示
    'shell.popupOpen': '在弹窗中打开 IDE',
    // 关闭弹窗的提示：入口按钮展开态与弹窗右上角关闭图标共用
    'shell.popupClose': '关闭 IDE 弹窗',
    // 设置页左侧导航项：IDE 分区
    'settings.nav': 'IDE',
    // 设置页 IDE 分区的标题
    'settings.title': 'IDE',
    // 设置项：是否在侧边栏底部显示 IDE 入口
    'settings.popupButton': '在侧边栏显示 IDE 入口',
    // 设置项说明
    'settings.popupButtonHint': '在左侧边栏底部显示 IDE 图标，点击即可在主区弹出 IDE；跟随当前会话的工作目录，缺少会话或目录时置灰',
    // 设置项：同一工作空间是否共用同一个 IDE（含同一项目的不同对话）
    'settings.sharedWorkspace': '同一工作空间共享同一个 IDE',
    // 设置项说明
    'settings.sharedWorkspaceHint': '开启后同一工作空间的不同对话、主区页签、右侧栏与弹窗看到同一份打开的文件与布局',
    // 设置项：IDE 工作台界面语言（只影响工作台，设置页跟随 DSH）
    'settings.ideLanguage': '语言',
    // 设置项说明：说明该语言与 DSH 界面语言互不影响
    'settings.ideLanguageHint': '只影响 IDE 工作台内的文案，不影响 DSH 设置页',
    // 语言选项：跟随 DSH 当前语言
    'settings.ideLanguageSystem': '跟随 DSH',
    // 语言选项：强制中文
    'settings.ideLanguageZh': '中文',
    // 语言选项：强制英文
    'settings.ideLanguageEn': 'English',
    // 状态栏：变更数标签
    'shell.changes': '变更',
    // 状态栏：承载面没有绑定会话时的说明
    'shell.noSession': '未绑定会话',
    // 右侧栏引导页上的入口标题
    'shell.guideTitle': 'IDE',
    // 右侧栏引导页上的入口说明
    'shell.guideDescription': '项目树、编辑器、差异对比、Git 与终端',
    // 关闭标签页的悬停提示
    'shell.closeTab': '关闭标签',
    // 关闭未保存标签的确认文案
    'shell.discardUnsaved': '这个标签有未保存的修改，关闭会丢失。',
    // 放弃改动并关闭
    'shell.discardAndClose': '放弃并关闭',
    // 取消按钮
    'shell.cancel': '取消',
    // 命令面板输入框占位
    'shell.commandPlaceholder': '输入命令名称…',
    // 命令面板没有匹配项
    'shell.noCommand': '没有匹配的命令',
    // 命令面板：显示某个工具窗口
    'shell.showToolWindow': '显示',
    // 命令面板：隐藏某个工具窗口
    'shell.hideToolWindow': '隐藏',
    // 命令面板：显示某个底部面板
    'shell.showBottomPanel': '打开',
    // 命令面板：隐藏底部面板
    'shell.hideBottomPanel': '关闭底部面板',
    // 命令面板：打开设置页
    'shell.openSettings': '打开 IDE 设置',
    // 主工具栏：当前分支
    'shell.detachedHead': 'HEAD',
    // 主工具栏：打开提交历史
    // 主工具栏：刷新
    'shell.refresh': '刷新',
    // 主工具栏：刷新中
    'shell.refreshing': '刷新中…',
    // 主工具栏：提交入口
    'shell.commit': '提交',
    // 主工具栏：打开设置
    'shell.settings': '设置',
    // 主工具栏：命令面板
    'shell.commandPalette': '命令面板',
    // 主工具栏：命令行角标
    'shell.runConfiguration': '运行配置',
    // 主工具栏：没有选中运行配置
    'shell.noConfiguration': '未配置运行项',
    // 主工具栏：新增运行配置
    'shell.addConfiguration': '新增配置…',
    // 主工具栏：编辑某条运行配置
    'shell.editConfiguration': '编辑',
    // 主工具栏：删除某条运行配置
    'shell.deleteConfiguration': '删除',
    // 删除确认框标题
    'shell.deleteConfigurationTitle': '删除运行配置',
    // 主工具栏：删除确认
    'shell.deleteConfigurationConfirm': '确定删除运行配置「{name}」吗？',
    // 主工具栏：运行
    'shell.run': '运行',
    // 主工具栏：更多操作
    'shell.moreActions': '更多操作',
    // 主工具栏：添加到版本控制
    'shell.add': '添加',
    // 主工具栏：推送到远端
    'shell.push': '推送',
    // 主工具栏：更新工程
    'shell.updateProject': '更新工程',
    // 主工具栏：显示差异
    'shell.showDiff': '显示差异',
    // 主工具栏：显示差异不可用——项目树没有选中项
    'shell.diffRequiresSelection': '请先在项目树中选中一个文件',
    // 主工具栏：显示差异不可用——选中的是目录
    'shell.diffRequiresFile': '目录没有可显示的差异',
    // 主工具栏：显示差异不可用——选中的文件没有变更
    'shell.diffNoChanges': '选中的文件没有变更',
    // 主工具栏：回滚选中的改动
    'shell.rollback': '回滚',
    // 主工具栏：提交历史
    'shell.showHistory': '提交历史',
    // 主工具栏：查看历史时没有打开任何文件
    'shell.historyRequiresFile': '请先在编辑器中打开一个文件',
    // 主工具栏：打开分支选择弹窗
    'shell.selectBranch': '切换分支',
    // 主工具栏：工作区不是 Git 仓库时，点 Git 区弹出的确认框标题
    'shell.gitNotRepositoryTitle': 'Git 未初始化',
    // 主工具栏：确认框正文——是否在当前目录初始化 Git 仓库
    'shell.gitNotRepositoryMessage': '当前工作区不是 Git 仓库，是否在此目录初始化 Git 仓库？',
    // 主工具栏：确认框里的初始化按钮
    'shell.gitInitConfirm': '初始化',
    // 提示：Git 仓库初始化成功
    'shell.gitInitDone': '已初始化 Git 仓库',
    // 提示：Git 仓库初始化失败
    'shell.gitInitFailed': '初始化 Git 仓库失败，请确认 Git 已安装',
    // 对话页输入行：分支弹窗里依赖工作台的动作改由提示说明去哪里执行
    'shell.composerBranchInIde': '该操作请在 IDE 工作台中执行',
    // 右下角提示：关闭这条提示
    'shell.dismissToast': '关闭提示',
    // 右下角提示：展开更多操作
    'shell.toastMore': '更多操作',
    // 右下角提示：复制提示内容
    'shell.copyToastMessage': '复制内容',
    // 右下角提示：点击正文复制成功后的短暂确认
    'shell.toastCopied': '已复制',
    // 右键菜单：全局搜索入口（暂未实现）
    'shell.menuSearchEverywhere': '全局搜索',
    // 右键菜单：重新加载工作区状态与 Git 状态
    'shell.menuRefresh': '重新加载',
    // 工具栏右键：自定义工具栏（暂未实现）
    'shell.menuCustomizeToolbar': '自定义工具栏…',
    // 工具栏右键：显示工具栏（暂未实现）
    'shell.menuShowToolbar': '显示工具栏',
    // 工具栏右键：隐藏工具栏（暂未实现）
    'shell.menuHideToolbar': '隐藏工具栏',
    // 工具条右键：显示全部工具窗口（暂未实现）
    'shell.menuShowAllToolWindows': '显示全部工具窗口',
    // 工具条右键：隐藏全部工具窗口（暂未实现）
    'shell.menuHideAllToolWindows': '隐藏全部工具窗口',
    // 标签右键：关闭当前标签
    'shell.menuClose': '关闭',
    // 标签右键：关闭其他标签
    'shell.menuCloseOthers': '关闭其他标签',
    // 标签右键：关闭全部标签
    'shell.menuCloseAll': '全部关闭',
    // 标签右键：关闭左侧标签
    'shell.menuCloseLeft': '关闭左侧标签',
    // 标签右键：关闭右侧标签
    'shell.menuCloseRight': '关闭右侧标签',
    // 标签右键：固定标签（暂未实现）
    'shell.menuPinTab': '固定标签',
    // 标签右键：向右分屏（暂未实现）
    'shell.menuSplitRight': '向右分屏',
    // 标签右键：向下分屏（暂未实现）
    'shell.menuSplitDown': '向下分屏',
    // 标签右键：本地历史（暂未实现）
    'shell.menuLocalHistory': '本地历史',
    // 标签右键：复制文件路径
    'shell.menuCopyPath': '复制路径',
    // 复制路径失败的提示
    'shell.menuCopyPathFailed': '复制路径失败',
    // 标签右键：在系统文件管理器中显示该文件
    'shell.menuOpenInFinder': '在 Finder 中显示',
    // 批量关闭时保留未保存标签的说明
    'shell.menuDirtyKept': '有未保存改动的标签已保留',
    // 底部面板右键：隐藏面板
    'shell.menuHidePanel': '隐藏',
    // 底部面板右键：调整停靠位置（暂未实现）
    'shell.menuMoveTo': '移到',
    // 底部面板右键：浮动成窗口（暂未实现）
    'shell.menuFloat': '浮动窗口',
    // 底部面板右键：切换视图模式（暂未实现）
    'shell.menuViewMode': '视图模式',
    // 状态栏右键：显示状态栏（暂未实现）
    'shell.menuShowStatusBar': '显示状态栏',
    // 文本菜单：撤销
    'shell.menuUndo': '撤销',
    // 文本菜单：重做
    'shell.menuRedo': '重做',
    // 文本菜单：剪切
    'shell.menuCut': '剪切',
    // 文本菜单：复制
    'shell.menuCopy': '复制',
    // 文本菜单：粘贴
    'shell.menuPaste': '粘贴',
    // 文本菜单：全选
    'shell.menuSelectAll': '全选',
  },
  en: {
    'shell.viewTitle': 'IDE',
    'shell.editorTitle': 'Editor',
    'shell.emptyEditor': 'No file is open',
    'shell.emptyEditorHint': 'Double-click a file in the Project tool window to open it.',
    'shell.settingsTitle': 'IDE Settings',
    'shell.bottomPanelTitle': 'Panel',
    'shell.emptyBottomPanel': 'No bottom panel is available yet',
    'shell.closeBottomPanel': 'Close panel',
    'shell.statusLabel': 'IDE',
    'shell.surfaceMain': 'Main',
    'shell.surfaceSidebar': 'Sidebar',
    // 状态栏：当前在对话页弹窗里
    'shell.surfaceDialog': 'Dialog',
    // 弹窗入口按钮的悬停提示
    'shell.popupOpen': 'Open IDE in a dialog',
    // 关闭弹窗的提示：入口按钮展开态与弹窗右上角关闭图标共用
    'shell.popupClose': 'Close IDE dialog',
    // 设置页左侧导航项：IDE 分区
    'settings.nav': 'IDE',
    // 设置页 IDE 分区的标题
    'settings.title': 'IDE',
    // 设置项：是否在侧边栏底部显示 IDE 入口
    'settings.popupButton': 'Show the IDE entry in the sidebar',
    // 设置项说明
    'settings.popupButtonHint': 'Adds an IDE icon at the bottom of the left sidebar that opens the IDE over the main area; it follows the current conversation and stays disabled without a conversation or working directory',
    // 设置项：同一工作空间是否共用同一个 IDE（含同一项目的不同对话）
    'settings.sharedWorkspace': 'Share one IDE per workspace',
    // 设置项说明
    'settings.sharedWorkspaceHint': 'Conversations, the view tab, the right sidebar and the dialog of one workspace then show the same open files and layout',
    // 设置项：IDE 工作台界面语言（只影响工作台，设置页跟随 DSH）
    'settings.ideLanguage': 'Language',
    // 设置项说明：说明该语言与 DSH 界面语言互不影响
    'settings.ideLanguageHint': 'Applies to the IDE workbench only; the DSH settings page keeps following DSH',
    // 语言选项：跟随 DSH 当前语言
    'settings.ideLanguageSystem': 'Follow DSH',
    // 语言选项：强制中文
    'settings.ideLanguageZh': '中文',
    // 语言选项：强制英文
    'settings.ideLanguageEn': 'English',
    'shell.changes': 'Changes',
    'shell.noSession': 'No session',
    'shell.guideTitle': 'IDE',
    'shell.guideDescription': 'Project tree, editor, diff, Git and terminal',
    'shell.closeTab': 'Close tab',
    'shell.discardUnsaved': 'This tab has unsaved changes that will be lost.',
    'shell.discardAndClose': 'Discard and close',
    'shell.cancel': 'Cancel',
    'shell.commandPlaceholder': 'Type a command…',
    'shell.noCommand': 'No matching command',
    'shell.showToolWindow': 'Show',
    'shell.hideToolWindow': 'Hide',
    'shell.showBottomPanel': 'Open',
    'shell.hideBottomPanel': 'Close bottom panel',
    'shell.openSettings': 'Open IDE settings',
    'shell.detachedHead': 'HEAD',
    'shell.refresh': 'Refresh',
    'shell.refreshing': 'Refreshing…',
    'shell.commit': 'Commit',
    'shell.settings': 'Settings',
    'shell.commandPalette': 'Command palette',
    'shell.runConfiguration': 'Run Configurations',
    'shell.noConfiguration': 'No configuration',
    'shell.addConfiguration': 'Add Configuration…',
    'shell.editConfiguration': 'Edit',
    'shell.deleteConfiguration': 'Delete',
    'shell.deleteConfigurationTitle': 'Delete Run Configuration',
    'shell.deleteConfigurationConfirm': 'Delete run configuration "{name}"?',
    'shell.run': 'Run',
    'shell.moreActions': 'More Actions',
    'shell.add': 'Add',
    'shell.push': 'Push',
    'shell.updateProject': 'Update Project',
    'shell.showDiff': 'Show Diff',
    // 主工具栏：显示差异不可用——项目树没有选中项
    'shell.diffRequiresSelection': 'Select a file in the project tree',
    // 主工具栏：显示差异不可用——选中的是目录
    'shell.diffRequiresFile': 'Folders have no diff to show',
    // 主工具栏：显示差异不可用——选中的文件没有变更
    'shell.diffNoChanges': 'The selected file has no changes',
    'shell.rollback': 'Rollback',
    'shell.showHistory': 'Show History',
    // 主工具栏：查看历史时没有打开任何文件
    'shell.historyRequiresFile': 'Open a file in the editor first',
    'shell.selectBranch': 'Select Branch',
    // 主工具栏：工作区不是 Git 仓库时，点 Git 区弹出的确认框标题
    'shell.gitNotRepositoryTitle': 'Git is not initialized',
    // 主工具栏：确认框正文——是否在当前目录初始化 Git 仓库
    'shell.gitNotRepositoryMessage': 'This workspace is not a Git repository. Initialize Git in this directory?',
    // 主工具栏：确认框里的初始化按钮
    'shell.gitInitConfirm': 'Initialize',
    // 提示：Git 仓库初始化成功
    'shell.gitInitDone': 'Git repository initialized',
    // 提示：Git 仓库初始化失败
    'shell.gitInitFailed': 'Failed to initialize the Git repository. Make sure Git is installed',
    // 对话页输入行：分支弹窗里依赖工作台的动作改由提示说明去哪里执行
    'shell.composerBranchInIde': 'Use the IDE workbench for this action',
    'shell.dismissToast': 'Dismiss',
    'shell.toastMore': 'More Actions',
    'shell.copyToastMessage': 'Copy Message',
    'shell.toastCopied': 'Copied',
    'shell.menuSearchEverywhere': 'Search Everywhere',
    'shell.menuRefresh': 'Reload',
    'shell.menuCustomizeToolbar': 'Customize Toolbar…',
    'shell.menuShowToolbar': 'Show Toolbar',
    'shell.menuHideToolbar': 'Hide Toolbar',
    'shell.menuShowAllToolWindows': 'Show All Tool Windows',
    'shell.menuHideAllToolWindows': 'Hide All Tool Windows',
    'shell.menuClose': 'Close',
    'shell.menuCloseOthers': 'Close Other Tabs',
    'shell.menuCloseAll': 'Close All Tabs',
    'shell.menuCloseLeft': 'Close Tabs to the Left',
    'shell.menuCloseRight': 'Close Tabs to the Right',
    'shell.menuPinTab': 'Pin Tab',
    'shell.menuSplitRight': 'Split Right',
    'shell.menuSplitDown': 'Split Down',
    'shell.menuLocalHistory': 'Local History',
    'shell.menuCopyPath': 'Copy Path/Reference…',
    'shell.menuCopyPathFailed': 'Could not copy the path',
    'shell.menuOpenInFinder': 'Open In Finder',
    'shell.menuDirtyKept': 'Tabs with unsaved changes were kept open',
    'shell.menuHidePanel': 'Hide',
    'shell.menuMoveTo': 'Move to',
    'shell.menuFloat': 'Float',
    'shell.menuViewMode': 'View Mode',
    'shell.menuShowStatusBar': 'Show Status Bar',
    'shell.menuUndo': 'Undo',
    'shell.menuRedo': 'Redo',
    'shell.menuCut': 'Cut',
    'shell.menuCopy': 'Copy',
    'shell.menuPaste': 'Paste',
    'shell.menuSelectAll': 'Select All',
  },
}

/**
 * 外壳字典与全部 feature 字典的合并结果；feature key 已带 id 前缀，不会互相覆盖。
 * 各语言字典原样注册，界面文案跟随宿主当前语言——宿主切换语言后即读取对应字典。
 */
const LOCALE_DICTIONARIES = mergeDictionaries(SHELL_DICTIONARIES, collectFeatureLocales(registry.list))

/** 客户端插件定义。 */
const plugin: ClientPlugin = {
  inject: ['slots', 'locale'],

  apply(ctx: PluginContext) {
    // 旧版本前缀的界面记录在空闲帧清理：当前代码不再读取它们，留着只会占用本源
    // 配额；不放到激活路径上，避免和首屏渲染抢主线程
    ctx.effect(() => scheduleStorageMaintenance(), 'dsh-ide: storage maintenance')

    // 样式随插件生命周期注入和移除，不向宿主留下全局副作用
    ctx.effect(() => {
      const style = document.createElement('style')
      style.setAttribute('data-dsh-plugin', 'dsh-ide')
      style.textContent = cssText
      document.head.appendChild(style)

      return () => {
        style.remove()
        // 终端 chunk 自己注入的 xterm 样式一并清掉，避免卸载后残留
        document.querySelectorAll('style[data-dsh-plugin="dsh-ide-terminal"]').forEach((element) => element.remove())
      }
    })

    // 字典随插件卸载一并注销，避免残留同名命名空间
    ctx.effect(() => {
      const disposers = Object.entries(LOCALE_DICTIONARIES).map(([locale, dictionary]) =>
        ctx.locale.register(LOCALE_NAMESPACE, locale, dictionary),
      )

      return () => disposers.forEach((dispose) => dispose())
    })

    // 工作台按「IDE 语言」偏好查这份字典；卸载后清空，避免热重载后仍指向旧字典
    ctx.effect(() => {
      setWorkbenchDictionaries(LOCALE_DICTIONARIES)

      return () => setWorkbenchDictionaries({})
    })

    // 会话列表订阅：工作台用它把 sessionId 映射到会话 cwd
    ctx.effect(() => bindSessionSource(ctx), 'dsh-ide: session cwd')

    // 「@到对话」按 sessionId 取宿主 composer，需要一份随插件生命周期的根上下文
    ctx.effect(() => bindComposerMention(ctx), 'dsh-ide: composer mention')

    // 终端走宿主 remote.terminal；服务缺席时只降级终端，不影响其余功能
    ctx.inject(['remote', 'remote.terminal'], (scoped) => {
      const terminal = asTerminalRemote(scoped.get?.('remote'))

      if (terminal === undefined) {
        console.error('[dsh-ide] 宿主未提供 remote.terminal，终端不可用')

        return
      }

      scoped.effect(() => {
        setTerminalRemote(terminal)

        return () => setTerminalRemote(undefined)
      }, 'dsh-ide: terminal remote')
    })

    const t = ctx.locale.bind(LOCALE_NAMESPACE)

    // 侧边栏的 IDE 入口：按钮在侧边栏底部，弹窗在应用级覆盖层
    registerIdePopup(ctx, t)

    // 聊天输入行的分支名称：与 IDE 顶部菜单同源，点击弹出分支选择弹窗
    registerComposerBranch(ctx, t)

    // 设置页的 IDE 分区：弹窗按钮显隐、同一工作空间是否共用同一个 IDE
    registerIdeSettings(ctx, t)

    /** 主区视图正文：会话顶部「IDE」页签打开的内容。 */
    const MainView = (props: Record<string, unknown>) => {
      // 工作台文案按「IDE 语言」偏好取，宿主设置页仍走宿主翻译函数
      const workbenchT = useWorkbenchTranslate(t)

      return <Workbench t={workbenchT} sessionId={readSessionId(props)} surface="main" />
    }

    /** 右侧栏正文：页签与浮窗共用同一个组件。 */
    const SidebarView = (props: Record<string, unknown>) => {
      const workbenchT = useWorkbenchTranslate(t)

      return <Workbench t={workbenchT} sessionId={readSessionId(props)} surface="sidebar" />
    }

    // 形态 A：主区视图。order 30 让它排在「对话」(0) 与「轨迹」(10) 之后
    ctx.slots.inject('conversation.view', () =>
      ctx.slots.register(
        {
          name: 'conversation.view',
          id: VIEW_ID,
          order: 30,
          locale: LOCALE_NAMESPACE,
          label: () => t('shell.viewTitle'),
        },
        MainView,
      ),
    )

    // 形态 B/C：右侧栏 tab 类型与正文。服务缺失时只跳过这两个形态
    ctx.inject(['sidebarRightTabs', 'slots'], (scoped) => {
      const tabs = scoped.get?.('sidebarRightTabs') as SidebarRightTabsApi | undefined
      const slots = scoped.get?.('slots') as SlotsApi | undefined

      if (tabs === undefined || typeof tabs.register !== 'function') {
        console.error('[dsh-ide] 宿主未提供 sidebarRightTabs，右侧栏形态不可用')

        return
      }

      if (slots === undefined || typeof slots.inject !== 'function') {
        console.error('[dsh-ide] 宿主未提供 slots，右侧栏形态不可用')

        return
      }

      scoped.effect(() => {
        const disposeType = tabs.register({
          id: VIEW_ID,
          kind: TAB_KIND,
          title: () => t('shell.viewTitle'),
          // 切走页签不卸载正文，保住已打开的文件与布局
          keepMounted: true,
          guide: [
            {
              id: GUIDE_ID,
              order: 20,
              title: () => t('shell.guideTitle'),
              description: () => t('shell.guideDescription'),
            },
          ],
        })

        // 宿主不同版本的 inject 返回值不一致：可能是注销函数，也可能由宿主自行管理
        const disposeBody = slots.inject('sidebar.right.pane.tab', () =>
          slots.register({ name: 'sidebar.right.pane.tab', key: VIEW_ID }, SidebarView),
        )

        return () => {
          if (typeof disposeBody === 'function') disposeBody()
          disposeType()
        }
      })
    })
  },
}

export default plugin
