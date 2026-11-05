# Agent.md


本文件是 AI 在本仓库中新增、修改功能或重构时的规则。规则只约束本项目的工程行为；
通用编码规范以 `project-coding-standards` skill 为准，两者冲突时以该 skill 为准。

## 一、核心架构规则：功能自包含，壳子零功能

每个 feature 在自己的目录内包含完整实现：契约定义、视图组件、语言包、宿主侧扩展。
壳子（`src/client/shell/`）只负责布局、面板拖拽、状态持久化与装配，不承载任何具体功能。

- 功能实现一律留在 feature 目录；只被单个 feature 使用的代码不得放进 `src/common/` 或 `src/components/`。
- 宿主侧能力集中在 `src/host/services/`（纯能力）与 `src/host/routes/`（HTTP 入口）；`src/host/features.ts`
  只用于挂「需要随插件注册/注销的 feature 级宿主扩展」（当前为空），`src/host/index.ts` 只做装配。
  之所以不按 feature 拆 host.ts：路由共用一条前缀分发与一套工作区边界校验，拆散会让安全逻辑重复。
- `src/client/features/index.ts`、`src/host/features.ts` 是装配清单，只列 feature 导出，不写实现。
- `src/client/shell/` 不感知任何 feature 的 id、文案或业务逻辑。

## 二、feature 契约（与 all-in-one 的关键差异）

all-in-one 的 feature 只有「设置页卡片」一种形态；本插件的功能是**常驻槽位**，
因此契约按「渲染到哪里」分类，定义在 `src/client/shell/contract.ts`：

| slot | 必需字段 | 说明 |
|---|---|---|
| `toolWindow` | `view` | 左侧竖排工具窗口（项目树） |
| `bottomPanel` | `view` | 底部面板（入口图标固定在左侧列下方；终端、运行、搜索、Git）；`hideHeader: true` 时由 feature 自渲染头部（Git 的页签栏） |
| `editorTab` | `editor` | 编辑器区标签类型（`canOpen` + `render`） |
| `statusBar` | `status` | 状态栏条目 |
| `service` | `host` | 无 UI，只注册宿主侧能力 |

共同字段：`id`（唯一，兼作语言 key 前缀）、`slot`、`locales`、`order`、`icon`、`defaultActive`。

feature 与外壳之间的所有交互都走 `IdeServices`（定义在 `contract.ts`、实现在 `shell/services.ts`）：
打开文件、打开差异、弹通知、读写设置、Git 状态、文件变更广播。feature 不 import 外壳实现，
外壳也不认识任何 feature 的 id。

契约校验不通过的定义由 `registry.ts` 跳过并记日志，单个 feature 出错不得影响整页渲染。
新增必需字段时必须同步更新 `isIdeFeature`。

渲染期也要有隔离：工具窗口、编辑器区、底部面板、合并窗口与 Git 页签各自包一层
`shell/panel-error-boundary.tsx`。新增渲染点（新承载面、浮层、页签内容）必须同样包上——
React 在渲染期抛错会卸载到最近的错误边界，没有边界就是整块 IDE 消失且没有恢复入口。

## 三、承载面

工作台有四个承载面，**共用同一个 `Workbench` 组件**，不写多套布局：

| 形态 | 注册方式 |
|---|---|
| A 主区视图 | `slots.register({ name: 'conversation.view', id: 'dsh-ide', order: 30 })` |
| B 右侧栏页签 | `sidebarRightTabs.register({ id: 'dsh-ide', kind: 'ide' })` + `slots.register({ name: 'sidebar.right.pane.tab', key: 'dsh-ide' })` |
| C 右侧栏浮窗 | 宿主原生的浮出操作，插件无需额外注册 |
| D 对话页弹窗 | `src/client/shell/ide-popup`：入口按钮注册到侧边栏底部的 `sidebar.footer.action`（纯图标，跟随当前会话，缺会话或工作目录时置灰）；`conversation.composer.dock` 与 `conversation.input.left` 只注册不渲染界面的会话跟踪，用来记住当前会话；弹窗注册到 `shell.overlay` |

