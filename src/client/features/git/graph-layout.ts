/**
 * 提交列表分支图的布局计算。
 *
 * 输入是「新 → 旧」顺序的提交，输出每行的节点列、连线与配色序号；渲染层只
 * 负责把比例坐标画成 SVG，不关心拓扑。布局按泳道推进：每条泳道等待某个父提交，
 * 遇到正在等待的提交就把节点放进该泳道；合并提交会同时占用多条泳道，于是画出
 * 分叉与汇合的折线，而不是每行一个孤立圆点。
 *
 * 跨列连线一律拆成「本行半段 + 下一行半段」：每段水平半列、垂直半行，两段共线，
 * 拼起来正好是跨界一列、跨行一行的 45° 直线，与 IDEA 分支图的折角一致。若把斜线
 * 压在一行内画完，斜率会变成 2:1，分支看起来又扁又平。
 */

/** 调色板容量；渲染层的配色类数量与它一致。 */
const TONE_COUNT = 4

/** 节点在行内的高度比例。 */
const NODE_RATIO = 0.5

/** 一条泳道上等待某个提交的状态。 */
interface LaneState {
  /** 该泳道正在等待的提交 hash。 */
  hash: string
  /** 调色板序号。 */
  tone: number
}

/** 已经画出前一段、还差后一段的跨列连线。 */
interface PendingLink {
  /** 起点列，位于两列之间，因此是半列值。 */
  fromLane: number
  /** 终点列。 */
  toLane: number
  /** 调色板序号。 */
  tone: number
  /** 终点列是否要把上半段竖线让给这条斜线；分叉出的新泳道需要，汇入既有泳道不需要。 */
  maskTop: boolean
  /** 这条斜线终结的那条泳道列；合并汇入时记下来源，下一行不再重复画线。 */
  mergeSource?: number
}

/** 一行里的一条连线。 */
export interface GraphLine {
  /** 起点列；跨列连线的半段坐标允许是半列值。 */
  fromLane: number
  /** 起点在本行的高度比例：0 顶部、0.5 节点中心、1 底部。 */
  fromRatio: number
  /** 终点列。 */
  toLane: number
  /** 终点在本行的高度比例。 */
  toRatio: number
  /** 调色板序号。 */
  tone: number
}

/** 一行提交的图元。 */
export interface GraphRow {
  /** 节点所在列。 */
  lane: number
  /** 节点颜色序号。 */
  tone: number
  /** 本行连线；竖向直穿与分叉斜线都在这份列表里。 */
  lines: GraphLine[]
}

/** 分支图布局结果。 */
export interface GraphLayout {
  /** 每行图元，与传入提交一一对应。 */
  rows: GraphRow[]
  /** 使用过的最大列数；渲染层据此给出固定列宽。 */
  laneCount: number
}

/**
 * 找出正在等待某提交的泳道。
 * @param lanes 当前泳道
 * @param hash 提交 hash
 * @returns 列号列表，按列从左到右
 */
function waitingLanes(lanes: readonly (LaneState | null)[], hash: string): number[] {
  const result: number[] = []

  lanes.forEach((lane, index) => {
    if (lane !== null && lane.hash === hash) result.push(index)
  })

  return result
}

/**
 * 复制一条连线并翻转行内高度。
 * @param line 原连线
 * @returns 上下颠倒后的连线
 */
function flipLine(line: GraphLine): GraphLine {
  return {
    fromLane: line.fromLane,
    fromRatio: 1 - line.fromRatio,
    toLane: line.toLane,
    toRatio: 1 - line.toRatio,
    tone: line.tone,
  }
}

/**
 * 把新 → 旧顺序的布局翻成旧 → 新顺序。
 *
 * 提交列表按时间升序展示时，拓扑仍要按新 → 旧算：父提交必须在子提交之后处理，
 * 否则每条泳道都匹配不上，图会退化成一行一个孤立节点。这里只做行序与行内翻折，
 * 不重算拓扑，保证折线在行与行之间仍然首尾相接。
 * @param layout 新 → 旧布局
 * @returns 旧 → 新布局
 */
export function flipGraphLayout(layout: GraphLayout): GraphLayout {
  return {
    laneCount: layout.laneCount,
    rows: [...layout.rows].reverse().map((row) => ({
      lane: row.lane,
      tone: row.tone,
      lines: row.lines.map(flipLine),
    })),
  }
}

