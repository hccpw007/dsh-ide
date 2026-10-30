/**
 * 项目树右键菜单的动作实现。
 *
 * 菜单本身只负责展示与回调，具体每一步落到哪个宿主接口由这里决定：
 * 新建 / 重命名 / 删除走 `/fs/*`，暂存走 `/git/exec`，打开差异走编辑器标签。
 * 与树的遍历逻辑分开，是为了让「菜单项 → 宿主调用」这条链能独立阅读与修改。
 */
import { apiPost } from '../../../common/api'
import { cn as _cn } from '../../../common/cn'
import type { Translate } from '../../../types/plugin'
import type { IdeServices } from '../../shell/contract'

import type { MenuAction } from './context-menu'
import { parentPathOf } from './data'

/** 动作执行上下文。 */
export interface ActionContext {
  /** 工作区根。 */
  root: string
  /** 工作台服务总线。 */
  services: IdeServices
  /** 已绑定 projectTree 前缀的翻译函数。 */
  t: Translate
  /** 打开新建 / 重命名 / 删除确认框。 */
  openPrompt(prompt: PromptRequest): void
}

/** 对话框请求。 */
export type PromptRequest =
  | { kind: 'newFile' | 'newDirectory' | 'rename'; path: string; directory: boolean }
  | { kind: 'deleteConfirm'; path: string; directory: boolean }

/**
 * 计算新建条目的完整相对路径。
 * @param target 右键目标
 * @param name 用户输入的名字
 * @returns 相对路径
 */
export function childPathOf(target: { path: string; directory: boolean }, name: string): string {
  return target.directory ? `${target.path}/${name}` : `${parentPathOf(target.path)}/${name}`
}

/**
 * 把文本写入剪贴板。
 * @param text 要复制的内容
 * @param context 动作上下文
 */
async function copyToClipboard(text: string, context: ActionContext): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    context.services.toast('success', context.t('copied'))
  } catch (error) { // 非安全上下文或权限被拒时给出提示而不是静默
    console.error('[dsh-ide] 复制失败:', error)
    context.services.toast('error', context.t('copyFailed'))
  }
}

/**
 * 执行一个右键菜单动作。
 * @param action 动作
 * @param path 目标路径
 * @param directory 目标是否目录
 * @param context 动作上下文
 */
export function runMenuAction(
  action: MenuAction,
  path: string,
  directory: boolean,
  context: ActionContext,
): void {
  const { root, services, t } = context
  const target = { path, directory }

  switch (action) {
    case 'open':
    case 'openInEditor':
      if (!directory) {
        services.openFile(path)
      }
      break

    case 'newFile':
    case 'newDirectory':
    case 'rename':
      context.openPrompt({ kind: action, path, directory })
      break

    case 'delete':
      context.openPrompt({ kind: 'deleteConfirm', path, directory })
      break

    case 'copy':
      void copyToClipboard(path.slice(path.lastIndexOf('/') + 1), context)
      break

    case 'copyPath':
      void copyToClipboard(`${root}/${path}`, context)
      break

    case 'copyRelativePath':
      void copyToClipboard(path, context)
      break

    case 'paste':
      // 粘贴把剪贴板里的文件名当作源：宿主只能复制工作区内的条目
      void navigator.clipboard
        .readText()
        .then((text) => {
          const name = text.trim().split('\n')[0] ?? ''
          if (name === '' || name.includes('/')) {
            services.toast('error', t('pasteEmpty'))

            return
          }

          void apiPost('/fs/copy', { root, from: name, to: childPathOf(target, name) }).then((result) => {
            if (result.ok) {
              services.invalidate(directory ? path : parentPathOf(path))
              services.toast('success', t('created'))
            } else {
              services.toast('error', result.error.message)
            }
          })
        })
        .catch((error: unknown) => {
          console.error('[dsh-ide] 读取剪贴板失败:', error)
          services.toast('error', t('pasteEmpty'))
        })
      break

    case 'findInFiles':
      services.openBottomPanel('search')
      break

    case 'showDiff':
      services.openDiff({ kind: 'worktree', path, staged: false })
      break

    case 'gitAdd':
      void apiPost('/git/exec', { method: 'stage', cwd: root, paths: [path] }).then((result) => {
        if (result.ok) {
          services.refreshGitStatus()
          services.toast('success', t('gitStaged'))
        } else {
          services.toast('error', result.error.message)
        }
      })
      break

    case 'reloadFromDisk':
      services.invalidate(directory ? path : parentPathOf(path))
      break
  }
}

// 菜单项的样式由菜单组件负责，这里显式引用 cn 只为保持导入一致性
void _cn
