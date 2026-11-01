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
  TerminalInput,
  TerminalRemote,
} from '../../../common/terminal-remote'
import type { TerminalKernel, TerminalTheme } from '../../lazy/terminal-api'
import { loadLazyChunk } from '../../lazy/loader'

import { readTerminalTheme } from './terminal-bindings'

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
   * 向上行流发送一条命令。
   *
   * 发送被拒时不重放，避免同一条命令被宿主执行两次。
   * @param command 上行命令
   */
  const send = useCallback((command: TerminalInput): void => {
    const stream = streamRef.current
    if (stream === null) return

    try {
      stream.send(command)
    } catch (error) { // 流已关闭属于正常时序，不重放
      console.error('[dsh-ide] 终端输入发送失败:', error)
    }
  }, [])

  /**
   * 写入一段输入。
   * @param data 待发送的字符串
   */
  const sendInput = useCallback(
    (data: string): void => {
      if (data === '') return

      sequenceRef.current += 1
      send({ type: 'write', sequence: sequenceRef.current, data })
    },
    [send],
  )

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
    /** 进入目录的延时命令；卸载时要撤销，否则会往已销毁的终端里写。 */
    let cwdTimer: number | null = null

    /** 把攒下的输出一次写进终端。 */
    const flushWrite = (): void => {
      writeFrame = null

      if (pendingWrite === '') return

      const data = pendingWrite
      pendingWrite = ''
      kernel?.write(data)
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
            sequenceRef.current += 1
            try {
              streamRef.current?.send({ type: 'resize', sequence: sequenceRef.current, cols, rows })
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

              if (frame.type === 'output') {
                pendingWrite += frame.data

                // 逐帧写会让 xterm 在爆发输出（构建日志、`yes`）时反复触发渲染
                if (writeFrame === null) writeFrame = window.requestAnimationFrame(flushWrite)
              }
            }
          } catch (attachError) { // 附加中断（进程结束、切走标签）不是故障
            if (!controller.signal.aborted) console.error('[dsh-ide] 终端附加流中断:', attachError)
          }
        })()
      })
      .catch((createError: unknown) => {
        console.error('[dsh-ide] 创建终端失败:', createError)
        onError(String(createError))
      })

    return () => {
      alive = false
      controller.abort()

      // 撤销挂起的写入帧与延时命令，它们会引用即将销毁的终端
      if (writeFrame !== null) window.cancelAnimationFrame(writeFrame)
      if (cwdTimer !== null) window.clearTimeout(cwdTimer)

      writeFrame = null
      pendingWrite = ''
      streamRef.current = null
      kernelRef.current = null
      kernel?.destroy()
    }
    // 只随活动终端重建；字号变化重建后屏幕由宿主快照恢复
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.activeId, options.remote, options.sessionId])

  return {
    sendInput,
    kernel: () => kernelRef.current,
  }
}
