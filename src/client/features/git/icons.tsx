/**
 * Git 面板的图标。
 *
 * 全部是 currentColor 的纯 SVG：不依赖宿主图标集，颜色随按钮继承主题，明暗切换
 * 不需要额外处理。导出的是渲染函数，避免为每个 12px 图标单建一个组件文件。
 */
import React from 'react'

/**
 * 生成一个 16×16 的线性图标容器。
 * @param children 图形
 * @param size 渲染尺寸
 * @param strokeWidth 线条粗细；小尺寸图标可适当加粗保证观感
 * @returns SVG 节点
 */
function icon(children: React.ReactNode, size = 15, strokeWidth = 1.25): React.ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
    >
      {children}
    </svg>
  )
}

/** 左侧工具条与面板标题使用的 Git 分支图标。 */
export function gitIcon(): React.ReactNode {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true" focusable="false">
      <circle cx="5.6" cy="4.8" r="1.9" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="5.6" cy="13.2" r="1.9" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="12.6" cy="7.6" r="1.9" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5.6 6.7v4.6M12.6 9.5c0 2-2 3.7-4.4 3.7H5.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

/**
 * 环形刷新箭头。
 * @param size 渲染尺寸
 */
export function refreshIcon(size = 15): React.ReactNode {
  return icon(
    <>
      <path d="M13.2 7.2A5.4 5.4 0 0 0 4 4.6L2.6 6" />
      <path d="M2.6 2.9V6h3.1" />
      <path d="M2.8 8.8A5.4 5.4 0 0 0 12 11.4l1.4-1.4" />
      <path d="M13.4 13.1V10H10.3" />
    </>,
    size,
  )
}

/**
 * 收起全部：两个叠在一起的向下箭头。
 *
 * 与「展开全部」的两枚相离箭头区分：收起是把层级往下压，展开是向上下两端撑开。
 */
export function collapseIcon(): React.ReactNode {
  return icon(
    <>
      <path d="M4 3.2 8 7l4-3.8" />
      <path d="M4 8.8 8 12.6l4-3.8" />
    </>,
  )
}

/**
 * 向下展开。
 * @param size 渲染尺寸；搜索框内的小角标用更小一号
 */
export function chevronDownIcon(size = 15): React.ReactNode {
  return icon(<path d="m4 6 4 4 4-4" />, size)
}

/** 向右展开。 */
export function chevronRightIcon(): React.ReactNode {
  return icon(<path d="m6 4 4 4-4 4" />)
}

/**
 * 关闭。
 * @param size 渲染尺寸
 */
export function closeIcon(size = 15): React.ReactNode {
  return icon(
    <>
      <path d="m4 4 8 8" />
      <path d="m12 4-8 8" />
    </>,
    size,
  )
}

/** 新建页签。 */
export function plusIcon(): React.ReactNode {
  return icon(
    <>
      <path d="M8 3v10" />
      <path d="M3 8h10" />
    </>,
  )
}

/** 更多操作。 */
export function kebabIcon(): React.ReactNode {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false" className="shrink-0">
      <circle cx="8" cy="3.2" r="1.1" />
      <circle cx="8" cy="8" r="1.1" />
      <circle cx="8" cy="12.8" r="1.1" />
    </svg>
  )
}

/** 最小化。 */
export function minimizeIcon(): React.ReactNode {
  return icon(<path d="M3.5 11.5h9" />)
}

/**
 * 向上箭头；差异导航里表示上一处。
 * @param size 渲染尺寸
 */
export function arrowUpIcon(size = 15): React.ReactNode {
  return icon(<path d="M8 13V3M4.5 6.5 8 3l3.5 3.5" />, size)
}

/**
 * 向下箭头。
 * @param size 渲染尺寸
 */
export function arrowDownIcon(size = 15): React.ReactNode {
  return icon(<path d="M8 3v10M4.5 9.5 8 13l3.5-3.5" />, size)
}

