/**
 * Git 面板的 Shelf 页签。
 *
 * IDEA 的 Shelf 用来存放搁置的改动，对应 Git 的 stash 栈。布局与 Local Changes
 * 一致：左侧竖向工具栏，右侧是搁置列表。工具栏上的动作都作用于选中的那一条，
 * 没有选中时置灰，避免误操作栈顶。
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'

import type { ApiResult } from '../../../common/api'
import { cn } from '../../../common/cn'
import { useDialogResize } from '../../../common/dialog-resize'
import type { Translate } from '../../../types/plugin'
import type { IdeServices } from '../../shell/contract'

import {
  applyStash,
  dropStash,
  popStash,
  readStashes,
  stashChanges,
  type GitRunOutput,
  type GitStash,
} from './api'
import { recordGitConsole } from './console-store'
import { GitSideToolbar, type GitToolbarItem } from './GitSideToolbar'
import { closeIcon, collapseIcon, popStashIcon, refreshIcon, stashIcon, trashIcon, unstashIcon } from './icons'
import { ContextMenu, type MenuItem, type MenuState } from './menu'

/** 丢弃搁置的确认框默认大小。 */
const DROP_CONFIRM_INITIAL_SIZE = { width: 360, height: 160 }

/** 丢弃搁置的确认框缩放下限。 */
const DROP_CONFIRM_MIN_SIZE = { width: 280, height: 140 }

/** Shelf 页签 props。 */
export interface ShelfTabProps {
  /** 已绑定 git 前缀的翻译函数。 */
  t: Translate
  /** 工作台服务总线。 */
  services: IdeServices
  /** 工作区根。 */
  root: string
}

/**
 * 渲染 Shelf 页签。
 * @param props 见 ShelfTabProps
 * @returns 工具栏与搁置列表
 */
