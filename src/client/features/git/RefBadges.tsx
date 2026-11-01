/**
 * 提交行右侧的引用标签。
 *
 * 按 IDEA 的 Log / History 列表样式渲染：每条引用是「彩色 tag 图标 + 灰色短名」，
 * 没有边框与底色。颜色由引用类型决定——本地分支绿色、远程分支紫色、标签黄色；
 * 同一个名字既是分支又是标签时，两枚图标错开叠放，IDEA 也用这种方式表达多重类型。
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

/** 多枚图标叠放时每错开一层的水平位移（px）。 */
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

/** 引用标签 props。 */
export interface RefBadgesProps {
  /** 提交上的引用短名。 */
  refs: string[]
  /** 引用类型索引，由 buildRefKindIndex 构建。 */
  index: Map<string, RefKind[]>
  /** 最多显示几条引用；多出来的被裁掉，避免挤掉标题列。 */
  max: number
}

/**
 * 渲染一组引用标签。
 * @param props 见 RefBadgesProps
 * @returns 图标与名称，没有引用时不渲染
 */
export function RefBadges({ refs, index, max }: RefBadgesProps): React.ReactElement | null {
  if (refs.length === 0) return null

  return (
    <span className="flex max-w-[240px] shrink-0 items-center gap-2 overflow-hidden">
      {refs.slice(0, max).map((name) => {
        const kinds = kindsOf(name, index)

        return (
          <span key={name} title={name} className="flex min-w-0 shrink-0 items-center gap-1">
            {/* 图标叠放：每多一种类型向右叠一层，容器宽度随之加宽 */}
            <span className="relative h-[14px] shrink-0" style={{ width: 14 + (kinds.length - 1) * STACK_STEP }}>
              {kinds.map((kind, order) => (
                <span
                  key={kind}
                  className={cn('absolute top-0', KIND_COLOR[kind])}
                  style={{ left: order * STACK_STEP, zIndex: order + 1 }}
                >
                  {refTagIcon()}
                </span>
              ))}
            </span>

            <span className="max-w-[120px] truncate text-[12px] text-secondary">{name}</span>
          </span>
        )
      })}
    </span>
  )
}
