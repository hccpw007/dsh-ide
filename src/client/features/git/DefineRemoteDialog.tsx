/**
 * Define Remote 对话框。
 *
 * 复刻 IDEA 的远端配置窗：上方是远端名字，中间是地址，下方决定保存后是否立即
 * 拉取，底部是取消与确定。Push 弹窗在远端还没配置好时通过它补齐 origin。
 */
import React, { useCallback, useEffect, useState } from 'react'

import type { DialogFrameStore } from '../../../common/dialog-size'
import { useDialogFrame } from '../../../common/dialog-frame'
import type { Translate } from '../../../types/plugin'
import { Checkbox } from '../../common/Checkbox'

import { defineRemote } from './api'

/** 弹窗默认大小：最多 620×240，刚好放下两行表单与底部按钮。 */
const INITIAL_SIZE = { widthRatio: 1, heightRatio: 1, maxWidth: 620, maxHeight: 240 }

/** 缩放下限：再小输入框与底部按钮就挤在一起。 */
const MIN_SIZE = { width: 420, height: 220 }

/** 弹窗标识：尺寸单独记忆。 */
const SIZE_KEY = 'git-define-remote'

/** 对话框 props。 */
export interface DefineRemoteDialogProps {
  /** 已绑定 git 前缀的翻译函数。 */
  t: Translate
  /** 工作区根。 */
  root: string
  /** 远端名初始值，通常取自待推送目标。 */
  name: string
  /** 几何信息存取入口；拖拽结束后写回设置。 */
  dialogSizes: DialogFrameStore
  /** 保存成功，父级据此重读待推送内容。 */
  onSaved(): void
  /** 关闭对话框，不修改任何配置。 */
  onClose(): void
}

/**
 * 渲染 Define Remote 对话框。
 * @param props 见 DefineRemoteDialogProps
 * @returns 遮罩 + 对话框
 */
export function DefineRemoteDialog({
  t,
  root,
  name,
  dialogSizes,
  onSaved,
  onClose,
}: DefineRemoteDialogProps): React.ReactElement {
  const [remoteName, setRemoteName] = useState(name)
  const [url, setUrl] = useState('')
  /** 保存后是否立即拉取；默认勾选，与 IDEA 的初始状态一致。 */
  const [fetch, setFetch] = useState(true)
  const [busy, setBusy] = useState(false)
  const [errorText, setErrorText] = useState('')
  const { style, rootRef, dragProps, handle } = useDialogFrame(dialogSizes, {
    key: SIZE_KEY,
    initial: INITIAL_SIZE,
    min: MIN_SIZE,
  })

  /** 保存远端配置；成功后由父级重读待推送内容。 */
  const save = useCallback(async (): Promise<void> => {
    if (busy) return

    setBusy(true)

    try {
      const result = await defineRemote(root, { name: remoteName.trim(), url: url.trim(), fetch })

      if (!result.ok) {
        console.error('[dsh-ide] 定义远端失败:', result.error)
        setErrorText(result.error.message)

        return
      }

      onSaved()
      onClose()
    } catch (error) { // 网络层异常不会带 ApiResult，留痕后让用户重试
      console.error('[dsh-ide] 定义远端失败:', error)
      setErrorText(String(error))
    } finally {
      setBusy(false)
    }
  }, [busy, fetch, onClose, onSaved, remoteName, root, url])

  // Esc 关闭、Enter 保存：与桌面 IDE 的对话框习惯一致
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()

      if (event.key === 'Enter') {
        // 拦住默认行为，避免同一个回车又触发一次焦点按钮
        event.preventDefault()
        void save()
      }
    }

    window.addEventListener('keydown', onKeyDown, true)

    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onClose, save])

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-start justify-center bg-black/30 pt-24"
      // 点击遮罩关闭；保存进行中不允许关闭
      onClick={() => {
        if (!busy) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('defineRemoteTitle')}
        className="relative flex flex-col overflow-hidden rounded-[12px] border border-[color:var(--ide-dialog-border)] bg-[var(--ide-dialog-bg)] shadow-2xl"
        style={style}
        ref={rootRef}
        onClick={(event) => event.stopPropagation()}
      >
        {/* 标题行：只留标题，按住可拖动弹窗位置 */}
        <div className="flex shrink-0 cursor-move select-none items-center px-5 pb-2 pt-3.5" {...dragProps}>
          {/* 对话框标题：Define Remote */}
          <span className="whitespace-nowrap text-[13px] font-bold text-[color:var(--ide-dialog-fg)]">
            {t('defineRemoteTitle')}
          </span>
        </div>

        {/* 表单：左侧是字段名，右侧是输入框，两行对齐 */}
        <div className="grid min-h-0 flex-1 grid-cols-[56px_1fr] items-center gap-x-3 gap-y-2.5 px-5 py-2">
          {/* 远端名字段：已存在的远端会被改写，新名字则新增 */}
          <span className="text-[13px] text-[color:var(--ide-dialog-fg)]">{t('defineRemoteName')}</span>

          <input
            value={remoteName}
            onChange={(event) => setRemoteName(event.target.value)}
            aria-label={t('defineRemoteName')}
            className="h-7 w-full min-w-0 rounded-[3px] border border-[color:var(--ide-dialog-control-border)] bg-[var(--ide-dialog-control-bg)] px-2 text-[13px] text-[color:var(--ide-dialog-fg)] outline-none focus:border-[color:var(--ide-ic-blue)]"
          />

          {/* 远端地址字段：空值时确定按钮无事可做，交给宿主校验拦截 */}
          <span className="text-[13px] text-[color:var(--ide-dialog-fg)]">{t('defineRemoteUrl')}</span>

          <input
            autoFocus
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            aria-label={t('defineRemoteUrl')}
            className="h-7 w-full min-w-0 rounded-[3px] border border-[color:var(--ide-dialog-control-border)] bg-[var(--ide-dialog-control-bg)] px-2 text-[13px] text-[color:var(--ide-dialog-fg)] outline-none focus:border-[color:var(--ide-ic-blue)]"
          />
        </div>

        <div className="shrink-0 px-5 pb-1">
          {/* 勾选后保存的同时从该远端拉取一次分支与标签 */}
          <Checkbox
            checked={fetch}
            onChange={setFetch}
            label={t('defineRemoteFetch')}
            className="text-[13px] text-[color:var(--ide-dialog-fg)]"
          />
        </div>

        {errorText !== '' && (
          <div className="shrink-0 px-5 pt-1 text-[12px] text-danger">{errorText}</div>
        )}

        {/* 底部操作行：取消与确定 */}
        <div className="flex shrink-0 items-center justify-end gap-2.5 px-4 pb-4 pt-2">
          {/* 取消：不修改任何远端配置 */}
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="h-7 shrink-0 whitespace-nowrap rounded-[4px] border border-[color:var(--ide-dialog-control-border)] bg-[var(--ide-dialog-control-bg)] px-4 text-[13px] text-[color:var(--ide-dialog-fg)] hover:bg-[var(--ide-dialog-hover-bg)] disabled:cursor-default disabled:opacity-60"
          >
            {t('cancel')}
          </button>

          {/* 确定：写入远端配置，合格时顺带拉取 */}
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="h-7 shrink-0 whitespace-nowrap rounded-[4px] bg-[var(--ide-dialog-accent)] px-6 text-[13px] font-medium text-white hover:bg-[var(--ide-dialog-accent-hover)] disabled:cursor-default disabled:opacity-60"
          >
            {t('ok')}
          </button>
        </div>

        {handle}
      </div>
    </div>
  )
}
