/**
 * 键盘快捷键与命令面板。
 *
 * 工作台的快捷键集中在一处注册：分散到各 feature 里会出现「谁先监听谁生效」的
 * 冲突，也无法在命令面板里列全。这里只定义「动作」，具体执行走服务总线。
 *
 * 与 IDEA 对齐的组合键：
 * - `Cmd/Ctrl+Shift+P` 命令面板
 * - `Cmd/Ctrl+J` 开关底部面板
 * - `Cmd/Ctrl+Shift+E` 项目树
 * - `Cmd/Ctrl+Shift+G` 版本控制
 * - `Cmd/Ctrl+Shift+F` 全局搜索
 * - `Cmd/Ctrl+,` IDE 设置
 */import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { cn } from '../../common/cn'
import type { Translate } from '../../types/plugin'
import { bottomPanelFeatures, toolWindowFeatures } from '../features/registry'
import type { WorkbenchLayout } from './use-workbench-layout'

/** 一条命令。 */
export interface Command {
  /** 稳定 id。 */
  id: string
  /** 展示名称。 */
  title: string
  /** 快捷键提示。 */
  shortcut?: string
  /** 执行动作。 */
  run(): void
}

/** 命令面板与快捷键的接线参数。 */
export interface CommandPaletteProps {
  /** 外壳翻译函数。 */
  t: Translate
  /** 当前布局。 */
  layout: WorkbenchLayout
  /** 更新布局。 */
  update(patch: Partial<WorkbenchLayout>): void
  /** 打开设置页。 */
  openSettings(): void
}

/**
 * 构造全部命令。
 * @param props 面板参数
 * @returns 命令列表
 */
function buildCommands(props: CommandPaletteProps): Command[] {
  const { layout, t, update, openSettings } = props
  const commands: Command[] = []

  // 每个工具窗口一条「显示 / 隐藏」命令
  for (const feature of toolWindowFeatures) {
    const visible = layout.toolWindowActive === feature.id

    commands.push({
      id: `toolWindow.${feature.id}`,
      title: `${visible ? t('shell.hideToolWindow') : t('shell.showToolWindow')} ${t(`${feature.id}.title`)}`,
      run: () => update({ toolWindowActive: visible ? null : feature.id }),
    })
  }

  // 每个底部面板一条「显示」命令
  for (const feature of bottomPanelFeatures) {
    commands.push({
      id: `bottomPanel.${feature.id}`,
      title: `${t('shell.showBottomPanel')} ${t(`${feature.id}.title`)}`,
      run: () => update({ bottomPanelActive: feature.id, bottomPanelOpen: true }),
    })
  }

  commands.push(
    {
      id: 'bottomPanel.toggle',
      title: layout.bottomPanelOpen ? t('shell.hideBottomPanel') : t('shell.showBottomPanel'),
      shortcut: '⌘J',
      run: () => update({ bottomPanelOpen: !layout.bottomPanelOpen }),
    },
    {
      id: 'editor.welcome',
      title: t('shell.openWelcome'),
      run: () => update({ toolWindowActive: layout.toolWindowActive }),
    },
    {
      id: 'settings.open',
      title: t('shell.openSettings'),
      shortcut: '⌘,',
      run: openSettings,
    },
  )

  return commands
}

/**
 * 渲染命令面板与快捷键监听。
 *
 * 快捷键挂在 window 的 keydown 上并只处理带修饰键的组合：工作台是常驻面板，
 * 不能拦截用户在主聊天输入框里的按键。
 * @param props 见 CommandPaletteProps
 * @returns 打开时的命令列表；关闭时为空片段
 */
export function CommandPalette(props: CommandPaletteProps): React.ReactElement | null {
  const { layout, t, update, openSettings } = props
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  const commands = useMemo(() => buildCommands(props), [layout.toolWindowActive, layout.bottomPanelOpen, props, t, update, openSettings])

  // 快捷键监听
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const modifier = event.metaKey || event.ctrlKey
      if (!modifier) return

      // 命令面板
      if (event.shiftKey && event.key.toLowerCase() === 'p') {
        event.preventDefault()
        setOpen(true)
        setQuery('')

        return
      }

      // 开关底部面板
      if (!event.shiftKey && event.key.toLowerCase() === 'j') {
        event.preventDefault()
        update({ bottomPanelOpen: !layout.bottomPanelOpen })

        return
      }

      // 设置页
      if (event.key === ',') {
        event.preventDefault()
        openSettings()
      }
    }

    window.addEventListener('keydown', onKeyDown)

    return () => window.removeEventListener('keydown', onKeyDown)
  }, [layout.bottomPanelOpen, openSettings, update])

  // 打开后聚焦输入框
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase()

    return text === '' ? commands : commands.filter((command) => command.title.toLowerCase().includes(text))
  }, [commands, query])

  const close = useCallback(() => setOpen(false), [])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center bg-black/20 pt-24" onClick={close}>
      <div
        className="w-[420px] rounded-md border border-line2 bg-overlay p-2 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') close()
            if (event.key === 'Enter' && filtered[0] !== undefined) {
              filtered[0].run()
              close()
            }
          }}
          placeholder={t('shell.commandPlaceholder')}
          className="mb-1 w-full rounded border border-line2 bg-base px-2 py-1 text-xs text-primary outline-none focus:border-line4"
        />

        <div className="max-h-72 overflow-auto">
          {filtered.map((command) => (
            <button
              key={command.id}
              type="button"
              onClick={() => {
                command.run()
                close()
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs',
                'bg-transparent text-primary hover:bg-layer2',
              )}
            >
              {/* 命令名称 */}
              <span className="min-w-0 flex-1 truncate">{command.title}</span>

              {/* 快捷键提示 */}
              {command.shortcut !== undefined && <span className="shrink-0 text-secondary">{command.shortcut}</span>}
            </button>
          ))}

          {filtered.length === 0 && <div className="px-2 py-2 text-xs text-secondary">{t('shell.noCommand')}</div>}
        </div>
      </div>
    </div>
  )
}
