/**
 * 装配清单：所有已注册的 feature。
 *
 * 新增 toolWindow / bottomPanel 功能：
 *   1. 新建 src/client/features/<id>/，提供 index.ts（含 id / slot / locales / view）
 *   2. 在下面的数组里追加该文件夹的默认导出
 *   3. 运行 npm run build 并刷新页面，工具条上即出现对应入口
 *
 * 新增 editorTab 功能：提供 editor 字段（canOpen + render）。
 * 新增 service 功能：提供 host 字段，并在 features/host.ts 里登记同一模块。
 *
 * P0 阶段还没有 feature，数组为空是预期状态。
 */
import type { IdeFeature } from '../shell/contract'

export const featureList: IdeFeature[] = []