export function ShelfTab({ t, services, root }: ShelfTabProps): React.ReactElement {
  const [stashes, setStashes] = useState<GitStash[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  /** 需要二次确认的动作。 */
  const [confirm, setConfirm] = useState<{ title: string; message: string; run(): void } | null>(null)
  /** 丢弃搁置的确认框：右下角可拖拽调整大小，尺寸跟着设置走。 */
  const dropConfirmResize = useDialogResize(services.dialogSizes, {
    key: 'git-stash-drop',
    initial: DROP_CONFIRM_INITIAL_SIZE,
    min: DROP_CONFIRM_MIN_SIZE,
  })

  /** 重新读取搁置栈。 */
  const refresh = useCallback(async (): Promise<void> => {
    if (root === '') {
      setStashes([])

      return
    }

    const result = await readStashes(root)

    if (!result.ok) {
      // 不是仓库属于正常状态，不当作错误弹提示
      setStashes([])
      setError(result.error.code === 'GIT_NOT_REPOSITORY' ? '' : result.error.message)

      return
    }

    setStashes(result.value.stashes)
    setError('')
  }, [root])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // 其它页签执行写操作后搁置栈也可能变化，跟着重读
  useEffect(() => services.subscribeGitStatus(() => void refresh()), [refresh, services])

  // 列表刷新后丢弃已经不存在的选中项，避免工具栏指向一条已删除的记录
  useEffect(() => {
    if (selected !== null && !stashes.some((item) => item.selector === selected)) setSelected(null)
  }, [selected, stashes])

  /**
   * 执行一次写操作，记录控制台并刷新列表。
   * @param display 失败时用于回显的命令行
   * @param action 实际调用
   */
  const run = useCallback(
    async (display: string, action: () => Promise<ApiResult<GitRunOutput>>): Promise<void> => {
      setBusy(true)

      try {
        const result = await action()

        if (!result.ok) {
          recordGitConsole({ cwd: root, command: display, stdout: '', stderr: result.error.message, ok: false })
          setError(result.error.message)

          return
        }

        recordGitConsole({
          cwd: root,
          command: result.value.command,
          stdout: result.value.stdout,
          stderr: result.value.stderr,
          ok: true,
        })
        setError('')
        await refresh()
        services.refreshGitStatus()
        services.invalidate()
      } finally {
        setBusy(false)
      }
    },
    [refresh, root, services],
  )

  const selectedStash = useMemo(
    () => stashes.find((item) => item.selector === selected) ?? null,
    [selected, stashes],
  )

  /**
   * 删除一条搁置记录，先弹二次确认。
   * @param item 搁置记录
   */
  const askDrop = useCallback(
    (item: GitStash): void => {
      setConfirm({
        title: t('dropStash'),
        message: t('dropStashConfirm').replace('{selector}', item.selector),
        run: () => void run(`git stash drop ${item.selector}`, () => dropStash(root, item.selector)),
      })
    },
    [root, run, t],
  )

  /**
   * 打开搁置条目右键菜单。
   * @param event 鼠标事件
   * @param item 搁置记录
   */
  const openMenu = useCallback(
    (event: React.MouseEvent, item: GitStash): void => {
      event.preventDefault()
      setSelected(item.selector)

      const items: MenuItem[] = [
        { id: 'apply', label: t('unshelve'), run: () => void run(`git stash apply ${item.selector}`, () => applyStash(root, item.selector)) },
        { id: 'pop', label: t('popStash'), run: () => void run(`git stash pop ${item.selector}`, () => popStash(root, item.selector)) },
        { id: 'drop', label: t('dropStash'), danger: true, separatorBefore: true, run: () => askDrop(item) },
        {
          id: 'copy',
          label: t('copySelector'),
          separatorBefore: true,
          run: () => {
            void navigator.clipboard.writeText(item.selector).then(
              () => services.toast('success', t('copied')),
              (copyError: unknown) => {
                console.error('[dsh-ide] Failed to copy stash name:', copyError)
                services.toast('error', t('copyFailed'))
              },
            )
          },
        },
      ]

      setMenu({ x: event.clientX, y: event.clientY, items })
    },
    [askDrop, root, run, services, t],
  )

  /** 左侧工具栏：顺序照 IDEA 的 Shelf 页签，未接上能力的项保持可见但禁用。 */
  const toolbar: GitToolbarItem[] = [
    {
      id: 'shelve',
      title: t('shelveChanges'),
      icon: stashIcon(),
      unavailable: busy ? t('loading') : undefined,
      onClick: () => void run('git stash push', () => stashChanges(root)),
    },
    {
      id: 'refresh',
      title: t('refresh'),
      icon: refreshIcon(),
      unavailable: busy ? t('loading') : undefined,
      onClick: () => void refresh(),
    },
    {
      id: 'apply',
      title: t('unshelve'),
      icon: unstashIcon(),
      separatorBefore: true,
      unavailable: selectedStash === null ? t('selectStashFirst') : undefined,
      onClick: selectedStash === null ? undefined : () => void run(`git stash apply ${selectedStash.selector}`, () => applyStash(root, selectedStash.selector)),
    },
    {
      id: 'pop',
      title: t('popStash'),
      icon: popStashIcon(),
      unavailable: selectedStash === null ? t('selectStashFirst') : undefined,
      onClick: selectedStash === null ? undefined : () => void run(`git stash pop ${selectedStash.selector}`, () => popStash(root, selectedStash.selector)),
    },
    {
      id: 'drop',
      title: t('dropStash'),
      icon: trashIcon(),
      unavailable: selectedStash === null ? t('selectStashFirst') : undefined,
      onClick: selectedStash === null ? undefined : () => askDrop(selectedStash),
    },
    {
      id: 'collapse',
      title: t('collapseAll'),
      icon: collapseIcon(),
      separatorBefore: true,
      unavailable: stashes.length === 0 ? t('shelfEmpty') : undefined,
      onClick: () => setSelected(null),
    },
    {
      id: 'close',
      title: t('closePanel'),
      icon: closeIcon(),
      separatorBefore: true,
      onClick: () => services.closeBottomPanel(),
    },
  ]

  return (
    <div className="flex h-full min-h-0">
      {/* 左侧：与 Local Changes 同款的竖向工具栏 */}
      <GitSideToolbar label={t('tabShelf')} items={toolbar} />

      <div className="flex min-w-0 flex-1 flex-col">
        {root === '' && <div className="px-3 py-3 text-xs text-secondary">{t('noSession')}</div>}

        {error !== '' && <div className="px-2 py-1.5 text-xs text-danger">{error}</div>}

        {root !== '' && stashes.length === 0 && (
          <div className="px-3 py-3 text-xs text-secondary">{t('shelfEmpty')}</div>
        )}

        <div className="min-h-0 flex-1 overflow-auto py-0.5 [scrollbar-gutter:stable]">
          {stashes.map((item) => (
            <button
              key={item.selector}
              type="button"
              title={item.subject}
              onClick={() => setSelected(item.selector)}
              onDoubleClick={() => void run(`git stash apply ${item.selector}`, () => applyStash(root, item.selector))}
              onContextMenu={(event) => openMenu(event, item)}
              className={cn(
                'mx-1 flex h-[34px] w-[calc(100%-8px)] flex-col justify-center gap-0.5 rounded px-2 text-left transition-colors',
                item.selector === selected ? 'bg-surface2 text-primary' : 'text-primary hover:bg-surface2/70',
              )}
            >
              {/* 搁置标题：Git 生成的 reflog 主题 */}
              <span className="min-w-0 truncate text-xs">{item.subject}</span>

              {/* 定位串与相对时间，便于区分同一分支上的多条搁置 */}
              <span className="min-w-0 truncate text-[10px] text-secondary">
                {item.selector} · {item.date}
              </span>
            </button>
          ))}
        </div>
      </div>

      {menu !== null && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}

      {confirm !== null && (
        <div className="fixed inset-0 z-[9998] flex items-start justify-center bg-black/30 pt-24">
          <div
            className="relative flex flex-col rounded-md border border-line2 bg-overlay p-3 shadow-2xl"
            style={dropConfirmResize.size}
          >
            {/* 二次确认标题 */}
            <div className="mb-2 shrink-0 text-xs text-primary">{confirm.title}</div>
            {/* 确认正文：拖高时占满中段，文案超长时在内部滚动 */}
            <div className="mb-3 min-h-0 flex-1 overflow-auto text-xs text-secondary">{confirm.message}</div>

            <div className="flex shrink-0 justify-end gap-2">
              {/* 取消，不做任何改动 */}
              <button
                type="button"
                onClick={() => setConfirm(null)}
                className="rounded border border-line2 px-2 py-1 text-xs text-primary hover:bg-surface2"
              >
                {t('cancel')}
              </button>

              {/* 确认删除搁置记录 */}
              <button
                type="button"
                onClick={() => {
                  const action = confirm.run
                  setConfirm(null)
                  action()
                }}
                className="rounded border border-danger/60 px-2 py-1 text-xs text-danger hover:bg-danger/15"
              >
                {t('dropStash')}
              </button>
            </div>

            {dropConfirmResize.handle}
          </div>
        </div>
      )}
    </div>
  )
}
