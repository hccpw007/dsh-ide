/**
 * 「更新工程」的执行逻辑。
 *
 * IDEA 的 Update Project 是一个组合动作：先抓远端引用，再把当前分支的上游合入或
 * 变基进来。工具栏图标与更新对话框都调用这里，步骤顺序与状态刷新只写一遍，
 * 不出现「不同入口行为不一致」；命令回显由 git/api 统一写入控制台。
 */
import type { ApiResult } from '../../../common/api'
import type { Translate } from '../../../types/plugin'
import type { IdeServices, UpdateProjectMode } from '../../shell/contract'

import { fetchAll, merge, readRefs, rebase, resetBranch, type GitRunOutput } from './api'

/** 更新方式直接复用设置契约里的同名类型，避免两处字面量联合各自演化。 */
export type { UpdateProjectMode }

/** 一步写操作的结果；失败时 message 是 git 的原始错误输出。 */
interface StepResult {
  /** 是否成功。 */
  ok: boolean
  /** 失败原因；成功时为空串。 */
  message: string
}

/**
 * 读取当前分支的上游分支名。
 *
 * 用显式上游名而不是 `@{u}`：没有跟踪分支时能提前拦下，给出可读提示，
 * 而不是把 git 的 fatal 原文直接抛给用户。
 * @param cwd 工作区根
 * @returns 上游分支名；不是仓库或没有跟踪分支时为空串
 */
async function readUpstream(cwd: string): Promise<string> {
  const result = await readRefs(cwd)

  if (!result.ok) return ''

  return result.value.local.find((branch) => branch.isHead)?.upstream ?? ''
}

/**
 * 执行一条写命令；命令与控制台记录由 api 层统一处理。
 * @param action 实际调用
 * @returns 执行结果
 */
async function runStep(action: () => Promise<ApiResult<GitRunOutput>>): Promise<StepResult> {
  const result = await action()

  if (!result.ok) return { ok: false, message: result.error.message }

  return { ok: true, message: '' }
}

/**
 * 把上游更新进当前分支。
 * @param cwd 工作区根
 * @param mode 合并进当前分支，或把当前分支变基到上游之上
 * @param services 工作台服务：提示、Git 状态刷新与文件变更广播
 * @param t 翻译函数；key 带 `git.` 前缀
 */
export async function updateProject(
  cwd: string,
  mode: UpdateProjectMode,
  services: IdeServices,
  t: Translate,
): Promise<void> {
  if (cwd === '') return

  const upstream = await readUpstream(cwd)

  // 没有跟踪分支就无从比较，直接提示，避免 git 抛出 "no upstream configured"
  if (upstream === '') {
    services.toast('error', t('git.updateProjectNoUpstream'))

    return
  }

  // 先抓远端：不 fetch 时合并的永远是上一次抓到的引用
  const fetched = await runStep(() => fetchAll(cwd))

  if (!fetched.ok) {
    services.toast('error', `${t('git.updateProjectFetchFailed')}: ${fetched.message}`)

    return
  }

  const applied = await runStep(() => (mode === 'rebase' ? rebase(cwd, upstream) : merge(cwd, upstream)))

  // 冲突与网络中断都落在这里：原始输出已进控制台，通知里保留 git 的说明
  if (!applied.ok) {
    services.toast('error', `${t('git.updateProjectFailed')}: ${applied.message}`)

    return
  }

  services.refreshGitStatus()
  services.invalidate()
  services.toast('info', t('git.updateProjectSuccess'))
}

/**
 * 把当前分支重置到上游远端分支。
 *
 * 与 IDEA 的 Reset to the Remote Branch 一致：先抓远端拿到最新上游，再 `reset --hard`
 * 过去。本地未推送的提交会随之丢弃，因此调用方必须先向用户确认。
 * @param cwd 工作区根
 * @param services 工作台服务：提示、Git 状态刷新与文件变更广播
 * @param t 翻译函数；key 带 `git.` 前缀
 */
export async function resetToRemoteBranch(cwd: string, services: IdeServices, t: Translate): Promise<void> {
  if (cwd === '') return

  const upstream = await readUpstream(cwd)

  if (upstream === '') {
    services.toast('error', t('git.updateProjectNoUpstream'))

    return
  }

  const fetched = await runStep(() => fetchAll(cwd))

  if (!fetched.ok) {
    services.toast('error', `${t('git.updateProjectFetchFailed')}: ${fetched.message}`)

    return
  }

  const reset = await runStep(() => resetBranch(cwd, upstream, 'hard'))

  if (!reset.ok) {
    services.toast('error', `${t('git.updateProjectResetFailed')}: ${reset.message}`)

    return
  }

  services.refreshGitStatus()
  services.invalidate()
  services.toast('info', t('git.updateProjectResetSuccess'))
}
