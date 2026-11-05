/**
 * 面板级错误边界。
 *
 * React 在渲染期抛错时会卸载最近错误边界之上的整棵子树；插件此前没有任何边界，
 * 于是项目树某一行 `fileIcon()` 拿到异常路径、提交图的行数与 rows 对不上，
 * 都会让整块 IDE（含标签条、编辑器、状态栏）一起消失，且没有任何恢复入口。
 *
 * 这里给每个渲染点各包一层：单点崩溃降级为「该面板已崩溃，点击重试」，其余区域
 * 继续可用。class 组件是 React 目前唯一支持 `getDerivedStateFromError` 的形式，
 * 属于框架能力约束，不算违反「组件用函数式」的约定。
 *
 * 注意边界只能捕获**渲染期**异常：事件回调、定时器与 Promise 里的异常仍需各自
 * try/catch（那些地方本来就有日志与用户提示）。
 */
import React from 'react'

import type { Translate } from '../../types/plugin'

/** 错误边界 props。 */
export interface PanelErrorBoundaryProps {
  /** 面板标识，只用于日志与降级提示，便于定位是哪一块崩了。 */
  name: string
  /** 翻译函数；外壳与 feature 各自传入自己的 `t`。 */
  t: Translate
  /** 降级 UI 的附加类名，用于适配容器高度。 */
  className?: string
  children: React.ReactNode
}

/** 错误边界状态。 */
interface PanelErrorBoundaryState {
  /** 捕获到的异常；null 表示当前正常。 */
  error: Error | null
  /** 重试次数：作为子树 key，重试时强制重新挂载而不是复用出错的状态。 */
  attempt: number
}

/**
 * 隔离单个面板的渲染异常。
 */
export class PanelErrorBoundary extends React.Component<PanelErrorBoundaryProps, PanelErrorBoundaryState> {
  /** 初始状态：无异常、未重试。 */
  state: PanelErrorBoundaryState = { error: null, attempt: 0 }

  /**
   * 渲染期抛错时切换到降级 UI。
   * @param error 捕获到的异常
   * @returns 新的状态
   */
  static getDerivedStateFromError(error: Error): Partial<PanelErrorBoundaryState> {
    return { error }
  }

  /**
   * 记录异常现场；组件栈对定位「哪个 feature 崩了」最有价值。
   * @param error 捕获到的异常
   * @param info React 提供的组件栈
   */
  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error(`[dsh-ide] 面板渲染异常，已隔离: ${this.props.name}`, error, info.componentStack)
  }

  /**
   * 重试：清掉错误并换 key 重新挂载子树。
   */
  private readonly retry = (): void => {
    this.setState((previous) => ({ error: null, attempt: previous.attempt + 1 }))
  }

  /**
   * 渲染子节点；出错时渲染降级提示。
   * @returns 子树或降级 UI
   */
  render(): React.ReactNode {
    const { error, attempt } = this.state
    const { t, className } = this.props

    if (error === null) return <React.Fragment key={attempt}>{this.props.children}</React.Fragment>

    return (
      <div
        className={className ?? 'flex h-full min-h-0 flex-col items-center justify-center gap-2 p-4 text-xs'}
        // 降级提示承担「面板级错误」的角色，保留原始消息便于自助排查
        title={error.message}
      >
        <div className="text-danger">{t('shell.panelCrashed')}</div>
        <div className="max-w-md text-center text-secondary">{t('shell.panelCrashedHint')}</div>
        <div className="max-w-md truncate text-secondary opacity-70">{error.message}</div>
        <button
          type="button"
          onClick={this.retry}
          className="rounded border border-line2 px-2 py-1 text-primary hover:bg-surface2"
        >
          {t('shell.retryPanel')}
        </button>
      </div>
    )
  }
}