/** 更新工程：斜向左下的箭头；分支名旁的同步标记用小一号尺寸。 */
export function updateIcon(size = 15, strokeWidth = 1.25): React.ReactNode {
  return icon(
    <>
      <path d="M12.6 3.4 3.6 12.4" />
      <path d="M3.2 7.6v5.2h5.2" />
    </>,
    size,
    strokeWidth,
  )
}

/** 推送：斜向右上的箭头；分支名旁的同步标记用小一号尺寸。 */
export function pushIcon(size = 15, strokeWidth = 1.25): React.ReactNode {
  return icon(
    <>
      <path d="M3.4 12.6 12.4 3.6" />
      <path d="M7.6 3.2h5.2v5.2" />
    </>,
    size,
    strokeWidth,
  )
}

/** 向左箭头。 */
export function arrowLeftIcon(): React.ReactNode {
  return icon(<path d="M13 8H3M6.5 4.5 3 8l3.5 3.5" />)
}

/** 向右箭头。 */
export function arrowRightIcon(): React.ReactNode {
  return icon(<path d="M3 8h10M9.5 4.5 13 8l-3.5 3.5" />)
}

/** 编辑（在编辑器中打开）。 */
export function pencilIcon(size = 14): React.ReactNode {
  return icon(
    <>
      <path d="M11.3 2.7a1.4 1.4 0 0 1 2 2L5.6 12.4l-3 .7.7-3z" />
      <path d="m10 4 2 2" />
    </>,
    size,
  )
}

/**
 * 设置：标准齿轮。
 *
 * 用 24 视图的常规齿轮轮廓，16 视图那版齿形在小尺寸下会糊成一块，认不出是什么。
 * @param size 渲染尺寸
 */
export function gearIcon(size = 15): React.ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

/** 差异标题前的文件锁标记。 */
export function lockIcon(): React.ReactNode {
  return icon(
    <>
      <rect x="3.4" y="7" width="9.2" height="6.4" rx="1" />
      <path d="M5.6 7V5.4a2.4 2.4 0 0 1 4.8 0V7" />
    </>,
  )
}

/** 分支图标：提交节点与连线。 */
export function branchIcon(size = 15, strokeWidth = 1.25): React.ReactNode {
  return icon(
    <>
      <circle cx="5" cy="3.4" r="1.5" />
      <circle cx="5" cy="12.6" r="1.5" />
      <circle cx="11.2" cy="6.4" r="1.5" />
      <path d="M5 4.9v6.2M11.2 7.9c0 2.2-1.7 3.5-4 3.5H6.5" />
    </>,
    size,
    strokeWidth,
  )
}

/**
 * 眼睛：显示全部分支。
 * @param size 渲染尺寸
 */
export function eyeIcon(size = 15): React.ReactNode {
  return icon(
    <>
      <path d="M1.5 8S4 3.8 8 3.8 14.5 8 14.5 8 12 12.2 8 12.2 1.5 8 1.5 8Z" />
      <circle cx="8" cy="8" r="1.7" />
    </>,
    size,
  )
}

/**
 * 时钟：显示时间信息。
 * @param size 渲染尺寸
 */
export function clockIcon(size = 15): React.ReactNode {
  return icon(
    <>
      <circle cx="8" cy="8" r="5.8" />
      <path d="M8 4.6V8l2.4 1.4" />
    </>,
    size,
  )
}

/** 排序：上下箭头。 */
export function sortIcon(): React.ReactNode {
  return icon(
    <>
      <path d="M5 3v10M2.8 10.8 5 13l2.2-2.2" />
      <path d="M11 13V3M8.8 5.2 11 3l2.2 2.2" />
    </>,
  )
}

/**
 * 搜索放大镜。
 * @param size 渲染尺寸
 */
export function searchIcon(size = 15): React.ReactNode {
  return icon(
    <>
      <circle cx="7" cy="7" r="4.2" />
      <path d="m10.2 10.2 3 3" />
    </>,
    size,
  )
}