/**
 * 计算分支图布局。
 * @param commits 按「新 → 旧」排列的提交
 * @returns 每行图元与列数
 */
export function buildGraphLayout(
  commits: readonly { hash: string; parents: readonly string[] }[],
): GraphLayout {
  const rows: GraphRow[] = []
  const lanes: (LaneState | null)[] = []
  const usedTones = new Set<number>()
  let laneCount = 0
  let pending: PendingLink[] = []
  let toneCursor = 0

  /** 取一个配色序号；从上次分配处轮转，相邻分支才不会撞成同一个颜色。 */
  const takeTone = (): number => {
    for (let step = 0; step < TONE_COUNT; step += 1) {
      const tone = (toneCursor + step) % TONE_COUNT

      if (!usedTones.has(tone)) {
        usedTones.add(tone)
        toneCursor = (tone + 1) % TONE_COUNT

        return tone
      }
    }

    // 泳道数超过调色板时回绕取色：宁可两列撞色，也不能让取色无限膨胀
    return lanes.length % TONE_COUNT
  }

  /**
   * 在空列（或末尾新列）上放一条等待某提交的泳道。
   * @param hash 等待的提交 hash
   * @returns 泳道列号
   */
  const placeLane = (hash: string): number => {
    let index = lanes.indexOf(null)

    if (index === -1) {
      index = lanes.length
      lanes.push(null)
    }

    lanes[index] = { hash, tone: takeTone() }
    if (lanes.length > laneCount) laneCount = lanes.length

    return index
  }

  /**
   * 结束一条泳道并归还它的配色。
   * @param index 列号
   */
  const releaseLane = (index: number): void => {
    const lane = lanes[index]
    if (lane === null || lane === undefined) return

    usedTones.delete(lane.tone)
    lanes[index] = null
  }

  commits.forEach((commit, rowIndex) => {
    const lines: GraphLine[] = []
    const masked = new Set<number>()

    // 先接住上一行没画完的斜线：它在本行上半段斜进目标列
    const pendingTargets = new Set<number>()
    const mergedFrom = new Set<number>()
    for (const link of pending) {
      lines.push({
        fromLane: link.fromLane,
        fromRatio: 0,
        toLane: link.toLane,
        toRatio: NODE_RATIO,
        tone: link.tone,
      })
      pendingTargets.add(link.toLane)
      if (link.maskTop) masked.add(link.toLane)
      if (link.mergeSource !== undefined) mergedFrom.add(link.mergeSource)
    }
    pending = []

    // 本行开始时的泳道快照：直穿线要按这份状态画，不能被后面的改写影响
    const entryLanes = [...lanes]
    const waiting = waitingLanes(entryLanes, commit.hash)
    const ownLane = waiting.length > 0 ? waiting[0] : placeLane(commit.hash)
    // ownLane 要么来自 waiting（判断过非空），要么由 placeLane 刚写入，必然有值
    const own = lanes[ownLane] as LaneState

    // 节点列的上半段；被斜线占位时留给斜线，避免主线出现两截重叠
    if (waiting.length > 0 && !masked.has(ownLane)) {
      lines.push({ fromLane: ownLane, fromRatio: 0, toLane: ownLane, toRatio: NODE_RATIO, tone: own.tone })
    }

    // 合并进来的泳道：从行顶斜入节点，然后这条分支就到头了
    for (const index of waiting) {
      if (index === ownLane) continue

      const lane = entryLanes[index] as LaneState
      // 上一行已经为这次汇入排好了半段斜线，这里不能再画一条
      if (!pendingTargets.has(index) && !mergedFrom.has(index)) {
        lines.push({ fromLane: index, fromRatio: 0, toLane: ownLane, toRatio: NODE_RATIO, tone: lane.tone })
      }
      releaseLane(index)
    }

    /**
     * 画一条跨列连线。
     * @param fromLane 起点列
     * @param toLane 终点列
     * @param tone 调色板序号
     * @param maskTop 终点列是否让出上半段竖线
     */
    const link = (fromLane: number, toLane: number, tone: number, maskTop: boolean): void => {
      const delta = toLane - fromLane

      // 相邻列拆成两行画，两段共线，视觉上是一条 45° 直线
      if (Math.abs(delta) === 1) {
        const mid = fromLane + delta / 2
        lines.push({ fromLane, fromRatio: NODE_RATIO, toLane: mid, toRatio: 1, tone })
        pending.push({ fromLane: mid, toLane, tone, maskTop })

        return
      }

      // 合并到远处泳道时一行画完：再排队会把图拉成好几行，反而更难读
      lines.push({ fromLane, fromRatio: NODE_RATIO, toLane, toRatio: 1, tone })
    }

    const [firstParent, ...otherParents] = commit.parents

    // 本列是否还需要继续向下画；第一父并入别的泳道时本列在这一行就结束
    let keepsLane = false

    if (firstParent === undefined) {
      // 根提交没有父提交，本列到此结束
      releaseLane(ownLane)
    } else {
      // 第一父已在别的列里等待时不再新占一列：本列在这里并入那条泳道。
      // 否则每次分支汇合都会多留一条空列到父提交出现，图会越滚越宽。
      const existing = lanes.findIndex(
        (lane, index) => index !== ownLane && lane !== null && lane.hash === firstParent,
      )

      if (existing === -1) {
        // 第一父提交沿用本列与配色，主线不断色
        lanes[ownLane] = { hash: firstParent, tone: own.tone }
        keepsLane = true
      } else {
        // 汇入线用本列的颜色：分支合并回主线后，那条分支的线整段是同一个颜色
        link(ownLane, existing, own.tone, false)
        releaseLane(ownLane)
      }
    }

    for (const parent of otherParents) {
      const existing = lanes.findIndex((lane) => lane !== null && lane.hash === parent)

      if (existing !== -1) {
        // 父提交已有泳道在等：这是合并汇入，斜线连向那条泳道，颜色跟着本分支走
        link(ownLane, existing, own.tone, false)

        continue
      }

      // 父提交还没有泳道：分叉出新的分支列
      const index = placeLane(parent)
      const lane = lanes[index] as LaneState
      link(ownLane, index, lane.tone, true)
    }

    // 下一行的拓扑已定，本行的下行线要按它决定是竖直还是斜向：本行路过、且下一行
    // 会被合并的泳道，斜线同样拆两段，折角才是 45°
    const nextCommit = commits[rowIndex + 1]
    const nextWaiting = nextCommit === undefined ? [] : waitingLanes(lanes, nextCommit.hash)
    const nextOwnLane = nextWaiting.length > 0 ? nextWaiting[0] : -1

    /** 本行结束时仍在向下的泳道：第一父所在列 + 直穿列。 */
    const downLanes: { lane: number; tone: number; fromRatio: number }[] = []

    if (keepsLane) {
      downLanes.push({ lane: ownLane, tone: own.tone, fromRatio: NODE_RATIO })
    }

    entryLanes.forEach((lane, index) => {
      if (lane === null || index === ownLane) return
      if (waiting.includes(index)) return

      downLanes.push({ lane: index, tone: lane.tone, fromRatio: masked.has(index) ? NODE_RATIO : 0 })
    })

    for (const down of downLanes) {
      const mergingNextRow = nextOwnLane !== -1 && down.lane !== nextOwnLane && nextWaiting.includes(down.lane)

      if (!mergingNextRow) {
        lines.push({ fromLane: down.lane, fromRatio: down.fromRatio, toLane: down.lane, toRatio: 1, tone: down.tone })

        continue
      }

      // 先竖到半行，再从半列处斜出，下一行接着斜进节点列
      const mid = down.lane + Math.sign(nextOwnLane - down.lane) / 2

      if (down.fromRatio < NODE_RATIO) {
        lines.push({ fromLane: down.lane, fromRatio: down.fromRatio, toLane: down.lane, toRatio: NODE_RATIO, tone: down.tone })
      }

      lines.push({ fromLane: down.lane, fromRatio: NODE_RATIO, toLane: mid, toRatio: 1, tone: down.tone })
      pending.push({ fromLane: mid, toLane: nextOwnLane, tone: down.tone, maskTop: false, mergeSource: down.lane })
    }

    rows.push({ lane: ownLane, tone: own.tone, lines })
  })

  return { rows, laneCount: Math.max(laneCount, 1) }
}
