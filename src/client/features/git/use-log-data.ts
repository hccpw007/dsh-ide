/**
 * Log 页签的取数：分支、当前提交身份与提交分页。
 *
 * 三者都由提交列表决定刷新时机，收在一个 hook 里，LogTab 只负责布局与交互，
 * 不再持有分页、加载态与错误文案。
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import { readAuthors, readGitUser, readLog, readRefs, type GitCommit, type GitRefs } from './api'

/**
 * 每次加载的提交数。
 *
 * 与 IDEA 一致分批加载：一次拉几百条会把「同时活跃的分支」全算进分支图，列宽随
 * 最深一行的分叉数量暴涨，而首屏其实只有两三条线。分批加载让列宽跟着实际看到的
 * 历史增长。
 */
const COMMIT_LIMIT = 100

/** Log 页签的取数结果。 */
export interface LogData {
  /** 分支、远端与标签；未读取到时为 null。 */
  refs: GitRefs | null
  /** 当前提交身份（git config user.name）；读不到时为空串。 */
  currentUser: string
  /** 仓库全部提交的作者，按提交数从多到少；User 过滤菜单的候选来源。 */
  allAuthors: string[]
  /** 已加载的提交。 */
  commits: GitCommit[]
  /** 首屏提交是否在读取。 */
  loading: boolean
  /** 首屏是否已经读过一次；定位提交要等它完成才判断「列表里有没有」。 */
  loadedOnce: boolean
  /** 是否还有更旧的提交可追加。 */
  hasMoreCommits: boolean
  /** 错误文案；空串表示正常。 */
  error: string
  /** 写入错误文案。 */
  setError(value: string): void
  /** 重新读取分支与当前提交身份。 */
  loadRefs(): Promise<void>
  /** 读取提交；append 为真时按 skip 追加。 */
  loadCommits(append?: boolean, skip?: number): Promise<void>
  /** 滚动到底部时追加下一页。 */
  loadMoreCommits(): void
}

/**
 * 读取 Log 页签需要的数据。
 * @param root 工作区根；空串表示会话还没绑定工作目录
 * @param branch 分支过滤；空串表示所有分支
 * @param pathFilter 路径过滤；空串表示不限路径
 * @returns 分支、提交身份、提交分页与对应的加载函数
 */
export function useLogData(root: string, branch: string, pathFilter: string): LogData {
  const [refs, setRefs] = useState<GitRefs | null>(null)
  const [currentUser, setCurrentUser] = useState('')
  const [allAuthors, setAllAuthors] = useState<string[]>([])
  const [commits, setCommits] = useState<GitCommit[]>([])
  const [loading, setLoading] = useState(false)
  const [loadedOnce, setLoadedOnce] = useState(false)
  const [hasMoreCommits, setHasMoreCommits] = useState(false)
  const [error, setError] = useState('')

  /** 追加请求是否在飞行中；滚动事件可能连发，用它挡住重复请求。 */
  const loadingMoreRef = useRef(false)

  /** 读取分支、标签与当前提交身份。 */
  const loadRefs = useCallback(async (): Promise<void> => {
    if (root === '') return

    const [refsResult, userResult] = await Promise.all([readRefs(root), readGitUser(root)])

    if (!refsResult.ok) {
      // 不是仓库属于正常状态，树留空即可
      if (refsResult.error.code !== 'GIT_NOT_REPOSITORY') setError(refsResult.error.message)
      setRefs(null)
    } else {
      setRefs(refsResult.value)
    }

    // 身份只影响 User 菜单的 me 项，读不到时按未配置处理
    setCurrentUser(userResult.ok ? userResult.value.name : '')
  }, [root])

  /**
   * 读取提交列表。
   * @param append 是否追加到已加载的提交之后（滚动到底部时）
   * @param skip 跳过多少条；追加时等于已加载条数
   */
  const loadCommits = useCallback(
    async (append = false, skip = 0): Promise<void> => {
      if (root === '') return

      if (!append) setLoading(true)

      const result = await readLog(root, {
        // 分支过滤为空就代表所有分支：与 IDEA 一致，此时按 --all 列出全部历史
        all: branch === '',
        branch,
        path: pathFilter,
        skip,
        limit: COMMIT_LIMIT,
      })

      if (!append) {
        setLoading(false)
        setLoadedOnce(true)
      }

      if (!result.ok) {
        if (result.error.code !== 'GIT_NOT_REPOSITORY') setError(result.error.message)
        if (!append) setCommits([])
        setHasMoreCommits(false)

        return
      }

      setError('')
      setHasMoreCommits(result.value.commits.length >= COMMIT_LIMIT)
      if (append) setCommits((previous) => [...previous, ...result.value.commits])
      else setCommits(result.value.commits)
    },
    [branch, pathFilter, root],
  )

  /** 滚动到底部时继续加载更旧的提交。 */
  const loadMoreCommits = useCallback((): void => {
    // 滚动事件可能在同一帧里连发多次，用 ref 挡住重复请求，避免同一段历史被追加两遍
    if (loadingMoreRef.current || !hasMoreCommits) return

    loadingMoreRef.current = true
    void loadCommits(true, commits.length).finally(() => {
      loadingMoreRef.current = false
    })
  }, [commits.length, hasMoreCommits, loadCommits])

  /**
   * 读取仓库全部作者。
   *
   * 提交是分页加载的，只从已加载提交里取作者会漏掉近期没提交的人；这份全量列表
   * 只随仓库变化读一次，刷新提交时不必重跑 shortlog。
   */
  const loadAuthors = useCallback(async (): Promise<void> => {
    if (root === '') return

    try {
      const result = await readAuthors(root)

      setAllAuthors(result.ok ? result.value.authors : [])
    } catch (requestError) { // 作者只影响菜单候选，读不到时退回已加载提交里的作者
      console.error('[dsh-ide] 读取提交作者失败:', requestError)
    }
  }, [root])

  useEffect(() => {
    void loadAuthors()
  }, [loadAuthors])

  useEffect(() => {
    void loadRefs()
  }, [loadRefs])

  useEffect(() => {
    void loadCommits()
  }, [loadCommits])

  return {
    refs,
    currentUser,
    allAuthors,
    commits,
    loading,
    loadedOnce,
    hasMoreCommits,
    error,
    setError,
    loadRefs,
    loadCommits,
    loadMoreCommits,
  }
}
