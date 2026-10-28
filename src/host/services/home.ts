/**
 * DSH_HOME 的解析。
 *
 * 插件把设置、运行配置与回收站放在宿主数据目录下，与宿主自己的数据同级，
 * 这样重装插件不会丢掉用户配置，也不会污染项目仓库。
 */
import { homedir } from 'node:os'
import path from 'node:path'

/**
 * 取宿主数据目录。
 *
 * 宿主自身用 `DSH_HOME` 环境变量指定数据目录；未设置时与宿主一样回落到 `~/.dsh`。
 * @returns 绝对路径
 */
export function dshHome(): string {
  const configured = process.env.DSH_HOME

  return configured !== undefined && configured !== '' ? configured : path.join(homedir(), '.dsh')
}

/**
 * 插件自己的数据目录。
 * @returns 绝对路径
 */
export function pluginDataDir(): string {
  return path.join(dshHome(), 'dsh-ide')
}
