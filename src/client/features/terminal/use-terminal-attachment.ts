/**
 * 终端附加逻辑。
 *
 * 把「创建 xterm 内核 → 附加宿主输出流 → 转发键盘与尺寸 → 清理」收在一个 hook 里，
 * 面板组件只负责终端列表与头部交互。活动终端或会话变化时整套重建，屏幕内容由
 * 宿主的快照帧恢复。
 */
import { useCallback, useEffect, useRef } from 'react'

import type {
  TerminalFrame,
  TerminalInfo,
  TerminalInput,
  TerminalRemote,
} from '../../../common/terminal-remote'
import type { TerminalKernel, TerminalTheme } from '../../lazy/terminal-api'
import { LazyChunkError, loadLazyChunk } from '../../lazy/loader'

import { readTerminalTheme } from './terminal-bindings'

/**
 * 待写入输出的字符上限。
 *
 * 页面隐藏时 `requestAnimationFrame` 会暂停，而附加流仍在推送；`yes`、`tail -f`
 * 这类输出持续几分钟就能攒出几十 MB 字符串，切回前台时一次性写入会把主线程钉住。
 * 超过上限丢掉头部并留下截断标记，用恒定内存换取「最新内容可见」。
 */
const MAX_PENDING_WRITE = 512 * 1024

/** 页面隐藏时的兜底流控间隔（毫秒）；rAF 在后台不跑，改用定时器保证持续消费。 */
const HIDDEN_FLUSH_INTERVAL_MS = 100

/** 输出被截断时插入终端的提示。 */
const TRUNCATED_NOTICE = '\r\n\x1b[33m[dsh-ide] 输出过多，较早内容已截断\x1b[0m\r\n'

/** 终端内核 chunk 的形态。 */
interface TerminalChunk {
  create(options: {
    parent: HTMLElement
    theme: TerminalTheme
    fontSize: number
    onData(data: string): void
    onResize(cols: number, rows: number): void
  }): TerminalKernel
}

/** 附加参数。 */
export interface TerminalAttachmentOptions {
  /** 宿主终端服务；未就绪时为 undefined。 */
  remote: TerminalRemote | undefined
  /** 会话 id，空串表示承载面尚未绑定会话。 */
  sessionId: string
  /** 当前活动终端 id，空串表示没有终端。 */
  activeId: string
  /** 终端挂载点。 */
  host: { readonly current: HTMLDivElement | null }
  /** 终端字号。 */
  fontSize: number
  /** 重连令牌；变化时重建附加流（用户点「重新连接」时自增）。 */
  reconnectToken?: number
  /** 宿主推送的终端状态帧（进程退出、崩溃）；面板据此显示状态。 */
  onState?(info: TerminalInfo): void
  /** 附加流意外结束（非主动取消）；面板据此提示并可重连。 */
  onStreamEnded?(): void
  /** 取走待执行的目录跳转；附加完成后执行一次 cd，没有待办时返回 null。 */
  takeCwd(): string | null
  /** 挂载失败时向上报告。 */
  onError(message: string): void
}

/** 附加结果。 */
export interface TerminalAttachment {
  /** 把一段输入送到当前终端。 */
  sendInput(data: string): void
  /** 当前内核；供右键菜单的复制、全选、清屏使用。 */
  kernel(): TerminalKernel | null
}

/**
 * 绑定终端生命周期。
 * @param options 见 TerminalAttachmentOptions
 * @returns 输入通道与内核读取入口
 */
