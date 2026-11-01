/**
 * 提交行右侧的引用标签。
 *
 * 按 IDEA 的 Log / History 列表样式渲染：彩色 tag 图标簇 + 灰色分支名，没有边框与
 * 底色。颜色由引用类型决定——本地分支绿色、远程分支紫色、标签黄色。
 *
 * 一行提交只显示一个标签：IDEA 把同一分支在多个远程与本地的引用合到一组
 * （`origin/main`、`origin2/main`、`main` → `origin & main`），其余不同名的分支与
 * 标签只在悬停提示里列出，避免标签铺满整行。
 */
import React, { useRef, useState } from 'react'

import { cn } from '../../../common/cn'

import type { GitRefs } from './api'
import { refTagIcon } from './icons-vcs'

/** 引用类型：本地分支、远程分支、标签。 */
export type RefKind = 'local' | 'remote' | 'tag'

/** 图标颜色：只让图标着色，名称保持次级文字色，避免整行花花绿绿看不出重点。 */
const KIND_COLOR: Record<RefKind, string> = {
  local: 'text-ref-local',
  remote: 'text-ref-remote',
  tag: 'text-ref-tag',
}

/** 叠放顺序：本地分支在里层、标签在外层，与 IDEA 的图标层次一致。 */
const KIND_ORDER: RefKind[] = ['local', 'remote', 'tag']

/** 多枚图标叠放时每错开一层的水平位移（px）；值小才会互相覆盖成 IDEA 的紧凑叠放。 */
const STACK_STEP = 3

/**
 * 构建「引用名 → 类型」索引。
 *
 * 提交日志里的 `%D` 只给裸名，分不清本地分支、远程分支与标签；用分支树已经读到的
 * 引用集合反查才能精确着色。同名引用可能既是分支又是标签，因此值是类型数组。
 * @param known 已知的本地分支、远程分支与标签；未读取到时为 null
 * @returns 引用名到类型集合的索引
 */
export function buildRefKindIndex(known: GitRefs | null): Map<string, RefKind[]> {
  const index = new Map<string, RefKind[]>()

  if (known === null) return index

  /**
   * 登记一个引用名及其类型。
   * @param name 引用短名
   * @param kind 引用类型
   */
  const add = (name: string, kind: RefKind): void => {
    const kinds = index.get(name) ?? []

    if (!kinds.includes(kind)) kinds.push(kind)
    index.set(name, kinds)
  }

  for (const branch of known.local) add(branch.name, 'local')
  for (const branch of known.remote) add(branch.name, 'remote')
  for (const tag of known.tags) add(tag.name, 'tag')

  return index
}

/**
 * 取单个引用的类型集合。
 * @param name 引用短名
 * @param index 引用类型索引
 * @returns 按叠放顺序排好的类型
 */
function kindsOf(name: string, index: Map<string, RefKind[]>): RefKind[] {
  const kinds = index.get(name)

  if (kinds !== undefined) {
    return [...kinds].sort((left, right) => KIND_ORDER.indexOf(left) - KIND_ORDER.indexOf(right))
  }

  // 引用集合还没读到、或分支已在别处删除（旧提交上仍显示引用）时只能按名字推断：
  // 远程分支一律带 `<remote>/` 前缀，本地分支名通常不带斜杠
  return [name.includes('/') ? 'remote' : 'local']
}

/** 一条待展示的引用：同名分支合并后的文本与图标。 */
interface RefDisplay {
  /** 合并后的显示文本，如 `origin & main`。 */
  label: string
  /** 图标类型，顺序即叠放顺序。 */
  kinds: RefKind[]
  /** 组内是否有远程分支。 */
  hasRemote: boolean
  /** 组内是否有本地分支或标签。 */
  hasOther: boolean
  /** 组内是否只有标签。 */
  tagOnly: boolean
}

/** 分组过程中累积的单个引用组。 */
interface RefGroup {
  /** 组内的原始引用名。 */
  names: string[]
  /** 每个成员的图标类型，按出现顺序累积。 */
  kinds: RefKind[]
  /** 组内出现过的远程名；空数组表示全组都是本地分支或标签。 */
  remotes: string[]
  /** 组内是否含本地分支或标签。 */
  hasOther: boolean
}

/**
 * 把同一提交上的引用按分支短名分组。
 *
 * 分组键是分支短名：远程分支去掉 `<remote>/` 前缀，本地分支与标签用自身名字，
 * 因此 `origin3/main`、`origin2/main`、`main` 会合到 `main` 一组。合并后的文本是
 * 「第一个远程名 & 分支名」，与 IDEA 的 `origin & main` 一致；只有单个远程分支时
 * 保持完整短名 `origin/test`。
 * @param refs 提交上的引用短名
 * @param index 引用类型索引
 * @returns 按原始顺序排列的分组
 */
