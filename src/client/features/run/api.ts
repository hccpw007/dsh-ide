/**
 * 运行配置的客户端调用封装。
 *
 * 配置与进程都保存在宿主侧：顶部的运行配置下拉、底部的运行面板读的是同一份
 * 数据，因此把类型与调用放在这里，两处共用，避免各自定义一份形状。
 */
import { apiGet, apiPost, type ApiResult } from '../../../common/api'

/** 运行配置。 */
export interface RunConfig {
  /** 配置 id。 */
  id: string
  /** 名称。 */
  name: string
  /** 命令串。 */
  command: string
  /** 工作目录。 */
  cwd: string
}

/** 运行实例。 */
export interface RunProcess {
  /** 实例 id。 */
  id: string
  /** 配置 id。 */
  configId: string
  /** 名称。 */
  name: string
  /** 命令串。 */
  command: string
  /** 工作目录。 */
  cwd: string
  /** 状态。 */
  state: 'running' | 'exited' | 'failed'
  /** 退出码。 */
  exitCode: number | null
  /** 启动时间。 */
  startedAt: number
  /** 结束时间。 */
  endedAt: number | null
  /** 启动失败原因。 */
  error?: string
  /** 已输出字节数。 */
  bytes: number
}

/** 读取当前工作目录下的全部运行配置。 */
export function readRunConfigs(): Promise<ApiResult<{ configs: RunConfig[] }>> {
  return apiGet<{ configs: RunConfig[] }>('/run/configs')
}

/** 启动一个配置。 */
export function startRun(configId: string): Promise<ApiResult<RunProcess>> {
  return apiPost<RunProcess>('/run/start', { configId })
}

/** 停止一个实例。 */
export function stopRun(id: string): Promise<ApiResult<{ stopped: boolean }>> {
  return apiPost<{ stopped: boolean }>('/run/stop', { id })
}
