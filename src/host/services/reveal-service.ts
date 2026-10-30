/**
 * 在系统文件管理器中定位工作区内的条目。
 *
 * 插件其余能力都在浏览器侧完成，只有「打开系统窗口」必须落到宿主进程：这里用
 * Node 的 spawn 直接拉起平台自带的文件管理器，参数以数组传递、不经过 shell，
 * 目标路径先过工作区边界校验，工作区之外一律拒绝。
 */
import { spawn } from 'node:child_process'
import path from 'node:path'

import { resolveWithin } from './workspace'

/**
 * 等待启动器退出的上限。
 *
 * 部分桌面环境的 `xdg-open` 会驻留（或等待窗口关闭）而不退出，`exit` 事件可能永远不来；
 * 没有上限时这个 HTTP 请求会一直悬挂，界面上的「在文件管理器中显示」就永远转圈。
 */
const REVEAL_TIMEOUT_MS = 5000

/** 一次文件管理器调用的命令描述。 */
interface RevealCommand {
  /** 可执行文件。 */
  command: string
  /** 参数数组。 */
  args: string[]
  /** 是否忽略退出码。 */
  ignoreExitCode: boolean
}

/**
 * 按平台拼出「定位到该条目」的命令。
 * @param target 目标绝对路径
 * @returns 命令描述
 */
function commandFor(target: string): RevealCommand {
  if (process.platform === 'darwin') return { command: 'open', args: ['-R', target], ignoreExitCode: false }

  // explorer 的 `/select,` 与路径之间不能有空格；它在成功选中时也常返回 1，因此不看退出码
  if (process.platform === 'win32') return { command: 'explorer', args: [`/select,${target}`], ignoreExitCode: true }

  // Linux 没有统一的「选中文件」入口，退化为打开所在目录
  return { command: 'xdg-open', args: [path.dirname(target)], ignoreExitCode: false }
}

/**
 * 在系统文件管理器中显示目标条目。
 * @param root 工作区根
 * @param input 相对或绝对路径
 */
export async function revealInFileManager(root: string, input: string): Promise<void> {
  const resolved = await resolveWithin(root, input)
  const { command, args, ignoreExitCode } = commandFor(resolved.absolute)

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore', detached: true })

    const timer = setTimeout(() => {
      // 启动器已交给系统，超时按成功处理：窗口是否打开不由本进程决定
      resolve()
    }, REVEAL_TIMEOUT_MS)

    timer.unref?.()

    child.on('error', (error) => {
      clearTimeout(timer)
      console.error('[dsh-ide] 打开系统文件管理器失败:', command, resolved.absolute, error)
      reject(error)
    })

    child.on('exit', (code) => {
      clearTimeout(timer)

      if (ignoreExitCode || code === 0) {
        resolve()

        return
      }

      console.error('[dsh-ide] 系统文件管理器返回非零退出码:', command, code)
      reject(new Error(`${command} exited with code ${String(code)}`))
    })

    // 窗口由外部进程持有，父进程不必等它结束
    child.unref()
  })
}
