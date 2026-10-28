/**
 * 宿主侧回收站服务。
 *
 * 删除不真删：按设计 D2，条目先移进 `$DSH_HOME/dsh-ide/trash/<时间戳>/`，7 天内可
 * 恢复。同一批次的条目写进同一个时间戳目录并附 manifest，恢复时按 manifest 放回原位。
 *
 * 清理只在工作台打开后异步触发一次，不进入 `apply()` 同步路径。
 */
import { appendFile, mkdir, readdir, rename, rm, stat } from 'node:fs/promises'
import path from 'node:path'

import { resolveWithin, WorkspaceError } from './workspace'

/** 回收站保留天数。 */
const TRASH_RETENTION_DAYS = 7

/**
 * 回收站根目录。
 * @param home 宿主 DSH_HOME
 * @returns 插件回收站路径
 */
function trashRoot(home: string): string {
  return path.join(home, 'dsh-ide', 'trash')
}

/** 回收站清单条目。 */
interface TrashManifestEntry {
  /** 原绝对路径。 */
  originalPath: string
  /** 在本批次目录内的存放名。 */
  storedAs: string
  /** 删除时间（ISO）。 */
  deletedAt: string
}

/**
 * 把条目移入回收站。
 *
 * 按设计 D2：删除不真删，先移进 `$DSH_HOME/dsh-ide/trash/<时间戳>/`，7 天内可恢复。
 * 同一批次的条目写进同一个时间戳目录并附 manifest，恢复时按 manifest 放回原位。
 * @param root 工作区根
 * @param home 宿主 DSH_HOME
 * @param input 目标路径
 * @returns 回收站批次目录与 manifest 条目
 */
export async function trashEntry(
  root: string,
  home: string,
  input: string,
): Promise<{ batch: string; entry: TrashManifestEntry }> {
  const resolved = await resolveWithin(root, input)

  // 删除工作区根等于删项目，必须挡住
  if (resolved.absolute === resolved.root) {
    throw new WorkspaceError('PATH_INVALID', '不能删除工作区根目录')
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const batch = path.join(trashRoot(home), stamp)
  const storedAs = resolved.relative === '' ? path.basename(resolved.absolute) : resolved.relative.split('/').join('__')

  await mkdir(batch, { recursive: true })
  await rename(resolved.absolute, path.join(batch, storedAs))

  const entry: TrashManifestEntry = {
    originalPath: resolved.absolute,
    storedAs,
    deletedAt: new Date().toISOString(),
  }

  await appendFile(path.join(batch, 'manifest.json'), `${JSON.stringify(entry)}\n`, 'utf8')

  return { batch, entry }
}

/**
 * 清理超过保留期的回收站批次。
 *
 * 设计明确要求这一步异步进行、不进入 apply 同步路径，因此只由路由按需触发。
 * @param home 宿主 DSH_HOME
 * @returns 清理掉的批次数量
 */
export async function purgeTrash(home: string): Promise<number> {
  const root = trashRoot(home)
  const batches = await readdir(root).catch(() => [] as string[])
  const deadline = Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000
  let removed = 0

  for (const batch of batches) {
    const batchPath = path.join(root, batch)
    const info = await stat(batchPath).catch(() => undefined)
    if (info === undefined || info.mtimeMs > deadline) continue

    await rm(batchPath, { recursive: true, force: true })
    removed += 1
  }

  return removed
}

