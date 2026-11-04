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
import { openIdeContextMenu } from '../../../common/context-menu'
import { appendOutput, tailOutput } from '../../../common/output-window'
import { useDialogFrame } from '../../../common/dialog-frame'
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

/** 轮询间隔：选中实例时拉输出与状态。 */
const POLL_INTERVAL_MS = 800

/** 没有选中实例时的轮询间隔，只用来发现宿主侧新出现的实例。 */
const IDLE_POLL_INTERVAL_MS = 2000

/** 配置编辑弹窗默认大小：与其它简单弹窗一致，刚好放下标题、两个输入框与按钮。 */
const DRAFT_INITIAL_SIZE = { widthRatio: 1, heightRatio: 1, maxWidth: 420, maxHeight: 160 }

/** 配置编辑弹窗缩放下限：再小两个输入框就挤在一起了。 */
const DRAFT_MIN_SIZE = { width: 340, height: 160 }

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
 * 判断两次轮询拿到的实例列表是否一致。
 *
 * 宿主每次返回新数组，若照单全收，面板每 800ms 就要整棵重渲染一次；实例没变时
 * 保持原引用能让 React 直接跳过。
 * @param left 上一次列表
 * @param right 本次列表
 * @returns 逐项一致时返回 true
 */
function sameProcessList(left: RunProcess[], right: RunProcess[]): boolean {
  if (left.length !== right.length) return false

  return left.every((item, index) => {
    const other = right[index]

    return (
      other !== undefined &&
      item.id === other.id &&
      item.state === other.state &&
      item.exitCode === other.exitCode &&
      item.bytes === other.bytes
    )
  })
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
  /** 当前选中的实例，用于丢弃切换后迟到的输出响应。 */
  const activeIdRef = useRef(activeId)
  const draftDialog = useDialogFrame(services.dialogSizes, {
    // 带 v2 是因为旧标识记过更大的尺寸，换新标识后首次打开回到贴合内容的默认大小
    key: 'run-config-v2',
    initial: DRAFT_INITIAL_SIZE,
    min: DRAFT_MIN_SIZE,
    // 高度始终贴合内容：拖高后下次打开不在下方留空白
    rememberHeight: false,
  })

  /** 配置名称输入框：打开弹窗时聚焦并全选，便于直接覆盖旧名称。 */
  const draftNameRef = useRef<HTMLInputElement | null>(null)
  /** 弹窗是否已经做过首次聚焦；避免每次输入都重新全选。 */
  const draftOpenRef = useRef(false)

  activeIdRef.current = activeId
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

  // 切换实例时先把输出与偏移量清干净。必须排在轮询 effect 前面：两个 effect 都挂在
  // activeId 上，React 按声明顺序执行，先重置再拉取才不会用上一个实例的偏移量去读新实例。
  useEffect(() => {
    offsetRef.current = 0
    setOutput('')
  }, [activeId])

  // 面板打开期间始终轮询进程状态：即便当前没有选中的实例，宿主侧也可能有实例在跑，
  // 不轮询的话列表会一直停在打开那一刻。选中实例时再顺带拉输出。
  // 配置列表不在这里刷新，它的变化由 invalidate 订阅覆盖，省掉一半请求。
  useEffect(() => {
    let alive = true
    /** 是否有一轮轮询还在路上；宿主响应慢于间隔时不再叠积请求。 */
    let inFlight = false

    const tick = async (): Promise<void> => {
      if (inFlight) return

      inFlight = true

      try {
        await pullOnce()
      } finally {
        inFlight = false
      }
    }

    const pullOnce = async (): Promise<void> => {
      if (activeId !== '') {
        const result = await apiGet<{ text: string; bytes: number; overflowed: boolean }>('/run/output', {
          id: activeId,
          offset: offsetRef.current,
        })

        // 请求在途时用户可能已经切走，迟到的响应会把别的实例输出写进来
        if (!alive || activeIdRef.current !== activeId) return

        if (result.ok && result.value.text !== '') {
          offsetRef.current = result.value.bytes
          // 缓冲被裁剪时宿主整段重发，这里整段替换而不是追加；
          // 两种路径都只保留尾部窗口，避免长跑进程把客户端内存与解析成本推高
          setOutput((previous) =>
            result.value.overflowed ? tailOutput(result.value.text) : appendOutput(previous, result.value.text),
          )
        }
      }

      const listResult = await apiGet<{ processes: RunProcess[] }>('/run/list')

      if (!alive) return

      if (!listResult.ok) return

      const next = listResult.value.processes

      setProcesses((previous) => (sameProcessList(previous, next) ? previous : next))
      // 面板先打开、实例后出现（例如在别处启动）时，自动选中第一个，用户能立刻看到输出
      setActiveId((previous) => (previous !== '' ? previous : (listResult.value.processes[0]?.id ?? '')))
    }

    void tick()

    // 没有选中实例时没必要高频轮询，只在等实例出现
    const timer = window.setInterval(() => void tick(), activeId === '' ? IDLE_POLL_INTERVAL_MS : POLL_INTERVAL_MS)

    return () => {
      alive = false
      window.clearInterval(timer)
    }
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

    const name = draft.name.trim()
    const command = draft.command.trim()

    // 空名称或空命令无法运行：保存按钮已禁用，这里再挡一层
    if (name === '' || command === '') return

    const result = await saveRunConfig(root, {
      id: draft.id,
      name,
      command,
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

  // 配置弹窗的键盘与焦点：打开时聚焦名称并全选；Enter 保存、Escape 取消
  useEffect(() => {
    if (draft === null) {
      draftOpenRef.current = false

      return undefined
    }

    if (!draftOpenRef.current) {
      draftOpenRef.current = true
      draftNameRef.current?.focus()
      draftNameRef.current?.select()
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setDraft(null)

        return
      }

      if (event.key === 'Enter' && draft.name.trim() !== '' && draft.command.trim() !== '') {
        event.preventDefault()
        void saveDraft()
      }
    }

    window.addEventListener('keydown', onKeyDown)

    return () => window.removeEventListener('keydown', onKeyDown)
  }, [draft, saveDraft])

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
    <div
      className="flex h-full min-h-0 flex-col bg-base"
      // 运行面板空白区右键：新建配置、重跑 / 停止当前实例与设置入口
      onContextMenu={(event) => {
        if (event.defaultPrevented) return

        openIdeContextMenu(event, services, [
          { id: 'newConfig', label: t('newConfig'), run: () => setDraft({ id: '', name: '', command: '' }) },
          ...(activeProcess === undefined
            ? []
            : [
                { id: 'restart', label: t('restart'), run: () => void restart(activeProcess) },
                {
                  id: 'stop',
                  label: t('stop'),
                  disabled: activeProcess.state !== 'running',
                  run: () => void stop(activeProcess.id),
                },
              ]),
          {
            id: 'settings',
            label: t('menuSettings'),
            separatorBefore: true,
            run: () => services.openPage('settings'),
          },
        ])
      }}
    >
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
        <div
          className="fixed inset-0 z-[9998] flex items-start justify-center bg-black/30 pt-20"
          onClick={() => setDraft(null)}
          onContextMenu={(event) => event.preventDefault()}
        >
          {/* 点击卡片本身不该关闭，拦在冒泡阶段 */}
          <div
            ref={draftDialog.rootRef}
            role="dialog"
            aria-modal="true"
            className="relative flex flex-col rounded-md border border-line2 bg-surface2 p-3 shadow-2xl"
            style={draftDialog.style}
            onClick={(event) => event.stopPropagation()}
          >
            {/* 对话框标题：可按住拖动弹窗位置 */}
            <div
              className="mb-2 shrink-0 cursor-move select-none text-xs font-semibold text-primary"
              {...draftDialog.dragProps}
            >
              {draft.id === '' ? t('newConfig') : t('editConfig')}
            </div>

            {/* 配置名称 */}
            <input
              ref={draftNameRef}
              type="text"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder={t('namePlaceholder')}
              aria-label={t('namePlaceholder')}
              className="mb-2 w-full shrink-0 rounded border border-inputborder bg-inputbg px-2 py-1 text-xs text-primary outline-none focus:border-info"
            />

            {/* 运行命令 */}
            <input
              type="text"
              value={draft.command}
              onChange={(event) => setDraft({ ...draft, command: event.target.value })}
              placeholder={t('commandPlaceholder')}
              aria-label={t('commandPlaceholder')}
              className="mb-3 w-full shrink-0 rounded border border-inputborder bg-inputbg px-2 py-1 font-mono text-xs text-primary outline-none focus:border-info"
            />

            {/* 拖高弹窗时把多余空间留在输入框与按钮之间，按钮始终贴底 */}
            <span className="flex-1" />

            <div className="flex shrink-0 justify-end gap-2">
              {/* 取消编辑 */}
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="rounded border border-line2 px-2 py-1 text-xs text-primary transition-colors hover:bg-surface3"
              >
                {t('cancel')}
              </button>

              {/* 保存配置：名称或命令为空时不可点 */}
              <button
                type="button"
                disabled={draft.name.trim() === '' || draft.command.trim() === ''}
                onClick={() => void saveDraft()}
                className="rounded border border-info/60 px-2 py-1 text-xs text-primary transition-colors hover:bg-info/20 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent"
              >
                {t('save')}
              </button>
            </div>

            {draftDialog.handle}
          </div>
        </div>
      )}
    </div>
  )
}
