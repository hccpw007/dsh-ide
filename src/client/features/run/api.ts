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

/**
 * 读取某个工作空间的运行配置。
 *
 * 配置以工作空间为维度隔离：换个目录看到的是一份独立列表，同一目录的多个会话共享。
 * @param root 工作空间根路径
 */
export function readRunConfigs(root: string): Promise<ApiResult<{ configs: RunConfig[] }>> {
  return apiGet<{ configs: RunConfig[] }>('/run/configs', { root })
}

/**
 * 启动一个配置。
 * @param root 配置所属的工作空间根路径
 * @param configId 配置 id
 */
export function startRun(root: string, configId: string): Promise<ApiResult<RunProcess>> {
  return apiPost<RunProcess>('/run/start', { root, configId })
}

/**
 * 删除一个配置。
 * @param root 配置所属的工作空间根路径
 * @param id 配置 id
 */
export function deleteRunConfig(root: string, id: string): Promise<ApiResult<null>> {
  return apiPost<null>('/run/config-delete', { root, id })
}

/**
 * 保存一个配置；id 为空表示新建。
 * @param root 配置所属的工作空间根路径
 * @param config 配置内容
 */
export function saveRunConfig(
  root: string,
  config: { id: string; name: string; command: string; cwd: string },
): Promise<ApiResult<{ config: RunConfig }>> {
  return apiPost<{ config: RunConfig }>('/run/config-save', { root, config })
}

/** 停止一个实例。 */
export function stopRun(id: string): Promise<ApiResult<{ stopped: boolean }>> {
  return apiPost<{ stopped: boolean }>('/run/stop', { id })
}
