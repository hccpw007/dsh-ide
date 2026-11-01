/**
 * 提交行右侧的引用标签。
 *
 * 按 IDEA 的 Log / History 列表样式渲染：每条引用是「彩色 tag 图标 + 灰色短名」，
 * 没有边框与底色。颜色由引用类型决定——本地分支绿色、远程分支紫色、标签黄色。
 *
 * 同一个分支在多个远程与本地同时存在时（`origin/main`、`origin2/main`、`main`），
 * IDEA 不逐个铺开，而是把图标叠成一簇、文本合并成 `origin & main`；这里按同样口径
 * 分组，图标之间只错开几个像素，形成截图里那种紧密重叠的观感。
 */
import React from 'react'

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

/** 多枚图标叠放时每错开一层的水平位移（px）；值小才会互相覆盖成图 2 的效果。 */
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
  /** 合并前的原始引用名，作为悬停提示。 */
  title: string
  /** 图标类型，顺序即叠放顺序。 */
  kinds: RefKind[]
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
 * 把同一提交上的引用合并成 IDEA 的展示形态。
 *
 * 分组键是分支短名：远程分支去掉 `<remote>/` 前缀，本地分支与标签用自身名字，
 * 因此 `origin3/main`、`origin2/main`、`main` 会合到 `main` 一组。合并后的文本是
 * 「第一个远程名 & 分支名」，与 IDEA 的 `origin & main` 一致；只有单个远程分支时
 * 保持完整短名 `origin/test`。标签与分支同名（如 `test`）同样合成一个名字。
 * @param refs 提交上的引用短名
 * @param index 引用类型索引
 * @returns 按原始顺序排列的展示项
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
      title: group.names.join(' & '),
      kinds: group.kinds,
    }
  })
}

/** 引用标签 props。 */
export interface RefBadgesProps {
  /** 提交上的引用短名。 */
  refs: string[]
  /** 引用类型索引，由 buildRefKindIndex 构建。 */
  index: Map<string, RefKind[]>
  /** 最多显示几组合并后的引用；多出来的被裁掉，避免挤掉标题列。 */
  max: number
}

/**
 * 渲染一组引用标签。
 * @param props 见 RefBadgesProps
 * @returns 图标簇与合并后的名称，没有引用时不渲染
 */
export function RefBadges({ refs, index, max }: RefBadgesProps): React.ReactElement | null {
  if (refs.length === 0) return null

  const displays = groupRefs(refs, index).slice(0, max)

  return (
    <span className="flex max-w-[260px] shrink-0 items-center gap-2 overflow-hidden">
      {displays.map((display) => (
        <span key={display.title} title={display.title} className="flex min-w-0 shrink-0 items-center gap-1">
          {/* 图标簇：同名分支与多重类型全部叠在一起，每层只露出左侧一小段轮廓 */}
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

          <span className="max-w-[120px] truncate text-[12px] text-secondary">{display.label}</span>
        </span>
      ))}
    </span>
  )
}
