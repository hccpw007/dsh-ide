/**
 * 项目树右键菜单的动作实现。
 *
 * 菜单本身只负责展示与回调，具体每一步落到哪个宿主接口由这里决定：
 * 新建 / 重命名 / 删除、.gitignore 读写走 `/fs/*`，暂存走 `/git/exec`，
 * 打开差异走编辑器标签。与树的遍历逻辑分开，是为了让「菜单项 → 宿主调用」
 * 这条链能独立阅读与修改。
 */
import { apiGet, apiPost } from '../../../common/api'
import type { Translate } from '../../../types/plugin'
import type { IdeServices } from '../../shell/contract'

import type { MenuAction } from './context-menu'
import { parentPathOf } from './data'

/** .gitignore 相对工作区根的路径。 */
const GITIGNORE_PATH = '.gitignore'

/** 动作执行上下文。 */
export interface ActionContext {
  /** 工作区根。 */
  root: string
  /** 工作台服务总线。 */
  services: IdeServices
  /** 已绑定 projectTree 前缀的翻译函数。 */
  t: Translate
  /** 右键目标是否已被 .gitignore 忽略。 */
  ignored: boolean
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
  const parent = target.directory ? target.path : parentPathOf(target.path)

  // 根节点下新建时父路径是空串，直接拼会多出一个前导 `/`，变成绝对路径
  return parent === '' ? name : `${parent}/${name}`
}

/**
 * 取路径的最后一段。
 * @param path 相对路径
 * @returns 条目名
 */
function baseNameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

/**
 * 从剪贴板文本解析「复制」写下的源相对路径。
 *
 * 只接受首行且必须是相对路径：粘贴靠 `/fs/copy` 在工作区内定位源条目，
 * 而系统剪贴板可能来自任意应用，绝对路径既无法可靠映射回工作区也不该被信任。
 * @param text 剪贴板文本
 * @returns 源相对路径；没有可用来源时返回 null
 */
function parseClipboardSource(text: string): string | null {
  const candidate = (text.split(/\r?\n/)[0] ?? '').trim()

  if (candidate === '' || candidate.startsWith('/')) return null

  return candidate
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
 * 把目标写入 .gitignore。
 *
 * 已被忽略的目标改成追加 `!path`（取消忽略），对应菜单里的「(unignore)」文案。
 * 路径以 `/` 开头锚定到仓库根，避免同名规则误伤深层目录。
 * @param path 目标相对路径
 * @param directory 目标是否目录
 * @param context 动作上下文
 */
async function toggleGitignore(path: string, directory: boolean, context: ActionContext): Promise<void> {
  const { root, services, t, ignored } = context
  const entry = directory ? `/${path}/` : `/${path}`
  const line = ignored ? `!${entry}` : entry

  const current = await apiGet<{ text: string; version: string }>('/fs/read', { root, path: GITIGNORE_PATH })

  // 只有「文件还不存在」才按空内容处理；其余读取失败不能悄悄覆盖用户的 .gitignore
  if (!current.ok && current.error.code !== 'NOT_FOUND') {
    services.toast('error', current.error.message)

    return
  }

  const text = current.ok ? current.value.text : ''

  if (text.split('\n').some((existing) => existing.trim() === line)) {
    services.toast('info', t('gitignoreExists'))

    return
  }

  const next = text === '' || text.endsWith('\n') ? `${text}${line}\n` : `${text}\n${line}\n`
  const written = await apiPost('/fs/write', {
    root,
    path: GITIGNORE_PATH,
    text: next,
    // 文件刚读过就带上版本，期间被外部改写时宿主会拒绝写入而不是覆盖
    expectedVersion: current.ok ? current.value.version : '',
  })

  if (!written.ok) {
    services.toast('error', written.error.message)

    return
  }

  services.refreshGitStatus()
  services.invalidate()
  services.toast('success', t(ignored ? 'gitignoreUnignored' : 'gitignoreAdded'))
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
    case 'newFile':
    case 'newDirectory':
    case 'rename':
      context.openPrompt({ kind: action, path, directory })
      break

    case 'delete':
      context.openPrompt({ kind: 'deleteConfirm', path, directory })
      break

    case 'copy':
      // 写相对路径而不只是文件名：粘贴要靠它定位工作区内的源条目，只存名字会丢掉父目录
      void copyToClipboard(path === '' ? root : path, context)
      break

    case 'copyPath':
      // 与 IDEA 的 Copy Path/Reference 默认项一致：复制绝对路径
      void copyToClipboard(path === '' ? root : `${root}/${path}`, context)
      break

    case 'paste':
      // 剪贴板里是「复制」写下的源相对路径，宿主按目标目录落盘并在重名时生成副本
      void navigator.clipboard
        .readText()
        .then((text) => {
          const source = parseClipboardSource(text)

          if (source === null) {
            services.toast('error', t('pasteEmpty'))

            return
          }

          const destination = childPathOf(target, baseNameOf(source))

          void apiPost('/fs/copy', { root, from: source, to: destination }).then((result) => {
            if (result.ok) {
              services.invalidate(directory ? path : parentPathOf(path))
              // 粘贴出的条目是仓库里的新文件：重读 Git 状态才会按未跟踪显示为红色
              services.refreshGitStatus()
              services.toast('success', t('pasted'))
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

    case 'modifyRunConfig':
      // 运行面板没有绑定具体配置的能力，这里按 IDEA「没有匹配配置」的分支进入新建
      services.requestRunConfigCreate()
      break

    case 'openInTerminal': {
      // 文件没有可 cd 的目录，落到它所在的目录；根节点直接用工作区根。
      // 传绝对路径：终端进程的起始 cwd 未必就是工作区根，相对路径会 cd 到错误位置。
      const targetDir = directory ? path : parentPathOf(path)

      services.requestTerminalAt(targetDir === '' ? root : `${root}/${targetDir}`)
      break
    }

    case 'openInFinder':
      void apiPost('/fs/reveal', { root, path }).then((result) => {
        if (!result.ok) services.toast('error', result.error.message)
      })
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

    case 'toggleGitignore':
      void toggleGitignore(path, directory, context)
      break
  }
}
