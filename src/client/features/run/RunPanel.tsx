/**
 * 运行配置面板。
 *
 * 配置存在宿主侧（`$DSH_HOME/dsh-ide/run-configs.json`，按工作目录分组），
 * 进程也在宿主侧跑：关掉工作台不会杀掉 dev server，重新打开能看到仍在运行的
 * 实例与最新输出。
 *
 * 输出用「已消费字节数」做增量拉取，客户端不保留全量历史。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'

import { apiGet } from '../../../common/api'
import {
  deleteRunConfig,
  readRunConfigs,
  saveRunConfig,
  startRun,
  stopRun,
  type RunConfig,
  type RunProcess,
} from './api'
import type { FeatureViewProps } from '../../shell/contract'
import { ContextMenu, type MenuItem, type MenuState } from '../git/menu'
import { RunOutput } from './RunOutput'
import { RunTree } from './RunTree'

/** 轮询间隔：有运行中的实例时才拉输出。 */
const POLL_INTERVAL_MS = 800

/** 编辑中的配置。 */
interface DraftConfig {
  /** 配置 id；空串表示新建。 */
  id: string
  /** 名称。 */
  name: string
  /** 命令串。 */
  command: string
}

/**
 * 渲染运行配置面板。
 * @param props 见 FeatureViewProps
 * @returns 配置列表、实例列表与输出
 */
