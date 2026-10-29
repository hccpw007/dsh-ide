/**
 * TODO 面板的中英文案。
 *
 * key 不带 feature 前缀，外壳注册时统一加 `todo.`。
 */
import type { LocaleDictionaries } from '../../../common/locale'

export const locales: LocaleDictionaries = {
  zh: {
    // 工具条按钮与工具窗口标题
    title: 'TODO',
    // 未绑定工作区
    noSession: '当前会话还没有工作目录',
    // 扫描按钮
    scan: '扫描',
    // 扫描进行中
    scanning: '扫描中…',
    // 标记过滤下拉框的「全部」项
    allMarkers: '全部标记',
    // 已扫描文件数标签
    scannedFiles: '已扫描',
    // 命中数标签
    matches: '条标记',
    // 结果被截断
    truncated: '结果过多，仅显示前 2000 条',
    // 没有标记
    empty: '没有找到 TODO / FIXME / HACK / XXX 标记',
    // 右键菜单：重新扫描工作区
    menuScan: '重新扫描',
    // 右键菜单：清空当前结果
    menuClear: '清空结果',
    // 右键菜单：打开 IDE 设置
    menuSettings: '设置…',
  },
  en: {
    title: 'TODO',
    noSession: 'This session has no working directory yet',
    scan: 'Scan',
    scanning: 'Scanning…',
    allMarkers: 'All markers',
    scannedFiles: 'Scanned',
    matches: 'markers',
    truncated: 'Too many results, showing first 2000',
    empty: 'No TODO / FIXME / HACK / XXX markers found',
    menuScan: 'Rescan',
    menuClear: 'Clear Results',
    menuSettings: 'Settings…',
  },
}
