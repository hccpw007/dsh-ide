/**
 * 冲突解决界面的中英文案。
 *
 * key 不带 feature 前缀，外壳注册时统一加 `conflicts.`。
 * 同一份字典同时服务逐块选择视图（ConflictViewer）、冲突列表窗与三栏合并窗口。
 */
import type { LocaleDictionaries } from '../../../common/locale'

export const locales: LocaleDictionaries = {
  zh: {
    // 保存解决结果的按钮
    save: '保存',
    // 保存成功的提示
    saved: '冲突已解决并保存',
    // 文件里没有冲突标记
    noConflicts: '这个文件里没有冲突标记',
    // 冲突块序号前缀
    conflictBlock: '冲突块',
    // 接受当前分支内容
    acceptOurs: '当前',
    // 接受传入分支内容
    acceptTheirs: '传入',
    // 两侧都保留
    acceptBoth: '双方',
    // 右键菜单：保存解决结果
    menuSave: '保存结果',
    // 右键菜单：接受当前分支（需要先在冲突块上选择）
    menuAcceptOurs: '接受当前分支',
    // 右键菜单：接受传入分支（需要先在冲突块上选择）
    menuAcceptTheirs: '接受传入分支',
    // 右键菜单：打开 IDE 设置
    menuSettings: '设置…',
    // 冲突列表窗标题
    dialogTitle: '冲突',
    // 冲突列表窗的说明文字
    dialogHint: '检测到合并冲突。请在继续更新前解决它们。',
    // 一键解决所有不需要人工判断的冲突块
    resolveAllSimple: '解决所有简单冲突',
    // 右上角视图选项按钮
    viewOptions: '视图选项',
    // 视图选项：是否显示已解决的文件分组
    showResolved: '显示已解决文件',
    // 未解决分组标题
    unresolved: '未解决',
    // 已解决分组标题
    resolved: '已解决',
    // 分组标题后面的文件数量（单数）
    fileCountOne: '{count} 个文件',
    // 分组标题后面的文件数量（复数）
    fileCountMany: '{count} 个文件',
    // 表头：我方列
    yours: '你的',
    // 表头：对方列
    theirs: '对方',
    // 冲突一侧的状态：新增
    statusAdded: '新增',
    // 冲突一侧的状态：修改
    statusModified: '修改',
    // 冲突一侧的状态：删除
    statusDeleted: '删除',
    // 文件行上的接受按钮
    accept: '接受',
    // 关闭对话框，保留未解决的冲突
    close: '关闭',
    // 全部解决后完成合并
    acceptAndFinish: '接受并完成',
    // 在编辑区打开三栏合并窗口
    resolveManually: '手动解决',
    // 没有冲突时的空态提示
    noConflictsFound: '没有需要解决的合并冲突',
    // 没有可自动解决的简单冲突时的提示
    simpleConflictsNone: '没有可以自动解决的简单冲突',
    // 自动解决完成后的提示
    simpleConflictsResolved: '已自动解决 {count} 个文件',
    // 批量解决里有文件失败时的提示；{count} 是失败个数
    simpleConflictsFailed: '有 {count} 个文件未能自动解决，详情见控制台',
    // 完成合并成功的提示
    finishSucceeded: '合并已完成',
    // 完成合并失败的提示
    finishFailed: '无法完成合并',
    // 三栏左右栏标题：来自某个分支或提交的更改
    changesFrom: '来自 {name} 的更改',
    // 右栏拿不到对方提交号时的兜底名字
    changesFromServer: '服务器',
    // 三栏合并浮动窗口的标题
    mergeRevisions: '合并版本',
    // 三栏中栏标题：结果 + 文件名
    resultTitle: '结果 {name}',
    // 工具条：应用非冲突更改
    applyNonConflicting: '应用非冲突更改：',
    // 工具条：接受左侧内容（当前块）
    acceptLeft: '接受左侧',
    // 工具条：接受右侧内容（当前块）
    acceptRight: '接受右侧',
    // 工具条：全部冲突块取左侧内容
    acceptAllLeft: '全部取左侧',
    // 工具条：全部冲突块取右侧内容
    acceptAllRight: '全部取右侧',
    // 工具条：应用左侧的非冲突更改
    applyLeftChanges: '应用左侧非冲突更改',
    // 工具条：应用右侧的非冲突更改
    applyRightChanges: '应用右侧非冲突更改',
    // 工具条：应用两侧的非冲突更改
    applyBothChanges: '应用两侧非冲突更改',
    // 冲突块 gutter 上的叉：不要这一侧的内容
    ignoreSide: '不使用这一侧',
    // 冲突计数：没有非冲突变更且只剩一个冲突块
    noChangesConflictOne: '无变更，1 个冲突',
    // 冲突计数：没有非冲突变更且有多个冲突块
    noChangesConflictMany: '无变更，{count} 个冲突',
    // 工具条：跳到上一个冲突块
    prevConflict: '上一个冲突',
    // 工具条：跳到下一个冲突块
    nextConflict: '下一个冲突',
    // 工具条：解决简单冲突
    resolveSimple: '解决简单冲突',
    // 工具条：把结果栏恢复成初始内容
    resetResult: '重置结果',
    // 没有冲突块时的摘要
    noConflictBlocks: '没有冲突',
    // 底部：保存并关闭标签
    saveAndClose: '保存并关闭',
    // 底部：保存结果
    applyChanges: '应用更改',
    // 二进制文件不能在三栏窗口里合并
    binaryFile: '二进制文件无法在这里合并',
    // 冲突文件超过三栏合并的规模上限
    tooLargeToMerge: '冲突文件过大，请直接用文本编辑器解决',
    // 读取中的占位
    loading: '正在读取…',
    // 读取冲突文件失败
    readFailed: '无法读取冲突文件',
    // 保存合并结果失败
    saveFailed: '无法保存合并结果',
    // 还有冲突块没处理就想保存时的提示
    unresolvedBeforeSave: '还有 {count} 处冲突没有处理',
    // 状态条：正在合并到的分支
    mergeLabel: '正在合并 {branch}',
    // 状态条：正在把当前分支变基到 {branch}
    rebaseLabel: '正在变基 {branch}',
    // 状态条：正在摘取提交到 {branch}
    cherryPickLabel: '正在摘取至 {branch}',
    // 状态条：接受并完成这次合并
    acceptMerge: '接受合并',
    // 状态条：中止这次合并
    abortMerge: '中止合并',
    // 中止确认框标题
    abortTitle: '中止合并',
    // 中止确认框正文
    abortConfirm: '中止会丢弃已经解决的冲突，回到操作开始前的状态。',
    // 中止确认框的确认按钮
    abortAction: '中止',
    // 中止确认框的取消按钮
    cancelAbort: '取消',
    // 中止成功的提示
    aborted: '已中止合并',
    // 中止失败的提示
    abortFailed: '无法中止合并',
  },
  en: {
    save: 'Save',
    saved: 'Conflicts resolved and saved',
    noConflicts: 'This file has no conflict markers',
    conflictBlock: 'Conflict',
    acceptOurs: 'Ours',
    acceptTheirs: 'Theirs',
    acceptBoth: 'Both',
    menuSave: 'Save Result',
    menuAcceptOurs: 'Accept Ours',
    menuAcceptTheirs: 'Accept Theirs',
    menuSettings: 'Settings…',
    dialogTitle: 'Conflicts',
    dialogHint: 'Merge conflicts detected. Resolve them before continuing update.',
    resolveAllSimple: 'Resolve All Simple Conflicts',
    viewOptions: 'View Options',
    showResolved: 'Show Resolved Files',
    unresolved: 'Unresolved',
    resolved: 'Resolved',
    fileCountOne: '{count} file',
    fileCountMany: '{count} files',
    yours: 'Yours',
    theirs: 'Theirs',
    statusAdded: 'Added',
    statusModified: 'Modified',
    statusDeleted: 'Deleted',
    accept: 'Accept',
    close: 'Close',
    acceptAndFinish: 'Accept and Finish',
    resolveManually: 'Resolve Manually',
    noConflictsFound: 'No merge conflicts to resolve',
    simpleConflictsNone: 'No simple conflicts to resolve automatically',
    simpleConflictsResolved: 'Resolved {count} files automatically',
    // 批量解决里有文件失败时的提示；{count} 是失败个数
    simpleConflictsFailed: '{count} files could not be resolved automatically; see the console for details',
    finishSucceeded: 'Merge completed',
    finishFailed: 'Could not complete the merge',
    changesFrom: 'Changes from {name}',
    changesFromServer: 'server',
    mergeRevisions: 'Merge Revisions',
    resultTitle: 'Result {name}',
    applyNonConflicting: 'Apply non-conflicting changes:',
    acceptLeft: 'Accept Left',
    acceptRight: 'Accept Right',
    acceptAllLeft: 'Accept All Left',
    acceptAllRight: 'Accept All Right',
    applyLeftChanges: 'Apply left non-conflicting changes',
    applyRightChanges: 'Apply right non-conflicting changes',
    applyBothChanges: 'Apply all non-conflicting changes',
    ignoreSide: 'Do not use this side',
    noChangesConflictOne: 'No changes, 1 conflict',
    noChangesConflictMany: 'No changes, {count} conflicts',
    prevConflict: 'Previous conflict',
    nextConflict: 'Next conflict',
    resolveSimple: 'Resolve Simple Conflicts',
    resetResult: 'Reset Result',
    noConflictBlocks: 'No conflicts',
    saveAndClose: 'Save and Close',
    applyChanges: 'Apply Changes',
    binaryFile: 'Binary files cannot be merged here',
    // 冲突文件超过三栏合并的规模上限
    tooLargeToMerge: 'This conflicted file is too large for the merge view; edit it as plain text',
    loading: 'Loading…',
    readFailed: 'Could not read the conflicted file',
    saveFailed: 'Could not save the merge result',
    unresolvedBeforeSave: '{count} conflicts are still unresolved',
    mergeLabel: 'Merging {branch}',
    rebaseLabel: 'Rebasing {branch}',
    cherryPickLabel: 'Cherry-picking {branch}',
    acceptMerge: 'Accept Merge',
    abortMerge: 'Abort Merge',
    abortTitle: 'Abort Merge',
    abortConfirm: 'Aborting discards the conflicts you have already resolved and returns to the state before the operation.',
    abortAction: 'Abort',
    cancelAbort: 'Cancel',
    aborted: 'Merge aborted',
    abortFailed: 'Could not abort the merge',
  },
}
