/**
 * Log 提交行右键菜单里需要组合多个步骤的动作。
 *
 * 单条 git 命令的动作留在 LogTab 直接调 api；这里收的是要拼文件路径、要读额外数据
 * 或要在列表里找相邻提交的：生成补丁文件、计算菜单可用状态、定位子/父提交。
 */
import { apiPost, type ApiResult } from '../../../common/api'

import { createPatch, type GitCommit } from './api'
import type { CommitMenuContext } from './log-menus'

/** 补丁文件扩展名。 */
const PATCH_EXTENSION = '.patch'

/** 文件名里保留的标题长度上限，避免超长标题撑爆文件名。 */
const SUBJECT_MAX_LENGTH = 60

/**
 * 计算提交菜单的可用状态。
 * @param commit 右键的提交
 * @param commits 当前可见的提交
 * @param headHash 当前检出提交的短 hash；没有检出提交时为空串
 * @returns 菜单上下文
 */
export function commitMenuContext(
  commit: GitCommit,
  commits: readonly GitCommit[],
  headHash: string,
): CommitMenuContext {
  const parentHash = commit.parents[0] ?? ''

  return {
    isHead: headHash !== '' && commit.shortHash === headHash,
    // 根提交没有父提交，丢弃它等于清空历史
    canDrop: commit.parents.length > 0,
    hasChild: commits.some((item) => item.parents.includes(commit.hash)),
    hasParent: parentHash !== '' && commits.some((item) => item.hash === parentHash),
  }
}

/**
 * 在可见提交里找子提交或父提交。
 * @param commit 当前提交
 * @param commits 当前可见的提交
 * @param direction child 找第一个把它当父提交的提交；parent 找它的第一个父提交
 * @returns 目标提交；列表里没有时返回 undefined
 */
export function neighbourCommit(
  commit: GitCommit,
  commits: readonly GitCommit[],
  direction: 'child' | 'parent',
): GitCommit | undefined {
  if (direction === 'child') return commits.find((item) => item.parents.includes(commit.hash))

  return commits.find((item) => item.hash === commit.parents[0])
}

/**
 * 把提交标题清洗成可做文件名的片段。
 * @param subject 提交标题
 * @returns 只保留字母、数字、中文与常见标点的短串；全是非法字符时退回 patch
 */
function slugOf(subject: string): string {
  const slug = subject
    .replace(/[^\w\u4e00-\u9fa5.-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, SUBJECT_MAX_LENGTH)

  return slug === '' ? 'patch' : slug
}

/**
 * 生成一个提交的补丁文件，写在工作区根目录。
 *
 * 与 IDEA 一样放在项目根：文件名带短 hash 与标题，生成后立刻能在项目树里取走。
 * @param root 工作区根
 * @param commit 目标提交
 * @returns 成功时带回相对工作区的文件路径
 */
export async function writePatch(root: string, commit: GitCommit): Promise<ApiResult<{ path: string }>> {
  const generated = await createPatch(root, commit.hash)

  if (!generated.ok) return { ok: false, error: generated.error }

  const path = `${commit.shortHash}-${slugOf(commit.subject)}${PATCH_EXTENSION}`
  const written = await apiPost<{ version: string }>('/fs/write', {
    root,
    path,
    text: generated.value.patch,
    // 同名文件直接覆盖：存在同名补丁说明上一次生成的内容已过时
    expectedVersion: '',
  })

  if (!written.ok) return { ok: false, error: written.error }

  return { ok: true, value: { path } }
}
