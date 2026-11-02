/**
 * 把项目树里的文件送进对话输入框的 @ 引用。
 *
 * 「@到对话」不由插件自己拼一段文本塞进 DOM：宿主的 composer 用原子引用（chip）
 * 表示文件，引用对象里的 source、label、appearance 与 clipboardText 决定了发送时的
 * 序列化文本。只有按 ui-reference 选中文件时的同一份结构插入，界面显示与发送内容
 * 才一致；模拟键盘输入会在含空格的路径、引号转义上分叉。
 *
 * 宿主能力按 sessionId 寻址（`ctx.get('conversation').input.shell`），插件不持有
 * 输入框实例：会话切换、重连后仍指向当前驻留的那一份输入模型。
 */
import type { PluginContext } from '../../types/plugin'

/** 宿主 composer 上的文件引用；字段与 ui-reference 选中文件后的插入结果一致。 */
interface ComposerFileReference {
  /** 引用来源名；文件引用统一走 `reference`。 */
  source: string
  /** 引用序列化文本，也就是发送时写进消息的 `@path`。 */
  ref: string
  /** chip 上显示的名字；目录带尾斜杠。 */
  label: string
  /** chip 外观：文件或目录。 */
  appearance: 'file' | 'folder'
  /** 复制到剪贴板时使用的文本。 */
  clipboardText: string
}

/** 宿主会话输入模型的最小子集；只声明本插件真正调用的方法。 */
interface HostComposerShell {
  addFiles?(references: readonly ComposerFileReference[], attachmentIds: readonly string[]): boolean
}

/** 宿主 conversation 服务的最小子集。 */
interface HostConversation {
  input?: {
    shell?(sessionId: string): HostComposerShell | undefined
  }
}

/** 把文件 @ 到对话的结果。 */
export type ComposerMentionResult =
  | { ok: true }
  | { ok: false; code: 'unavailable' | 'rejected' }

/** 插件上下文；未绑定或已卸载时为 undefined。 */
let clientContext: PluginContext | undefined

/**
 * 绑定插件上下文，供「@到对话」在点击时取宿主 composer。
 * @param ctx 插件上下文
 * @returns 注销函数
 */
export function bindComposerMention(ctx: PluginContext): () => void {
  clientContext = ctx

  return () => {
    clientContext = undefined
  }
}

// 生成文件的 @ 引用文本。
//
// 与宿主的引用语法保持一致：路径含空白时整体加引号，目录保留尾斜杠；
// 含引号或控制字符的路径无法被该语法表达，返回 null 而不是插入一段坏文本。
function fileMentionOf(path: string, directory: boolean): string | null {
  const target = directory ? `${path.replace(/\/+$/, '')}/` : path

  // 项目根（空串）没有可引用的名字，目录拼完只剩 `/` 同样不可引用
  if (target === '' || target === '/') return null

  // 引用语法用引号包裹含空白的路径，路径自带的引号与换行会破坏这个边界
  if (/[\u0000-\u001f\u007f-\u009f"]/u.test(target)) return null

  // 目录保留开引号，把光标交还输入框后可以继续往下钻目录
  if (/\s/u.test(target)) return directory ? `@"${target}` : `@"${target}"`

  return `@${target}`
}

// 取路径的最后一段。
function baseNameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

/**
 * 把文件或目录 @ 到指定会话的对话输入框。
 * @param sessionId 目标会话
 * @param path 相对工作区根的路径
 * @param directory 目标是否目录
 * @returns 成功，或失败码（宿主能力缺席 / 输入框正在提交而拒绝）
 */
export function mentionFileInComposer(
  sessionId: string,
  path: string,
  directory: boolean,
): ComposerMentionResult {
  if (sessionId === '' || path === '' || clientContext === undefined) {
    return { ok: false, code: 'unavailable' }
  }

  const mention = fileMentionOf(path, directory)

  if (mention === null) return { ok: false, code: 'unavailable' }

  const reference: ComposerFileReference = {
    source: 'reference',
    ref: mention,
    label: directory ? `${baseNameOf(path)}/` : baseNameOf(path),
    appearance: directory ? 'folder' : 'file',
    clipboardText: mention,
  }

  try {
    const conversation = clientContext.get?.('conversation') as HostConversation | undefined
    const shell = conversation?.input?.shell?.(sessionId)

    // 宿主版本没有这段能力时宁可提示失败，也不退回模拟键盘输入
    if (shell === undefined || typeof shell.addFiles !== 'function') {
      return { ok: false, code: 'unavailable' }
    }

    return shell.addFiles([reference], []) ? { ok: true } : { ok: false, code: 'rejected' }
  } catch (error) { // 会话未保留、宿主内部版本差异都在这里收敛成一次失败提示
    console.error('[dsh-ide] @到对话失败:', error)

    return { ok: false, code: 'unavailable' }
  }
}