export function RunPanel({ t, services }: FeatureViewProps): React.ReactElement {
  const [configs, setConfigs] = useState<RunConfig[]>([])
  const [processes, setProcesses] = useState<RunProcess[]>([])
  const [activeId, setActiveId] = useState('')
  const [output, setOutput] = useState('')
  const [draft, setDraft] = useState<DraftConfig | null>(null)
  const [error, setError] = useState('')
  const [menu, setMenu] = useState<MenuState | null>(null)

  /** 已消费的字节数，用于增量拉取。 */
  const offsetRef = useRef(0)
  const outputRef = useRef<HTMLPreElement | null>(null)

  const root = services.root

  /**
   * 读取配置与实例列表。
   */
  const refresh = useCallback(async (): Promise<void> => {
    if (root === '') return

    const [configResult, listResult] = await Promise.all([
      readRunConfigs(root),
      apiGet<{ processes: RunProcess[] }>('/run/list'),
    ])

    if (configResult.ok) setConfigs(configResult.value.configs)
    if (listResult.ok) {
      setProcesses(listResult.value.processes)
      // 首次进入时自动选中最近的一个运行实例，用户能立刻看到输出
      setActiveId((previous) => {
        if (previous !== '') return previous

        return listResult.value.processes[0]?.id ?? ''
      })
    }
  }, [root])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // 顶部下拉的「新增 / 编辑」直接落到本面板的表单上
  useEffect(() => {
    /** 消费一次意图；没有待办时什么都不做。 */
    const consume = (): void => {
      const intent = services.consumeRunConfigIntent()
      if (intent === null) return

      if (intent.kind === 'create') {
        setDraft({ id: '', name: '', command: '' })

        return
      }

      const config = configs.find((item) => item.id === intent.id)
      if (config !== undefined) setDraft({ id: config.id, name: config.name, command: config.command })
    }

    consume()

    return services.subscribeRunConfigIntent(consume)
  }, [configs, services])

  // 有运行中实例时轮询输出；全部结束就停止轮询，空闲时零开销
  useEffect(() => {
    if (activeId === '') return undefined

    let alive = true

    const tick = async (): Promise<void> => {
      const result = await apiGet<{ text: string; bytes: number; overflowed: boolean }>('/run/output', {
        id: activeId,
        offset: offsetRef.current,
      })

      if (!alive || !result.ok) return
      if (result.value.text === '') return

      offsetRef.current = result.value.bytes
      // 缓冲被裁剪时宿主整段重发，这里整段替换而不是追加
      setOutput((previous) => (result.value.overflowed ? result.value.text : previous + result.value.text))
    }

    void tick()

    const hasRunning = processes.some((item) => item.state === 'running')
    const timer = hasRunning ? window.setInterval(() => void tick(), POLL_INTERVAL_MS) : undefined

    return () => {
      alive = false
      if (timer !== undefined) window.clearInterval(timer)
    }
  }, [activeId, processes])

  // 切换实例时清空输出并从头发拉
  useEffect(() => {
    offsetRef.current = 0
    setOutput('')
  }, [activeId])

  // 输出追加后自动滚到底
  useEffect(() => {
    const element = outputRef.current
    if (element === null) return

    element.scrollTop = element.scrollHeight
  }, [output])

  // 上下文变化时重新拉列表：切换会话、git 操作或文件保存都可能改变状态
  useEffect(
    () => services.subscribeInvalidate(() => void refresh()),
    [refresh, services],
  )

  /**
   * 启动一个配置。
   * @param config 配置
   */
  const start = useCallback(
    async (config: RunConfig): Promise<void> => {
      const result = await startRun(root, config.id)

      if (!result.ok) {
        setError(result.error.message)

        return
      }

      setError('')
      setActiveId(result.value.id)
      await refresh()
    },
    [refresh],
  )

  /**
   * 停止一个实例。
   * @param id 实例 id
   */
  const stop = useCallback(
    async (id: string): Promise<void> => {
      const result = await stopRun(id)

      if (!result.ok) setError(result.error.message)

      await refresh()
    },
    [refresh],
  )

  /**
   * 保存草稿配置。
   */
  const saveDraft = useCallback(async (): Promise<void> => {
    if (draft === null) return

    const result = await saveRunConfig(root, {
      id: draft.id,
      name: draft.name,
      command: draft.command,
      cwd: root,
    })

    if (!result.ok) {
      setError(result.error.message)

      return
    }

    setDraft(null)
    setError('')
    await refresh()
    // 顶栏下拉读的是同一份配置，写完后要让它们重读
    services.invalidate()
  }, [draft, refresh, root, services])

  /**
   * 删除一个配置。
   * @param id 配置 id
   */
  const removeConfig = useCallback(
    async (id: string): Promise<void> => {
      const result = await deleteRunConfig(root, id)

      if (!result.ok) setError(result.error.message)

      await refresh()
      services.invalidate()
    },
    [refresh, services],
  )

  const activeProcess = processes.find((item) => item.id === activeId)

  /**
   * 重跑：先停掉当前实例，再按原配置起一个新的。
   * @param process 当前实例
   */
  const restart = useCallback(
    async (process: RunProcess): Promise<void> => {
      const config = configs.find((item) => item.id === process.configId)
      if (config === undefined) return

      if (process.state === 'running') await stop(process.id)

      await start(config)
    },
    [configs, start, stop],
  )

  /**
   * 打开输出区的更多菜单。
   * @param event 鼠标事件
   */
  const openMoreMenu = useCallback(
    (event: React.MouseEvent): void => {
      const items: MenuItem[] = []

      if (activeProcess !== undefined) {
        items.push({ id: 'restart', label: t('restart'), run: () => void restart(activeProcess) })
        items.push({
          id: 'stop',
          label: t('stop'),
          disabled: activeProcess.state !== 'running',
          run: () => void stop(activeProcess.id),
        })
        items.push({ id: 'clear', label: t('clear'), separatorBefore: true, run: () => setOutput('') })
      }

      items.push({
        id: 'new',
        label: t('newConfig'),
        separatorBefore: true,
        run: () => setDraft({ id: '', name: '', command: '' }),
      })

      setMenu({ x: event.clientX, y: event.clientY + 20, items })
    },
    [activeProcess, restart, stop, t],
  )

  return (
    <div className="flex h-full min-h-0 flex-col bg-base">
      {root === '' && <div className="p-3 text-xs text-secondary">{t('noSession')}</div>}
      {error !== '' && <div className="shrink-0 border-b border-line1 px-2 py-1 text-xs text-danger">{error}</div>}

      <div className="flex min-h-0 flex-1">
        {/* 左：按运行器分组的服务树 */}
        <div className="w-44 shrink-0 overflow-auto border-r border-line1">
          <RunTree
            configs={configs}
            processes={processes}
            activeId={activeId}
            onSelect={setActiveId}
            onNew={() => setDraft({ id: '', name: '', command: '' })}
            onEdit={(config) => setDraft({ id: config.id, name: config.name, command: config.command })}
            onDelete={(config) => void removeConfig(config.id)}
            onRun={(config) => void start(config)}
            onStop={(id) => void stop(id)}
            t={t}
          />
        </div>

        {/* 右：工具条 + 终端输出 */}
        <RunOutput
          process={activeProcess}
          output={output}
          running={activeProcess?.state === 'running'}
          emptyLabel={t('noOutput')}
          onScrollToEnd={() => {
            const element = outputRef.current
            if (element !== null) element.scrollTop = element.scrollHeight
          }}
          onClear={() => setOutput('')}
          onRestart={() => {
            if (activeProcess === undefined) return
            void restart(activeProcess)
          }}
          onStop={() => {
            if (activeProcess === undefined) return
            void stop(activeProcess.id)
          }}
          onMore={openMoreMenu}
          outputRef={outputRef}
        />
      </div>

      {menu !== null && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}

      {draft !== null && (
        <div className="fixed inset-0 z-[9998] flex items-start justify-center bg-black/40 pt-20">
          {/* 对话框沿用 IDEA 的比例：大圆角、深底、蓝色主按钮 */}
          <div className="w-[420px] rounded-xl border border-line2 bg-surface2 p-4 shadow-2xl">
            {/* 对话框标题 */}
            <div className="mb-4 text-sm font-semibold text-primary">
              {draft.id === '' ? t('newConfig') : t('editConfig')}
            </div>

            <input
              autoFocus
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder={t('namePlaceholder')}
              className="mb-2 h-8 w-full rounded border border-line2 bg-base px-2.5 text-[13px] text-primary outline-none transition-colors focus:border-info"
            />

            <input
              value={draft.command}
              onChange={(event) => setDraft({ ...draft, command: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void saveDraft()
                if (event.key === 'Escape') setDraft(null)
              }}
              placeholder={t('commandPlaceholder')}
              className="mb-4 h-8 w-full rounded border border-line2 bg-base px-2.5 font-mono text-[13px] text-primary outline-none transition-colors focus:border-info"
            />

            <div className="flex justify-end gap-2">
              {/* 取消编辑 */}
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="h-8 rounded border border-line2 px-4 text-[13px] text-primary transition-colors hover:bg-surface3"
              >
                {t('cancel')}
              </button>

              {/* 保存配置：IDEA 的主按钮是蓝底白字 */}
              <button
                type="button"
                onClick={() => void saveDraft()}
                className="h-8 rounded bg-info px-4 text-[13px] text-onAccent transition-opacity hover:opacity-90"
              >
                {t('save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
