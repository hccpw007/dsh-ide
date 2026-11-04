/**
 * 侧边栏底部的「IDE」入口按钮。
 *
 * 宿主在侧边栏底部预留了 `sidebar.footer.action` 插槽（「更多」右侧），但该插槽
 * 只传 `wide` 标志、不带任何会话上下文。IDE 又必须绑定一个会话的工作目录，所以
 * 按钮读的是会话页插槽记下的「当前会话」并订阅它的变化：任何时刻点开，打开的都是
 * 用户眼前这个会话的项目，绝不回退到别的会话。
 *
 * 会话或工作目录缺一就置灰：没有会话时无从判断项目，没有 cwd 时工作台没有根，
 * 两种情况都不该给一个「点开是空的」入口。点击后由 `shell.overlay` 那边的弹窗
 * 接管渲染，按钮只负责开关；弹窗打开时呈激活态，再点一次收起。
 *
 * 切走会话时收起弹窗：只关不清理，工作台实例与打开的文件、布局都留着，回到同一
 * 工作空间再点开仍是关闭前那一份。
 */
import React, { useEffect, useSyncExternalStore } from 'react'

import { cn } from '../../../common/cn'
import type { Translate } from '../../../types/plugin'
import {
  readCurrentSession,
  readSessionCwd,
  subscribeCurrentSession,
  subscribeSessions,
  workspaceIdOf,
} from '../session-cwd'

import { closeIdePopup, idePopupState, subscribeIdePopup, toggleIdePopup } from './popup-store'

/** 按钮 props。 */
export interface IdePopupButtonProps {
  /** 外壳翻译函数。 */
  t: Translate
}

/**
 * 入口图标：IDE 的分区骨架 —— 左侧项目树栏、带代码行的编辑区、底部工具窗口。
 * 只有方形外框时像普通窗口，加上侧栏与底栏才一眼看出「这是 IDE」，两行短横线点出编辑区。
 * @returns 图标节点
 */
function popupIcon(): React.ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {/* 窗口外框 */}
      <rect x="2.2" y="2.8" width="11.6" height="10.4" rx="1.4" />
      {/* 左侧项目树栏：竖线止于底部面板，不把底栏一起切开 */}
      <path d="M6.1 2.8v7.4" />
      {/* 底部工具窗口：横线贯穿整幅，与 IDE 的底部面板一致 */}
      <path d="M2.2 10.2h11.6" />
      {/* 编辑区的两行代码：第二行更短，才有文件内容的观感 */}
      <path d="M7.8 5.6h4.2" />
      <path d="M7.8 7.6h2.8" />
    </svg>
  )
}

/**
 * 渲染侧边栏底部的入口按钮。
 * @param props 见 IdePopupButtonProps
 * @returns 纯图标胶囊按钮；缺少会话或工作目录时置灰
 */
export function IdePopupButton({ t }: IdePopupButtonProps): React.ReactElement {
  const state = useSyncExternalStore(subscribeIdePopup, idePopupState, idePopupState)
  const sessionId = useSyncExternalStore(
    subscribeCurrentSession,
    readCurrentSession,
    readCurrentSession,
  )
  const cwd = useSyncExternalStore(
    subscribeSessions,
    () => readSessionCwd(sessionId),
    () => readSessionCwd(sessionId),
  )
  /** 当前会话的工作空间标识；空串表示还没绑定工作目录，此时入口不可用。 */
  const workspaceKey = workspaceIdOf(cwd)
  // 只认绑定在当前会话上的弹窗：切走再回来时，按钮不该继续显示上一个会话的激活态
  const open = state.open && state.sessionId === sessionId

  // 弹窗一旦不属于眼前的会话（切走对话、离开会话页、换了工作目录）就收起：
  // 入口只服务当前会话，主区不留与当前项目无关的工作台
  useEffect(() => {
    if (!state.open) return

    // 弹窗绑定的会话与眼前这个不是同一个：收起
    if (state.sessionId !== sessionId) {
      closeIdePopup()

      return
    }

    // 同一会话换了工作目录：原内容已不属于这个项目，收起
    if (state.workspaceKey !== '' && workspaceKey !== '' && workspaceKey !== state.workspaceKey) {
      closeIdePopup()
    }
  }, [sessionId, state.open, state.sessionId, state.workspaceKey, workspaceKey])

  return (
    /*
     * 宿主把 `sidebar.footer.action` 排成「更多」上方独立的一行，空着时高度为 0。
     * 这里让外层高度保持 0，按钮绝对定位到「更多」行右侧：入口与底部工具行同一行，
     * 不额外占掉一行高度；按钮自身覆盖在「更多」右侧的空白上，点击不会穿透到「更多」。
     */
    <div className="relative h-0 w-full">
      <button
        type="button"
        title={open ? t('shell.popupClose') : t('shell.popupOpen')}
        // 会话与工作目录缺一不可：硬性要求，不猜测、也不回退到别的会话
        disabled={sessionId === '' || workspaceKey === ''}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => toggleIdePopup(sessionId, workspaceKey)}
        className={cn(
          /*
           * 纯图标胶囊：24px 见方、6px 圆角，与「更多」那一行的高度相称。
           *
           * preflight 是关闭的，`<button>` 会带着浏览器默认的灰底与 2px 立体边框，
           * 必须显式清零，否则这一格会比同行的其它控件厚重一截。
           */
          'absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md',
          'border-0 bg-transparent p-0 text-tertiary transition-colors disabled:opacity-40',
          'enabled:hover:bg-hoverbg enabled:hover:text-secondary',
          // 弹窗打开时用比悬停深一档的底色提示「已打开」
          'aria-expanded:bg-activebg aria-expanded:text-secondary',
        )}
      >
        {popupIcon()}
      </button>
    </div>
  )
}