function groupRefs(refs: string[], index: Map<string, RefKind[]>): RefDisplay[] {
  const groups = new Map<string, RefGroup>()

  for (const name of refs) {
    const kinds = kindsOf(name, index)
    const slash = name.indexOf('/')
    const remote = kinds.includes('remote') && slash >= 0
    const key = remote ? name.slice(slash + 1) : name
    const group = groups.get(key) ?? { names: [], kinds: [], remotes: [], hasOther: false }

    group.names.push(name)
    group.kinds.push(...kinds)
    // 多个远程指向同一分支时按名称取字典序最小者作为展示用的远程名（IDEA 显示 origin 而不是 origin3）
    if (remote && !group.remotes.includes(name.slice(0, slash))) group.remotes.push(name.slice(0, slash))
    if (kinds.some((kind) => kind !== 'remote')) group.hasOther = true
    groups.set(key, group)
  }

  return [...groups].map(([key, group]) => {
    const remoteName = [...group.remotes].sort()[0] ?? ''
    const singleRemote = group.names.length === 1 && remoteName !== '' && !group.hasOther

    return {
      label: singleRemote ? group.names[0] : [remoteName, key].filter((part) => part !== '').join(' & '),
      kinds: group.kinds,
      hasRemote: remoteName !== '',
      hasOther: group.hasOther,
      tagOnly: group.kinds.every((kind) => kind === 'tag'),
    }
  })
}

/**
 * 从一行提交的分组里挑出唯一要显示的一组。
 *
 * 优先显示「远程与本地同名」的合并组（`origin & main`），其次是远程分支组，再次是
 * 本地分支；只有标签时才显示标签。这样一行始终只有一个标签，与 IDEA 的 Log 一致。
 * @param displays 分组结果
 * @returns 选中的组；没有引用时为 null
 */
function pickDisplay(displays: RefDisplay[]): RefDisplay | null {
  return (
    displays.find((item) => item.hasRemote && item.hasOther) ??
    displays.find((item) => item.hasRemote) ??
    displays.find((item) => !item.tagOnly) ??
    displays[0] ??
    null
  )
}

/** 引用标签 props。 */
export interface RefBadgesProps {
  /** 提交上的引用短名。 */
  refs: string[]
  /** 引用类型索引，由 buildRefKindIndex 构建。 */
  index: Map<string, RefKind[]>
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
 * @param index 引用类型索引
 * @returns 每种类型的名字列表，顺序为本地分支、远程分支、标签
 */
function tipGroups(refs: string[], index: Map<string, RefKind[]>): TipGroup[] {
  const groups = new Map<RefKind, string[]>()

  for (const name of refs) {
    for (const kind of kindsOf(name, index)) {
      const names = groups.get(kind) ?? []

      if (!names.includes(name)) names.push(name)
      groups.set(kind, names)
    }
  }

  return KIND_ORDER.filter((kind) => groups.has(kind)).map((kind) => ({ kind, names: groups.get(kind) ?? [] }))
}

/** 悬停提示的定位。 */
interface TipPlacement {
  /** 左边缘（视口坐标）。 */
  left: number
  /** 上边缘；贴在芯片下沿时使用。 */
  top: number
  /** 下边缘；上方空间不足时改从芯片上沿向上定位。 */
  bottom: number | null
}

/**
 * 计算提示框的定位。
 *
 * 默认贴在芯片下方；下方放不下时翻到上方，并夹在视口左右边界内，列表最底部
 * 的提交悬停时也能完整显示。
 * @param rect 芯片的位置与尺寸
 * @returns 提示框的 fixed 定位
 */
function tipPlacement(rect: DOMRect): TipPlacement {
  const left = Math.max(4, Math.min(rect.left, window.innerWidth - TIP_WIDTH - 8))

  if (window.innerHeight - rect.bottom < 120) {
    return { left, top: 0, bottom: window.innerHeight - rect.top + TIP_GAP }
  }

  return { left, top: rect.bottom + TIP_GAP, bottom: null }
}

/**
 * 渲染一条引用标签。
 * @param props 见 RefBadgesProps
 * @returns 图标簇与合并后的名称；鼠标悬停时另附全部引用的提示框
 */
export function RefBadges({ refs, index }: RefBadgesProps): React.ReactElement | null {
  const badgeRef = useRef<HTMLSpanElement | null>(null)
  const [tip, setTip] = useState<(TipPlacement & { groups: TipGroup[] }) | null>(null)

  if (refs.length === 0) return null

  const display = pickDisplay(groupRefs(refs, index))
  if (display === null) return null

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
      {/* 图标簇：同名分支的多个图标层层叠放，每层只露出左侧一小段轮廓 */}
      <span className="relative h-[14px] shrink-0" style={{ width: 14 + (display.kinds.length - 1) * STACK_STEP }}>
        {display.kinds.map((kind, order) => (
          <span
            key={`${kind}-${String(order)}`}
            className={cn('absolute top-0', KIND_COLOR[kind])}
            style={{ left: order * STACK_STEP, zIndex: order + 1 }}
          >
            {refTagIcon()}
          </span>
        ))}
      </span>

      <span className="max-w-[140px] truncate text-[12px] text-secondary">{display.label}</span>

      {/* 悬停提示：按类型逐行列出全部引用，与 IDEA 的 refs 提示框一致 */}
      {tip !== null && (
        <div
          role="tooltip"
          className="fixed z-[80] rounded-[4px] border border-line1 bg-surface2 px-2 py-1.5 shadow-lg"
          style={{ left: tip.left, top: tip.top, bottom: tip.bottom ?? undefined, maxWidth: TIP_WIDTH }}
        >
          {tip.groups.map((group) => (
            <div key={group.kind} className="flex items-start gap-1.5">
              <span className={cn('mt-[1px] shrink-0', KIND_COLOR[group.kind])}>{refTagIcon(12)}</span>
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