/**
 * 暂停刷新：两条竖线。
 *
 * 与 IDEA 一致画成方头粗线而不是圆头，小尺寸下才看得出是两个「暂停」短柱。
 * @param size 渲染尺寸
 */
export function pauseIcon(size = 16): React.ReactNode {
  return icon(
    <>
      <path d="M6.2 3.6v8.8" strokeWidth="1.8" />
      <path d="M9.8 3.6v8.8" strokeWidth="1.8" />
    </>,
    size,
  )
}

/**
 * 按日期排序：向下的箭头与右侧的点列，对应 IDEA 的 Sort by Date。
 * @param size 渲染尺寸
 */
export function sortByDateIcon(size = 20): React.ReactNode {
  return icon(
    <>
      <path d="M6.4 3v10.2" />
      <path d="M3.4 10.2 6.4 13.2 9.4 10.2" />
      <path d="M12.4 4.4h.01" strokeWidth="1.9" />
      <path d="M12.4 8h.01" strokeWidth="1.9" />
    </>,
    size,
  )
}

/**
 * 右下角小三角：表示该按钮还带一个弹出菜单。
 * @returns 5×5 的实心三角形
 */
export function popupMarkIcon(): React.ReactNode {
  return (
    <svg width="5" height="5" viewBox="0 0 5 5" fill="currentColor" aria-hidden="true" focusable="false" className="shrink-0">
      <path d="M5 5H0L5 0z" />
    </svg>
  )
}

/** 星标：远程 HEAD 分支。 */
export function starIcon(): React.ReactNode {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false" className="shrink-0">
      <path d="m8 1.8 1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z" />
    </svg>
  )
}

/** 本地分支的标签标记：IDEA 用斜置的黄色标签区分本地分支。 */
export function bookmarkIcon(): React.ReactNode {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false" className="shrink-0">
      {/* 标签轮廓与左上的圆孔共用一条 evenodd 路径，孔透出弹窗底色 */}
      <path
        fillRule="evenodd"
        d="M8.9 1.8H1.8v7.1l5.1 5.1 7.1-7.1zM4.9 4.2a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4z"
      />
    </svg>
  )
}

/** 加载中：八段径向短线组成的圆环，配合旋转动画使用。 */
export function spinnerIcon(): React.ReactNode {
  /** 八个方向的短线，绕图标中心均匀分布。 */
  const spokes = [0, 45, 90, 135, 180, 225, 270, 315]

  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
    >
      {spokes.map((angle) => (
        <line key={angle} x1="8" y1="2.4" x2="8" y2="4.6" transform={`rotate(${angle} 8 8)`} />
      ))}
    </svg>
  )
}

/** 拉取：虚线斜箭头，IDEA 用虚线表示「只取回不合并」。 */
export function fetchIcon(): React.ReactNode {
  return icon(
    <>
      <path d="M12.8 3.2 7 9" strokeDasharray="1.9 1.7" />
      <path d="M3.6 8.4v4.2h4.2" />
    </>,
  )
}

/** 双向箭头：显示/对比差异。 */
export function diffIcon(): React.ReactNode {
  return icon(
    <>
      <path d="M2.5 5.6h9.6M9.6 3.2 12 5.6l-2.4 2.4" />
      <path d="M13.5 10.4H3.9M6.4 8 4 10.4l2.4 2.4" />
    </>,
  )
}

/** 提交节点与两侧连线：Commit 动作（提交弹窗入口）。 */
export function nodeLineIcon(): React.ReactNode {
  return icon(
    <>
      <circle cx="8" cy="8" r="2.1" />
      <path d="M1.6 8h4.3M10.1 8h4.3" />
    </>,
  )
}

/** 上下两组箭头：展开全部。 */
export function expandAllIcon(): React.ReactNode {
  return icon(
    <>
      <path d="m4.4 6.4 3.6-3.6 3.6 3.6" />
      <path d="m4.4 9.6 3.6 3.6 3.6-3.6" />
    </>,
  )
}