export function useTerminalAttachment(options: TerminalAttachmentOptions): TerminalAttachment {
  const kernelRef = useRef<TerminalKernel | null>(null)
  /** 当前附加流，供输入与尺寸变化回调使用。 */
  const streamRef = useRef<{ send(command: TerminalInput): void } | null>(null)
  /** 上行命令序号。 */
  const sequenceRef = useRef(0)

  /** 回调与字号取最新值：它们变化不应重建终端，重建会清掉屏幕上的内容。 */
  const latest = useRef(options)
  latest.current = options

  /**
   * 写入一段输入。
   *
   * 序号只能在流就绪后递增：宿主按序号连续性校验上行命令，提前消耗序号会被判定
   * 为跳号并终止附加流。发送被拒时不重放，避免同一条命令被宿主执行两次。
   * @param data 待发送的字符串
   */
  const sendInput = useCallback((data: string): void => {
    const stream = streamRef.current
    if (stream === null || data === '') return

    sequenceRef.current += 1

    try {
      stream.send({ type: 'write', sequence: sequenceRef.current, data })
    } catch (error) { // 流已关闭属于正常时序，不重放
      console.error('[dsh-ide] 终端输入发送失败:', error)
    }
  }, [])

  useEffect(() => {
    const { remote, sessionId, activeId, host, fontSize, takeCwd, onError } = latest.current
    const element = host.current

    if (remote === undefined || sessionId === '' || activeId === '' || element === null) return undefined

    const controller = new AbortController()
    sequenceRef.current = 0

    let alive = true
    let kernel: TerminalKernel | null = null
    /** 是否已经写过一次快照。 */
    let snapshotWritten = false
    /** 待写入 xterm 的输出；终端输出帧的频率可能远高于刷新率，按帧合并。 */
    let pendingWrite = ''
    /** 已排队的写入帧；null 表示没有待写内容。 */
    let writeFrame: number | null = null
    /** 隐藏状态下使用的兜底定时器；与 writeFrame 互斥。 */
    let writeTimer: number | null = null
    /** 是否已经提示过「输出被截断」。 */
    let truncatedNotified = false
    /** 进入目录的延时命令；卸载时要撤销，否则会往已销毁的终端里写。 */
    let cwdTimer: number | null = null

    /** 把攒下的输出一次写进终端。 */
    const flushWrite = (): void => {
      writeFrame = null

      if (writeTimer !== null) {
        window.clearTimeout(writeTimer)
        writeTimer = null
      }

      if (pendingWrite === '') return

      const data = pendingWrite
      pendingWrite = ''
      kernel?.write(data)
    }

    /** 排一次写入：前台按帧合并，后台用定时器兜底（rAF 在隐藏页不会触发）。 */
    const scheduleWrite = (): void => {
      if (document.visibilityState === 'visible') {
        if (writeFrame === null) writeFrame = window.requestAnimationFrame(flushWrite)

        return
      }

      if (writeTimer === null) writeTimer = window.setTimeout(flushWrite, HIDDEN_FLUSH_INTERVAL_MS)
    }

    void loadLazyChunk<TerminalChunk>('terminal-kernel')
      .then((chunk) => {
        if (!alive) return undefined

        kernel = chunk.create({
          parent: element,
          theme: readTerminalTheme(element),
          fontSize,
          onData: (data) => sendInput(data),
          onResize: (cols, rows) => {
            // 首次 fit 可能在流就绪之前触发；先别消耗序号，否则宿主会判定跳号
            const stream = streamRef.current
            if (stream === null) return

            sequenceRef.current += 1

            try {
              stream.send({ type: 'resize', sequence: sequenceRef.current, cols, rows })
            } catch (error) { // 流切换瞬间的尺寸上报失败不需要重试，下一次 fit 会再报
              console.error('[dsh-ide] 终端尺寸同步失败:', error)
            }
          },
        })

        kernelRef.current = kernel

        return remote.attach(sessionId, activeId, controller.signal)
      })
      .then((attached) => {
        if (attached === undefined || !alive) return

        streamRef.current = attached

        // 带着目录进来时先 cd 过去；等一拍让 shell 完成初始化，否则命令会被忽略
        const pendingCwd = takeCwd()
        if (pendingCwd !== null) {
          cwdTimer = window.setTimeout(() => sendInput(`cd '${pendingCwd}'\r`), 120)
        }

        void (async () => {
          try {
            for await (const frame of attached as AsyncIterable<TerminalFrame>) {
              if (!alive) return

              if (frame.type === 'snapshot') {
                // 落掉攒下的输出，保证快照与之前内容的先后顺序
                if (writeFrame !== null) {
                  window.cancelAnimationFrame(writeFrame)
                  flushWrite()
                }

                // 快照是完整屏幕；第二次及以后的快照要先清屏，否则内容会叠在一起
                if (snapshotWritten) kernel?.clear()
                kernel?.write(frame.screen)
                snapshotWritten = true
                kernel?.focus()

                continue
              }

              // 状态帧：进程退出/崩溃时宿主会推一条，忽略它会让页签永远显示「运行中」
              if (frame.type === 'state') {
                latest.current.onState?.(frame.info)

                continue
              }

              if (frame.type === 'output') {
                pendingWrite += frame.data

                // 超限时丢掉头部：保留最新内容，内存占用有上界
                if (pendingWrite.length > MAX_PENDING_WRITE) {
                  pendingWrite = pendingWrite.slice(pendingWrite.length - MAX_PENDING_WRITE)

                  if (!truncatedNotified) {
                    truncatedNotified = true
                    pendingWrite = TRUNCATED_NOTICE + pendingWrite
                  }
                }

                // 逐帧写会让 xterm 在爆发输出（构建日志、`yes`）时反复触发渲染
                scheduleWrite()
              }
            }
          } catch (attachError) { // 附加中断（进程结束、切走标签）不是故障
            if (!controller.signal.aborted) {
              console.error('[dsh-ide] 终端附加流中断:', attachError)
              // 意外中断要告诉用户：否则终端看起来「卡死」，既没有输出也没有提示
              latest.current.onStreamEnded?.()
            }
          }

          // 流正常结束（宿主关闭了附加）同样要提示，除非是我们自己取消的
          if (!controller.signal.aborted) latest.current.onStreamEnded?.()
        })()
      })
      .catch((createError: unknown) => {
        console.error('[dsh-ide] 创建终端失败:', createError)
        // 用稳定标记交给面板翻译：直接把原始英文异常展示给用户既不可读也没有上下文
        onError(createError instanceof LazyChunkError ? 'CHUNK_FAILED' : String(createError))
      })

    return () => {
      alive = false
      controller.abort()

      // 撤销挂起的写入帧与延时命令，它们会引用即将销毁的终端
      if (writeFrame !== null) window.cancelAnimationFrame(writeFrame)
      if (writeTimer !== null) window.clearTimeout(writeTimer)
      if (cwdTimer !== null) window.clearTimeout(cwdTimer)

      writeFrame = null
      writeTimer = null
      pendingWrite = ''
      streamRef.current = null
      kernelRef.current = null
      kernel?.destroy()
    }
    // 只随活动终端与字号重建；重建后屏幕由宿主快照恢复，因此改字号能立即生效
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.activeId, options.fontSize, options.reconnectToken, options.remote, options.sessionId])

  return {
    sendInput,
    kernel: () => kernelRef.current,
  }
}
