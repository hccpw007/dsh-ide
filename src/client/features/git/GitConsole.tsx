/**
 * Git 面板的「控制台」页签。
 *
 * 展示本面板执行过的 Git 命令及其输出：暂存、提交、签出、合并等都会在这里留下
 * 一条记录，方便排查「点了但没生效」这类问题。只读，不接收命令输入。
 */
import React, { useSyncExternalStore } from 'react'

import type { Translate } from '../../../types/plugin'

import { clearGitConsole, gitConsoleEntries, subscribeGitConsole } from './console-store'

/** 控制台 props。 */
export interface GitConsoleProps {
  /** 已绑定 git 前缀的翻译函数。 */
  t: Translate
}

/**
 * 渲染命令记录。
 * @param props 见 GitConsoleProps
 * @returns 命令列表与清空按钮
 */
export function GitConsole({ t }: GitConsoleProps): React.ReactElement {
  const entries = useSyncExternalStore(subscribeGitConsole, gitConsoleEntries, gitConsoleEntries)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-line1 px-2 text-xs text-secondary">
        {/* 控制台标题与记录数 */}
        <span>
          {t('consoleTitle')} ({entries.length})
        </span>

        {/* 清空记录 */}
        <button
          type="button"
          onClick={clearGitConsole}
          disabled={entries.length === 0}
          className="rounded px-1.5 py-0.5 text-info hover:bg-layer2 disabled:opacity-40"
        >
          {t('consoleClear')}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-2 font-mono text-[11px] leading-5">
        {entries.length === 0 && <div className="text-secondary">{t('consoleEmpty')}</div>}

        {entries.map((entry) => (
          <div key={entry.id} className="mb-1.5">
            {/* 命令行与执行时刻 */}
            <div className={entry.ok ? 'text-info' : 'text-danger'}>
              <span className="select-none">$ </span>
              {entry.command}
              <span className="ml-2 text-secondary">{entry.time}</span>
            </div>

            {/* 命令输出；无输出时不占行 */}
            {entry.output !== '' && <pre className="whitespace-pre-wrap text-secondary">{entry.output}</pre>}
          </div>
        ))}
      </div>
    </div>
  )
}