/** 回滚：左向箭头接一条绕回原处的弧线，与 IDEA 的 Rollback 图标一致。 */
export function rollbackIcon(): React.ReactNode {
  return icon(
    <>
      <path d="M10.2 5.2H4.8" />
      <path d="m7.6 2.6-2.8 2.6 2.8 2.6" />
      <path d="M10.2 5.2a3.2 3.2 0 0 1 0 6.4H4.4" />
    </>,
  )
}

/**
 * 双向箭头：上排箭头朝左、下排箭头朝右，对应 IDEA 提交详情栏的上一处/下一处。
 * @param size 渲染尺寸
 */
export function doubleArrowIcon(size = 14): React.ReactNode {
  return icon(
    <>
      <path d="M11.6 5H4.2" />
      <path d="M6.6 2.6 4 5l2.6 2.4" />
      <path d="M4.4 11h7.4" />
      <path d="M9.4 8.6 12 11l-2.6 2.4" />
    </>,
    size,
  )
}

/**
 * 回退箭头：上边一行箭头朝左，右端向下绕成半圆、底部折回，形状同 IDEA 的撤销。
 * @param size 渲染尺寸
 */
export function undoArrowIcon(size = 14): React.ReactNode {
  return icon(
    <>
      <path d="M11 5H4" />
      <path d="M6.6 2.4 4 5l2.6 2.6" />
      <path d="M11 5a3 3 0 0 1 0 6H4.4" />
    </>,
    size,
  )
}

/**
 * 展开：上下两个箭头背向分开。
 * @param size 渲染尺寸
 */
export function expandDetailIcon(size = 14): React.ReactNode {
  return icon(
    <>
      <path d="M3.2 5.2 8 1.9l4.8 3.3" />
      <path d="M3.2 10.8 8 14.1l4.8-3.3" />
    </>,
    size,
  )
}

/**
 * 收起：上下两个箭头相对靠近。
 * @param size 渲染尺寸
 */
export function collapseDetailIcon(size = 14): React.ReactNode {
  return icon(
    <>
      <path d="M3.2 1.9 8 5.2l4.8-3.3" />
      <path d="M3.2 14.1 8 10.8l4.8 3.3" />
    </>,
    size,
  )
}

/** 帮助：带问号的圆。 *//** 帮助：带问号的圆。 */
export function helpIcon(): React.ReactNode {
  return icon(
    <>
      <circle cx="8" cy="8" r="6.1" />
      <path d="M6.2 6.2a1.9 1.9 0 1 1 2.5 1.8c-.5.2-.8.6-.8 1.1v.3" />
      <path d="M8 11.4h.01" strokeWidth="1.7" />
    </>,
  )
}

/** 搁置改动：向下箭头落入托盘，与 IDEA 的 Shelve Changes 图标一致。 */
export function stashIcon(): React.ReactNode {
  return icon(
    <>
      <path d="M8 2.2v7.4" />
      <path d="M5.4 7 8 9.6 10.6 7" />
      <path d="M2.5 9.4h2.6l1 1.8h3.8l1-1.8h2.6V14H2.5z" />
    </>,
  )
}

/** 向上出线：恢复搁置的改动。 */
export function unstashIcon(): React.ReactNode {
  return icon(
    <>
      <path d="M8 9.8V2.4M4.9 5.5 8 2.4l3.1 3.1" />
      <path d="M3 13.4h10" />
    </>,
  )
}

/** 从栈顶取出：托盘在上，箭头向上穿出，区别于恢复但保留记录的 unstash。 */
export function popStashIcon(): React.ReactNode {
  return icon(
    <>
      <path d="M3 2.6h10" />
      <path d="M8 13.6V6.2M4.9 9.3 8 6.2l3.1 3.1" />
    </>,
  )
}

/** 列表：提交选项与分组。 */
export function listIcon(): React.ReactNode {  return icon(
    <>
      <path d="M6 4.2h7.4M6 8h7.4M6 11.8h7.4" />
      <path d="M2.6 4.2h.9M2.6 8h.9M2.6 11.8h.9" />
    </>,
  )
}

