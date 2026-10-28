/**
 * 编辑器区。
 *
 * P0 阶段只渲染空态：文件标签页、分栏与编辑器主体在 P1/P2 交付。
 * 这里保留容器与空态，是为了让布局骨架先跑通，后续把内容换进容器即可。
 */
import React from 'react'

import type { Translate } from '../../types/plugin'

/** 编辑器区 props。 */
export interface EditorAreaProps {
  /** 外壳翻译函数。 */
  t: Translate
}

/**
 * 渲染编辑器区。
 * @param props 见 EditorAreaProps
 * @returns 占满中区的容器
 */
export function EditorArea({ t }: EditorAreaProps): React.ReactElement {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-base">
      {/* 标签页条占位：P1 接入文件标签后在此渲染 */}
      <div className="flex h-9 shrink-0 items-center border-b border-line1 px-3 text-xs text-secondary">
        {/* 尚未打开任何文件的提示 */}
        {t('shell.editorTitle')}
      </div>

      <div className="flex flex-1 items-center justify-center p-6">
        <div className="max-w-sm text-center">
          {/* 空态主文案 */}
          <div className="text-sm text-primary">{t('shell.emptyEditor')}</div>
          {/* 空态说明，提示后续功能会出现在这里 */}
          <div className="mt-1 text-xs text-secondary">{t('shell.emptyEditorHint')}</div>
        </div>
      </div>
    </div>
  )
}
