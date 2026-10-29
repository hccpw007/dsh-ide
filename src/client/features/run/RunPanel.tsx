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
import { cn } from '../../../common/cn'
import type { FeatureViewProps } from '../../shell/contract'

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
  const runningConfigIds = new Set(processes.filter((item) => item.state === 'running').map((item) => item.configId))

  return (
    <div className="flex h-full min-h-0 flex-col bg-base">
      {/* 工具条：新建配置 */}
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-line1 bg-surface1 px-2">
        {/* 新建配置 */}
        <button
          type="button"
          disabled={root === ''}
          onClick={() => setDraft({ id: '', name: '', command: '' })}
          className="rounded border border-line2 px-1.5 py-0.5 text-xs text-primary hover:bg-surface2 disabled:opacity-40"
        >
          {t('newConfig')}
        </button>

        <span className="flex-1" />

        {/* 运行中实例数 */}
        <span className="text-[11px] text-secondary">
          {t('runningCount')} {processes.filter((item) => item.state === 'running').length}
        </span>
      </div>

      {root === '' && <div className="p-3 text-xs text-secondary">{t('noSession')}</div>}
      {error !== '' && <div className="shrink-0 border-b border-line1 px-2 py-1 text-xs text-danger">{error}</div>}

      <div className="flex min-h-0 flex-1">
        {/* 左：配置与实例列表 */}
        <div className="w-56 shrink-0 overflow-auto border-r border-line1 px-1 py-1">
          {configs.length === 0 && (
            <div className="px-1 py-2 text-xs text-secondary">{t('noConfigs')}</div>
          )}

          {configs.map((config) => (
            <div key={config.id} className="group flex items-center gap-1 rounded px-1 py-0.5 hover:bg-surface2">
              {/* 启动 / 已在运行的提示 */}
              <button
                type="button"
                disabled={runningConfigIds.has(config.id)}
                onClick={() => void start(config)}
                title={runningConfigIds.has(config.id) ? t('alreadyRunning') : t('start')}
                className="shrink-0 rounded px-1 text-[11px] text-success hover:bg-surface1 disabled:opacity-40"
              >
                ▶
              </button>

              <span className="min-w-0 flex-1 truncate text-xs text-primary" title={config.command}>
                {config.name}
              </span>

              {/* 编辑配置 */}
              <button
                type="button"
                onClick={() => setDraft({ id: config.id, name: config.name, command: config.command })}
                className="shrink-0 rounded px-1 text-[11px] text-secondary opacity-0 hover:bg-surface1 group-hover:opacity-100"
              >
                {t('edit')}
              </button>

              {/* 删除配置 */}
              <button
                type="button"
                onClick={() => void removeConfig(config.id)}
                className="shrink-0 rounded px-1 text-[11px] text-danger opacity-0 hover:bg-surface1 group-hover:opacity-100"
              >
                {t('delete')}
              </button>
            </div>
          ))}

          {processes.length > 0 && (
            <div className="mt-2 border-t border-line1 pt-1">
              {/* 运行实例分组标题 */}
              <div className="px-1 pb-0.5 text-[11px] text-secondary">{t('instances')}</div>

              {processes.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setActiveId(item.id)}
                  className={cn(
                    'flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-xs hover:bg-surface2',
                    item.id === activeId ? 'bg-surface2 text-primary' : 'text-secondary',
                  )}
                >
                  {/* 实例名称与状态 */}
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>

                  {/* 运行中可停止；已结束显示退出码 */}
                  {item.state === 'running' ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        void stop(item.id)
                      }}
                      className="shrink-0 rounded px-1 text-[11px] text-danger hover:bg-surface1"
                    >
                      ■
                    </button>
                  ) : (
                    <span className="shrink-0 text-[11px]">{item.exitCode ?? '–'}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 右：输出 */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {activeProcess !== undefined && (
            <div className="flex h-7 shrink-0 items-center gap-2 border-b border-line1 px-2 text-[11px] text-secondary">
              <span className="min-w-0 flex-1 truncate">{activeProcess.command}</span>
              <span className="shrink-0">{activeProcess.state}</span>
            </div>
          )}

          <pre ref={outputRef} className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-all p-2 font-mono text-[12px] text-primary">
            {output === '' ? t('noOutput') : output}
          </pre>
        </div>
      </div>

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
