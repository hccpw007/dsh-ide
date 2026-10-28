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
import { asTerminalRemote, setTerminalRemote } from '../common/terminal-remote'
import { registry } from './features/registry'
import { bindSessionSource } from './shell/session-cwd'
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
    // 最近打开的文件标题
    'shell.recentFiles': '最近打开',
    // 欢迎页标签标题
    'shell.welcomeTitle': '欢迎',
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
    // 状态栏：没有活动文件
    'shell.noFile': '未打开文件',
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
    // 新建标签（打开欢迎页）的悬停提示
    'shell.openWelcome': '打开欢迎页',
    // 关闭未保存标签的确认文案
    'shell.discardUnsaved': '这个标签有未保存的修改，关闭会丢失。',
    // 放弃改动并关闭
    'shell.discardAndClose': '放弃并关闭',
    // 取消按钮
    'shell.cancel': '取消',
    // 通知条关闭按钮
    'shell.dismissNotice': '关闭通知',
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
  },
  en: {
    'shell.viewTitle': 'IDE',
    'shell.editorTitle': 'Editor',
    'shell.emptyEditor': 'No file is open',
    'shell.emptyEditorHint': 'Double-click a file in the Project tool window to open it.',
    'shell.recentFiles': 'Recent',
    'shell.welcomeTitle': 'Welcome',
    'shell.settingsTitle': 'IDE Settings',
    'shell.bottomPanelTitle': 'Panel',
    'shell.emptyBottomPanel': 'No bottom panel is available yet',
    'shell.closeBottomPanel': 'Close panel',
    'shell.statusLabel': 'IDE',
    'shell.surfaceMain': 'Main',
    'shell.surfaceSidebar': 'Sidebar',
    'shell.noFile': 'No file',
    'shell.changes': 'Changes',
    'shell.noSession': 'No session',
    'shell.guideTitle': 'IDE',
    'shell.guideDescription': 'Project tree, editor, diff, Git and terminal',
    'shell.closeTab': 'Close tab',
    'shell.openWelcome': 'Open welcome page',
    'shell.discardUnsaved': 'This tab has unsaved changes that will be lost.',
    'shell.discardAndClose': 'Discard and close',
    'shell.cancel': 'Cancel',
    'shell.dismissNotice': 'Dismiss',
    'shell.commandPlaceholder': 'Type a command…',
    'shell.noCommand': 'No matching command',
    'shell.showToolWindow': 'Show',
    'shell.hideToolWindow': 'Hide',
    'shell.showBottomPanel': 'Open',
    'shell.hideBottomPanel': 'Close bottom panel',
    'shell.openSettings': 'Open IDE settings',
  },
}

/** 外壳字典与全部 feature 字典的合并结果；feature key 已带 id 前缀，不会互相覆盖。 */
const LOCALE_DICTIONARIES = mergeDictionaries(SHELL_DICTIONARIES, collectFeatureLocales(registry.list))

/**
 * 从宿主传入的插槽 props 里取出会话 id。
 *
 * 不同承载面给 props 的形状并不一致，这里只认字符串形态的 sessionId，
 * 取不到就当未绑定会话，绝不猜一个 id 去访问别人的工作区。
 * @param props 宿主传给插槽组件的 props
 * @returns 会话 id；没有时为空串
 */
function readSessionId(props: Record<string, unknown>): string {
  return typeof props.sessionId === 'string' ? props.sessionId : ''
}

/** 客户端插件定义。 */
const plugin: ClientPlugin = {
  inject: ['slots', 'locale'],

  apply(ctx: PluginContext) {
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

    // 会话列表订阅：工作台用它把 sessionId 映射到会话 cwd
    ctx.effect(() => bindSessionSource(ctx), 'dsh-ide: session cwd')

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

    /** 主区视图正文：会话顶部「IDE」页签打开的内容。 */
    const MainView = (props: Record<string, unknown>) => (
      <Workbench t={t} sessionId={readSessionId(props)} surface="main" />
    )

    /** 右侧栏正文：页签与浮窗共用同一个组件。 */
    const SidebarView = (props: Record<string, unknown>) => (
      <Workbench t={t} sessionId={readSessionId(props)} surface="sidebar" />
    )

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
