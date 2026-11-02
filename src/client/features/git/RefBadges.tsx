/**
 * 提交行右侧的引用标签。
 *
 * 分组规则见 `ref-badges-model`；渲染时把所有引用聚合成一个图标簇 + 一个名字
 * （IDEA 的紧凑引用视图）：名字取分组结果的第一组（`origin & main`），图标按引用
 * 类型着色——HEAD 黄、本地分支绿、远程分支紫、标签灰，同色最多两枚。
 */
import React, { useMemo, useRef, useState } from 'react'

import { cn } from '../../../common/cn'

import { refTagIcon } from './icons-vcs'
import { buildRefGroups, groupIconColors, REF_KIND_ORDER, refKindOf, type RefIndex, type RefKind } from './ref-badges-model'

/** 图标颜色：只让图标着色，名称保持次级文字色，避免整行花花绿绿看不出重点。 */
const KIND_COLOR: Record<RefKind, string> = {
  head: 'text-ref-head',
  local: 'text-ref-local',
  remote: 'text-ref-remote',
  tag: 'text-ref-tag',
}

/** 图标尺寸（px），与 refTagIcon 的默认尺寸一致。 */
const ICON_SIZE = 14

/** 多枚图标叠放时每错开一层的水平位移（px）；按 IDEA 约 44% 图标宽的错位量取整。 */
const STACK_STEP = 6

/** 图标与组名之间的间距（px），与行内 `gap-1` 一致。 */
const ICON_TEXT_GAP = 4

/** 标题最小保留宽度（px）：IDEA 的引用区最多占「标题区宽 - 80」。 */
const TITLE_MIN_WIDTH = 80

/** 需要省略的引用名长度阈值（字符）；与 IDEA 的 shortenRefName 一致。 */
const MAX_LABEL_LENGTH = 22

/*
 * 图标簇的填充色变量：后画的图标用与行背景同色的填充遮住下层图标的线条。
 *
 * 行在悬停与选中时背景会变，这里给出叠加后的不透明等效色——直接沿用半透明的行
 * 背景会让下层线条透出来，失去遮挡效果。
 */

/** 默认行的图标填充色：工具窗口底的 surface1。 */
export const REF_FILL_IDLE =
  '[--ide-ref-fill:color-mix(in_srgb,var(--dsw-alias-label-primary)_5%,var(--dsw-alias-bg-base))]'

/** 悬停行的图标填充色：surface2/60 叠在工具窗口底上，等效于 8% 前景混入。 */
export const REF_FILL_HOVER =
  'hover:[--ide-ref-fill:color-mix(in_srgb,var(--dsw-alias-label-primary)_8%,var(--dsw-alias-bg-base))]'

/** 提交列表选中行的图标填充色：info/25 叠在工具窗口底上。 */
export const REF_FILL_SELECTED =
  '[--ide-ref-fill:color-mix(in_srgb,var(--dsw-alias-state-business-primary)_25%,color-mix(in_srgb,var(--dsw-alias-label-primary)_5%,var(--dsw-alias-bg-base)))]'

/** 测量文本宽度的离屏画布；只在首次测量时创建。 */
let measureCanvas: CanvasRenderingContext2D | null = null

/** 测量用的字体族；取宿主正文字体，字号由调用方按被测文本的实际字号传入。 */
let measureFamily = ''

/** 文本宽度缓存：分支名与作者名在整张列表里大量重复，避免逐行重复测量。 */
const widthCache = new Map<string, number>()

/**
 * 取测量用的字体串。
 * @param fontSize 字号（px），必须与界面上被测文本的实际字号一致，否则量出的宽度会偏
 * @returns canvas 的 font 值
 */
function resolveFont(fontSize: number): string {
  if (measureFamily === '') {
    measureFamily = typeof document === 'undefined' ? 'sans-serif' : getComputedStyle(document.body).fontFamily
  }

  return `${String(fontSize)}px ${measureFamily === '' ? 'sans-serif' : measureFamily}`
}

/**
 * 取测量用的画布。
 * @returns 2D 上下文；环境不支持时为 null
 */
function canvasContext(): CanvasRenderingContext2D | null {
  if (measureCanvas === null && typeof document !== 'undefined') {
    measureCanvas = document.createElement('canvas').getContext('2d')
  }

  return measureCanvas
}

/**
 * 测量文本在界面上的宽度。
 *
 * 除引用标签外，提交列表的作者列也用它按内容宽度排布（见 CommitList），
 * 因此按字号分别缓存：同一文本在不同字号下的宽度不同。
 * @param text 文本
 * @param fontSize 字号（px）；默认 12，与引用标签的 `text-[12px]` 一致
 * @returns 宽度（px）
 */
