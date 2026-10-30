/**
 * 「Add」动作：把项目树里选中的文件或文件夹加入 Git 索引。
 *
 * IDEA 顶部的 Add 只对未纳入版本控制的条目可用，所以这里同时提供可执行判断：
 * 选中文件时看它自己在 Git 状态里的字母，选中目录时看它下面有没有未跟踪文件。
 */
import type { Translate } from '../../../types/plugin'
import type { IdeServices, TreeSelection } from '../../shell/contract'

import { stage } from './api'

/**
 * 判断选中项是否还有未纳入版本控制的文件。
 * @param selection 项目树选中项
 * @param status 相对路径 → Git 状态字母
 * @returns 可以执行 add 时返回 true
 */
export function canAddSelection(selection: TreeSelection, status: ReadonlyMap<string, string>): boolean {
  // 目录本身通常不在状态表里（git 只列文件），所以看它下面有没有未跟踪文件
  if (selection.directory) {
    if (status.get(selection.path) === '?') return true

    const prefix = selection.path === '' ? '' : `${selection.path}/`

    for (const [path, code] of status) {
      if (code === '?' && path.startsWith(prefix)) return true
    }

    return false
  }

  return status.get(selection.path) === '?'
}

/**
 * 把选中项加入 Git 索引。
 * @param root 工作区根
 * @param selection 项目树选中项
 * @param label 提示里显示的目标名；项目根用工作区目录名
 * @param services 工作台服务：错误通知、提示与 Git 状态刷新
 * @param t 翻译函数；key 带 `git.` 前缀
 */
export async function addSelection(
  root: string,
  selection: TreeSelection,
  label: string,
  services: IdeServices,
  t: Translate,
): Promise<void> {
  if (root === '') return

  // 空路径是项目根，git 里用 `.` 表示
  const target = selection.path === '' ? '.' : selection.path
  const result = await stage(root, [target])

  if (!result.ok) {
    services.toast('error', result.error.message)

    return
  }

  services.refreshGitStatus()
  services.toast('success', t('git.addedToGit').replace('{path}', label))
}