布局由容器实测宽度决定（宽度主导，高度不否决）。**禁止**改用 `shell.overlay` 模态弹窗
或独立 Electron 窗口承载工作台，**唯一例外**是形态 D：用户明确要求 IDE 以「固定尺寸、
不可拖动缩放」的弹窗出现在对话页，宿主浮窗无法禁用拖拽，只能由插件自绘覆盖层实现。
新增同类入口前必须先确认需求，不得自行扩大该例外。

### 跨承载面状态共享

同一工作空间（同一 cwd）的多个对话、多个承载面共用一份状态，按 `scopeKey` 收进模块级
单例池：标签与布局由 `editor-session-store.ts`、`use-workbench-layout.ts` 管理，文档正文、
脏标记、磁盘版本、保存互斥与滚动位置由 `editor-document-store.ts` 管理。`scopeKey` 在设置里
「共享 IDE」打开时等于工作空间键（`ws:<cwd>`，会话未绑定目录时退回 `session:<id>`），关闭时
带实例后缀（各面独立）；持久化键同样是工作空间键，同一项目只留一份打开的文件与布局。

对话页弹窗在切换对话时自动收起，只关不清理：工作台实例与打开的文件、布局都留在原处，
点入口按钮重新打开仍是关闭前那一份。每个工作空间各记一条「打开时渲染的会话」，因此打开
过多个项目后回到其中任何一个都能恢复；同一时刻只保活当前一个实例，换项目打开时旧实例
随之卸载，标签与布局在重新挂载时从工作空间状态池恢复。

新增「一处改动、多面可见」的状态时必须进池，禁止放在组件内部 state——否则会出现
一处显示「已修改」、另一处显示「已保存」，或者两面并发写盘被乐观锁判成冲突。

## 四、目录结构

```
src/
├── host/                     宿主半（Node 侧）
│   ├── index.ts              入口：聚合 feature host、注册路由、卸载时结束运行实例
│   ├── features.ts           装配清单：featureHosts
│   ├── routes/
│   │   ├── index.ts          前缀路由分发、信任校验、信封格式
│   │   ├── ping.ts           GET /dsh-ide/api/ping
│   │   ├── fs.ts             文件列举 / 读写 / CRUD / 搜索
│   │   ├── git.ts            git 分发入口（方法表来自 git-read / git-write）
│   │   ├── git-read.ts       只读 git 方法（状态、差异、历史、分支）
│   │   ├── git-write.ts      写 git 方法（暂存、分支、合并、变基、远程）
│   │   ├── git-parse.ts      git 文本输出的解析工具
│   │   ├── run.ts            运行配置与进程
│   │   ├── settings.ts       设置读取与保存
│   │   └── asset.ts          懒加载 chunk 下发
│   └── services/
│       ├── workspace.ts      工作区根解析与越界校验
│       ├── fs-service.ts     目录列举、原子写、CRUD、二进制探测
│       ├── search-service.ts 递归遍历与文件名/内容搜索
│       ├── git-service.ts    git 执行、仓库串行队列、错误映射
│       ├── run-service.ts    进程登记、输出环形缓冲、终止阶梯
│       └── settings-service.ts  设置与运行配置的落盘
├── client/                   客户端半（浏览器侧）
│   ├── index.tsx             入口：注册三形态、语言包、终端 Remote
│   ├── lazy/                 懒加载内核（CodeMirror / xterm）与运行时加载器
│   ├── shell/                外壳：契约、注册表、布局、四区组件、服务总线
│   ├── features/             各功能，每个目录自包含
│   └── styles/input.css      Tailwind 入口
├── common/                   跨层纯逻辑（cn、locale、http-route/body、api、terminal-remote、split-handle、output-window）
└── types/                    宿主 API 与资源模块的类型声明
```

依赖方向严格单向：`types ← common ← features ← shell ← client/index`。
feature 不得反向依赖 shell 的具体实现，只能依赖 `contract.ts` 与公共层。