export function textWidth(text: string, fontSize = 12): number {
  if (text === '') return 0

  const key = `${String(fontSize)}\u0000${text}`
  const cached = widthCache.get(key)
  if (cached !== undefined) return cached

  let width = text.length * 7
  const context = canvasContext()

  // 画布不可用时按每字符 7px 估算：宁可多留位置，也不要让标签互相压住
  if (context !== null) {
    context.font = resolveFont(fontSize)
    width = context.measureText(text).width
  }

  widthCache.set(key, width)

  return width
}

/**
 * 计算图标簇宽度。
 * @param colors 图标颜色序列
 * @returns 宽度（px）：第一枚占满图标宽，之后每层只露出错位量
 */
function clusterWidth(colors: RefKind[]): number {
  return ICON_SIZE + Math.max(0, colors.length - 1) * STACK_STEP
}

/**
 * 计算引用标签区可用的最大宽度。
 *
 * 与 IDEA 的 `getAvailableWidth` 同口径：标题较短时让出剩余空间，标题较长时也至少
 * 给标签区一半宽度（或标题区宽减去最小标题宽度）。
 * @param subject 提交标题
 * @param availableWidth 标题与引用标签共享的宽度；0 表示还没量到
 * @returns 标签区最大宽度；0 表示不限制
 */
function referenceMaxWidth(subject: string, availableWidth: number): number {
  if (availableWidth <= 0) return 0

  const free = availableWidth - textWidth(subject)

  return Math.max(0, Math.max(free, Math.max(availableWidth / 2, availableWidth - TITLE_MIN_WIDTH)))
}

/**
 * 把组名缩短到指定宽度。
 *
 * 与 IDEA 的 `shortenRefName` 一致：只有超过 22 个字符的长名字才省略，先去掉远程
 * 前缀（`origin/feature/x` → `..feature/x`），仍放不下再逐字符截断并补省略号。
 * @param label 组名
 * @param maxWidth 可用宽度
 * @returns 缩短后的文本
 */
function shortenLabel(label: string, maxWidth: number): string {
  if (label === '') return ''
  if (textWidth(label) <= maxWidth || label.length <= MAX_LABEL_LENGTH) return label

  const slashed = label.indexOf('/')
  const short = slashed > 2 ? `..${label.slice(slashed)}` : label

  if (textWidth(short) <= maxWidth) return short

  let end = short.length

  while (end > 0 && textWidth(`${short.slice(0, end)}…`) > maxWidth) end -= 1

  return end > 0 ? `${short.slice(0, end)}…` : short
}

/** 引用标签 props。 */
export interface RefBadgesProps {
  /** 提交上的引用短名；`HEAD` 表示该提交是当前检出点。 */
  refs: string[]
  /** 引用索引，由 buildRefKindIndex 构建。 */
  index: RefIndex
  /** 提交标题，用来估算标题占用的宽度。 */
  subject: string
  /** 标题与引用标签共享的可用宽度（px）；0 表示还没量到，先全部显示。 */
  availableWidth: number
}

/** 悬停提示里的一组引用：同类型合并成一行显示。 */
interface TipGroup {
  /** 引用类型，决定图标颜色。 */
  kind: RefKind
  /** 组内的引用名。 */
  names: string[]
}

/** 悬停提示与芯片之间的间距（px）。 */
const TIP_GAP = 6

/** 悬停提示的最大宽度（px）；长引用名在其中折行。 */
const TIP_WIDTH = 280

/**
 * 按类型汇总引用，供悬停提示逐行展示。
 * @param refs 引用短名
 * @param index 引用索引
 * @returns 每种类型的名字列表，顺序为 HEAD、本地分支、远程分支、标签
 */
function tipGroups(refs: string[], index: RefIndex): TipGroup[] {
  const groups = new Map<RefKind, string[]>()

  for (const name of refs) {
    const kind = refKindOf(name, index)
    const names = groups.get(kind) ?? []

    if (!names.includes(name)) names.push(name)
    groups.set(kind, names)
  }

  return REF_KIND_ORDER.filter((kind) => groups.has(kind)).map((kind) => ({ kind, names: groups.get(kind) ?? [] }))
}

/** 悬停提示的定位。 */
interface TipPlacement {
  /** 左边缘（视口坐标）。 */
  left: number
  /** 上边缘；贴在芯片下沿时使用，向上翻转时为 null。 */
  top: number | null
  /** 下边缘；上方空间不足时改从芯片上沿向上定位，此时 top 必须为 null。 */
  bottom: number | null
}

