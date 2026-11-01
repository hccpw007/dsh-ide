/**
 * 三栏合并浮动窗口。
 *
 * 复刻 IDEA 的 Merge Revisions：三栏对照是一个独立窗口，浮在工作台上而不是占用
 * 编辑器标签——冲突解决时仍要能看项目树、翻别的文件，所以窗口不遮罩、可拖动、可缩放。
 * 位置与尺寸按窗口标识记忆，下次打开落回原处。
 */
import React from 'react'

import { useDialogFrame } from '../../../common/dialog-frame'
import type { Translate } from '../../../types/plugin'
import type { IdeServices } from '../../shell/contract'

import { closeIcon } from '../git/icons-ui'
import { fileIcon } from '../project-tree/file-icons'

import { MergeViewer } from './MergeViewer'

/** 默认大小：占工作台的 92%×86%，最多 1500×960，与 IDEA 的合并窗口一样尽量铺开。 */
const INITIAL_SIZE = { widthRatio: 0.92, heightRatio: 0.86, maxWidth: 1500, maxHeight: 960 }

/** 缩放下限：再小三栏就放不下内容与接受箭头。 */
const MIN_SIZE = { width: 760, height: 420 }

/** 窗口标识：合并窗口的尺寸与位置单独记忆。 */
const SIZE_KEY = 'merge-revisions'

/** 浮动窗口 props。 */
export interface MergeWindowProps {
  /** 已绑定 conflicts 前缀的翻译函数。 */
  t: Translate
  /** 工作台服务总线。 */
  services: IdeServices
  /** 冲突文件相对工作区根的路径。 */
  path: string
  /** 关闭窗口；未应用于文件的选择随之丢弃。 */
  onClose(): void
  /** 工作台根元素：拖动与缩放的边界参照。 */
  bounds: React.RefObject<HTMLDivElement | null>
}

/**
 * 渲染三栏合并浮动窗口。
 * @param props 见 MergeWindowProps
 * @returns 标题栏 + 三栏正文
 */
export function MergeWindow({ t, services, path, onClose, bounds }: MergeWindowProps): React.ReactElement {
  const { style, rootRef, dragProps, handle } = useDialogFrame(services.dialogSizes, {
    key: SIZE_KEY,
    initial: INITIAL_SIZE,
    min: MIN_SIZE,
    bounds,
  })

  const fileName = path.slice(path.lastIndexOf('/') + 1)

  return (
    // 外层的 pointer-events-none 让窗口之外的区域仍可点击：合并不是模态操作
    <div className="pointer-events-none absolute inset-0 z-[9990] flex items-center justify-center p-3">
      <div
        role="dialog"
        aria-modal="false"
        aria-label={`${t('mergeRevisions')} ${fileName}`}
        className="pointer-events-auto relative flex flex-col overflow-hidden rounded-[8px] border border-[color:var(--ide-dialog-border)] bg-[var(--ide-dialog-bg)] shadow-2xl"
        style={style}
        ref={rootRef}
      >
        {/* 标题栏：按住可拖动窗口 */}
        <div
          className="flex h-9 shrink-0 cursor-move select-none items-center gap-1.5 border-b border-line1 px-3"
          {...dragProps}
        >
          {/* 文件图标：与项目树、标签页同一套 */}
          {fileIcon(path)}

          {/* 窗口标题：合并版本 + 文件名 */}
          <span className="shrink-0 text-[13px] font-semibold text-primary">{t('mergeRevisions')}</span>

          <span className="min-w-0 truncate text-[12px] text-secondary">{fileName}</span>

          <span className="flex-1" />

          {/* 关闭窗口，保留工作区里的冲突标记 */}
          <button
            type="button"
            title={t('close')}
            aria-label={t('close')}
            onClick={onClose}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-secondary hover:bg-surface2 hover:text-primary"
          >
            {closeIcon(14)}
          </button>
        </div>

        <MergeViewer t={t} services={services} path={path} onClose={onClose} />

        {/* 右下角缩放手柄 */}
        {handle}
      </div>
    </div>
  )
}