/** 斜向箭头：检出分支。 */
export function checkoutIcon(): React.ReactNode {
  return icon(
    <>
      <path d="M12.4 3.6 4.2 11.8" />
      <path d="M4.2 6.6v5.2h5.2" />
    </>,
  )
}

/** 垃圾桶：删除。 */
export function trashIcon(size = 14): React.ReactNode {
  return icon(
    <>
      <path d="M2.8 4.4h10.4M6 4.4V2.8h4v1.6" />
      <path d="M4.4 4.4 5 13.4h6l.6-9" />
      <path d="M6.6 6.8v4.2M9.4 6.8v4.2" />
    </>,
    size,
  )
}

/** 软换行：一行长文本在右端折回，与 IDEA 控制台的 Use Soft Wraps 图标一致。 */
export function softWrapIcon(): React.ReactNode {
  return icon(
    <>
      <path d="M2.4 4.2h11.2" />
      <path d="M2.4 7.6h7.4a2.5 2.5 0 0 1 0 5H6.2" />
      <path d="M8 10.4 6.2 12.6 8 14.8" />
    </>,
  )
}

/** 双向向下箭头：滚动到末尾。 */
export function scrollEndIcon(): React.ReactNode {
  return icon(
    <>
      <path d="M8 2.4v6.2M5.2 6 8 8.8 10.8 6" />
      <path d="M8 8.4v3.2M5.2 9.2 8 12l2.8-2.8" />
    </>,
  )
}

/** 左尖括号：返回上一步。 */
export function backIcon(): React.ReactNode {
  return icon(<path d="M10 3.2 5.2 8l4.8 4.8" />)
}

/**
 * 过滤：三条列表线与一组蓝色箭头。
 *
 * 箭头用宿主的业务强调色，与其它过滤入口的强调一致；线条仍是普通前景色，
 * 与 IDEA 里「过滤作用于这份列表」的配色相符。
 * @param size 渲染尺寸
 */
export function filterIcon(size = 15): React.ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
    >
      <path d="M2.4 3.4h6.2M2.4 6.6h4.6M2.4 9.8h3.4" />
      {/* 过滤箭头：强调色，与线条区分开 */}
      <g className="text-info" strokeWidth="1.5">
        <path d="M13.8 5.4h-4.4M8.6 8.6h5.2M11 3.4l2 2-2 2M11 10.6l2-2-2-2" />
      </g>
    </svg>
  )
}

/**
 * 在 Log 页签中定位：提交节点与日志行。
 * @param size 渲染尺寸
 */
export function showInLogIcon(size = 15): React.ReactNode {
  return icon(
    <>
      <circle cx="4.6" cy="4.4" r="1.5" />
      <path d="M4.6 5.9v5.7M4.6 11.6h3.4" />
      <path d="M10.6 4.4h3M10.6 11.6h1.4" />
      <circle cx="12.4" cy="11.6" r="1.3" />
    </>,
    size,
  )
}

/** 折叠未变更片段：两个相对的折角，与 IDEA 差异工具条上的同名开关一致。 */
export function collapseFragmentsIcon(): React.ReactNode {
  return icon(
    <>
      <path d="M4.2 4.6 8 8.4l3.8-3.8" />
      <path d="M4.2 11.4 8 7.6l3.8 3.8" />
    </>,
  )
}

/**
 * 引用标签：提交行右侧的分支/标签标记。
 * @param size 渲染尺寸
 */
export function refLabelIcon(size = 12): React.ReactNode {
  return icon(
    <>
      <path d="M8.4 2.6h4.4a.6.6 0 0 1 .6.6V7.6a.6.6 0 0 1-.18.42l-6.4 6.4a.6.6 0 0 1-.85 0l-4-4a.6.6 0 0 1 0-.85l6.4-6.4a.6.6 0 0 1 .42-.18Z" />
      <circle cx="11" cy="5" r=".9" />
    </>,
    size,
  )
}