## 五、宿主接口约定

- 所有插件路由挂在 `/dsh-ide/api` 前缀下，统一信封 `{ ok, value }` / `{ ok, error: { code, message } }`。
- 每条路由先过 `isTrustedRequest`：只接受回环地址、非跨站、且 Origin 与 Host 同源。
- 错误码用英文大写 key，展示文案由客户端按 locale 翻译。
- 写操作必须校验路径位于会话工作区内；命令一律用 `argv` 数组，不经 shell 拼接。

## 六、样式与语言包

- 颜色只用 `tailwind.config.ts` 中映射到宿主 `--dsw-alias-*` 令牌的类名，不写字面色值。
- 不注入全局样式；样式随插件生命周期注入与移除（`client/index.tsx` 的 `effect`）。
- feature 文案写在各自目录的 locales 里，key 不含前缀；外壳注册时统一加 `<id>.` 前缀。
- 界面文案跟随宿主当前语言：字典按 `zh`、`en` 原样注册，不把语言槽统一指向英文；新增 feature 必须同时补齐 `zh` 与 `en` 两套 key。
- IDE 工作台文案由「IDE 语言」偏好决定（跟随 DSH / 中文 / English），统一经 `shell/ide-translate.ts` 的
  `useWorkbenchTranslate` 取字典；宿主设置页里的 IDE 分区仍走宿主翻译函数，始终跟随 DSH。
- 样式在构建期由 Tailwind 生成，页面跟随宿主自动切换明暗主题。

## 七、性能约束

- `apply()` 及其同步分支内禁止扫描目录、读大文件、解析缓存；重活推迟到用户打开对应视图或发请求时。
- 所有定时器与订阅必须在 `ctx.effect` 的清理函数里撤销。
- 目录监听按需挂载、及时回收，事件合并后再广播。
- 编辑器、终端、diff 渲染器等重依赖必须拆成懒加载 chunk，不进主 bundle。
- 用户可写的正则只在宿主侧执行，且必须带累计时间预算（见 `search-service` 的 200ms 上限）：
  宿主与全部会话共用事件循环，一次不可中断的回溯会让整个应用卡死。
- 主线程上的差异对齐、语法高亮、逐行正则都必须有「总量」上限，而不只是单次上限——
  按次数/字符记账的预算挡不住「每项都刚好在阈值内」的累积开销。

## 八、命名与代码规范

- 组件/页面文件 PascalCase，目录与工具文件 kebab-case。
- 变量/函数 camelCase，类型/接口 PascalCase，常量 UPPER_SNAKE_CASE。
- 注释解释「为什么」，功能变更同步更新注释；i18n key 所在元素上方必须注释业务含义。
- 每个 `try` 必须有 `catch` 并输出日志，禁止空 catch。
- 修改文件前评估有效代码行：组件软阈值 400 / 硬阈值 600，公共工具 150 / 250。
- 死代码零残留：任务结束前清除未使用的变量、函数、导入与注释掉的旧代码。

## 九、构建与验证

- `npm run typecheck` 执行 `tsc --noEmit`（strict）；`npm run build` 先类型检查再产出 `index.js` 与 `client.js`。
- `index.js`、`client.js`、`chunks/`、`.build/` 是产物，禁止手改；改 `src/` 或构建脚本后必须重新构建。
- `chunks/editor-kernel.js` 与 `chunks/terminal-kernel.js` 是懒加载内核，由宿主侧 `asset.ts` 按固定 URL 下发；
  主 bundle 不含 CodeMirror 与 xterm。
- React 由宿主模块表提供，不随插件打包；新增运行时依赖前先确认宿主是否已提供。
- 任何代码改动完成后：先构建通过，再按项目约定确认验证方式，最后提交。

## 十、文档同步

- `README.md` 面向使用者，只介绍插件是什么、有哪些功能、怎么用。
- 本文件面向开发者，记录架构约定、目录结构、构建方式。