/**
 * 计算提示框的定位。
 *
 * 默认贴在芯片下方；下方放不下时翻到上方，并夹在视口左右边界内，列表最底部
 * 的提交悬停时也能完整显示。上下边缘只能给出一个：同时设置 top 与 bottom 会把
 * 提示框拉伸到两者之间，高度就由内容变成整屏。
 * @param rect 芯片的位置与尺寸
 * @returns 提示框的 fixed 定位
 */
function tipPlacement(rect: DOMRect): TipPlacement {
  const left = Math.max(4, Math.min(rect.left, window.innerWidth - TIP_WIDTH - 8))

  if (window.innerHeight - rect.bottom < 120) {
    return { left, top: null, bottom: window.innerHeight - rect.top + TIP_GAP }
  }

  return { left, top: rect.bottom + TIP_GAP, bottom: null }
}

/**
 * 渲染一条引用标签。
 * @param props 见 RefBadgesProps
 * @returns 聚合后的图标簇与分支名；悬停时另附全部引用
 */
export function RefBadges({ refs, index, subject, availableWidth }: RefBadgesProps): React.ReactElement | null {
  const badgeRef = useRef<HTMLSpanElement | null>(null)
  const [tip, setTip] = useState<(TipPlacement & { groups: TipGroup[] }) | null>(null)

  /**
   * 标签内容：所有引用聚合成一个图标簇与一个名字。
   *
   * 名字取分组结果的第一组（`origin & main`），图标颜色按全部引用的类型合并，
   * 同一颜色最多两枚；宽度没量到时先完整显示名字，量到后按标签区宽度截断。
   */
  const badge = useMemo(() => {
    const groups = buildRefGroups(refs, index)
    const colors = groupIconColors(groups.flatMap((group) => group.kinds))
    const label = groups.length > 0 ? groups[0].label : ''

    if (availableWidth <= 0) return { colors, text: label, textMaxWidth: undefined }

    const textMaxWidth = Math.max(0, referenceMaxWidth(subject, availableWidth) - clusterWidth(colors) - ICON_TEXT_GAP)

    return { colors, text: shortenLabel(label, textMaxWidth), textMaxWidth }
  }, [availableWidth, index, refs, subject])

  if (badge.colors.length === 0) return null

  return (
    <span
      ref={badgeRef}
      className="flex min-w-0 shrink-0 items-center gap-1"
      onMouseEnter={() => {
        const element = badgeRef.current
        if (element === null) return

        setTip({ ...tipPlacement(element.getBoundingClientRect()), groups: tipGroups(refs, index) })
      }}
      onMouseLeave={() => setTip(null)}
    >
      {/* 图标簇：同色最多两枚；最先出现的引用画在最右侧、压在最上层，与 IDEA 一致 */}
      <span className="relative h-[14px] shrink-0" style={{ width: clusterWidth(badge.colors) }}>
        {badge.colors.map((kind, layer) => (
          <span
            key={`${kind}-${String(layer)}`}
            className={cn('absolute top-0', KIND_COLOR[kind])}
            style={{ left: (badge.colors.length - 1 - layer) * STACK_STEP, zIndex: badge.colors.length - layer }}
          >
            {refTagIcon()}
          </span>
        ))}
      </span>

      {badge.text !== '' && (
        <span className="truncate text-[12px] text-secondary" style={{ maxWidth: badge.textMaxWidth }}>
          {badge.text}
        </span>
      )}

      {/* 悬停提示：按类型逐行列出全部引用，与 IDEA 的 refs 提示框一致 */}
      {tip !== null && (
        <div
          role="tooltip"
          className="fixed z-[80] rounded-[4px] border border-line1 bg-surface2 px-2 py-1.5 shadow-lg"
          style={{ left: tip.left, top: tip.top ?? undefined, bottom: tip.bottom ?? undefined, maxWidth: TIP_WIDTH }}
        >
          {tip.groups.map((group) => (
            <div key={group.kind} className="flex items-start gap-1.5">
              <span className={cn('mt-[1px] shrink-0', KIND_COLOR[group.kind])}>{refTagIcon(12, false)}</span>
              <span className="min-w-0 whitespace-pre-wrap break-words text-[12px] leading-[1.35] text-primary">
                {group.names.join(', ')}
              </span>
            </div>
          ))}
        </div>
      )}
    </span>
  )
}
