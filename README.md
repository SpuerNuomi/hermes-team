# Hermes Team

Hermes Team 是一个基于 Tauri 的桌面 Agent 工作台。项目目标是保留 Hermes
Agent 的真实运行能力，并提供更轻量的本地桌面体验。

当前优先级是单 Agent 桌面工作流：聊天、流式输出、思考与执行过程、工具调用、
Profile、Provider/Model、MCP、Skills、Memory、附件、Context folder、会话历史、
日志和远程连接。

## 当前能力

- 本地 Hermes 安装检测：发现 Hermes CLI、Hermes Home、active profile、版本和运行状态。
- Gateway 管理：探测、启动、停止、日志路径展示、API Server key 生成。
- Chat runtime：通过真实 Hermes Gateway 调用 Agent，不提供 mock 回复。
- 流式输出：Gateway 到 Tauri 使用 SSE，Tauri 到 React 使用 Tauri event，保持用户可见的增量输出。
- 思考与执行过程：展示 reasoning、tool progress、read file、search files、skill view、terminal command、duration 等过程信息。
- 会话历史：保存 Hermes Team 本地会话快照，支持恢复、搜索、重命名、删除，并导入 active profile 的 `state.db` 历史。
- Profile：读取、创建、切换、删除 Hermes profile，并显示模型、Provider、Gateway、SOUL、Skills 状态。
- Models / Providers：管理模型条目、激活模型、Provider API key、credential pool、provider registry 诊断、模型发现和辅助模型配置。
- Toolsets / MCP：读取和写入 CLI toolsets，管理 MCP servers，支持 MCP test、catalog browse/install。
- Skills：展示 installed/bundled skills，支持搜索、安装、删除和 `SKILL.md` 详情预览。
- Memory：读取和编辑 profile 下的 `MEMORY.md` / `USER.md`，展示条目、字符限制和 `state.db` 统计。
- Settings：Config Health、Appearance、Network、Gateway、Messaging、Schedules、Logs、Backup/diagnostics 等迁移中。
- 附件和文件预览：本地文件选择、文本/图片预览、打开系统应用、复制内容/路径、把预览文件加入当前消息附件。
- Context folder：为会话绑定工作目录，注入运行上下文，并在侧边栏/会话中恢复。
- 远程连接：支持 local、remote URL、SSH tunnel 连接模式。
- Web preview：支持 `/browse <url>` 打开右侧网页预览。
- 输入体验：支持忙碌队列、停止任务、重新生成、分支、复制和朗读。

## 产品边界

- 单 Agent 桌面体验优先。
- 多 Agent / Kanban / Office 类能力后续作为独立上层能力接入，不作为默认聊天入口。
- 不使用“产品研发协作室”作为默认会话概念。
- 不用 mock 代替真实 Gateway、配置、会话、工具或模型行为。
- 设计文档和代码分开维护。

## 项目结构

```text
src/                    React renderer
src/renderer/            Chat、Settings、FileViewer、Markdown 渲染等 UI
src/runtime/             Hermes runtime bridge 和 Tauri invoke 包装
src/core/                本地 orchestration/state 模型
src-tauri/               Tauri Rust host、Gateway/文件/配置/会话命令
tests/                   前端核心逻辑测试
../hermes-team-design/   产品设计、迁移矩阵、实施计划
```

## 本地运行

安装依赖：

```bash
npm install
```

浏览器预览只能查看 UI，不能调用本机 Hermes：

```bash
npm run dev
```

真实 Agent/Gateway 必须运行 Tauri 桌面应用：

```bash
npm run tauri:dev
```

如果工作台提示缺少 `API_SERVER_KEY`，可以在 Hermes Runtime 面板点击“生成 API key”，再点击“启动 Gateway”。

## 验证命令

前端测试和构建：

```bash
npm test
npm run build
```

Rust/Tauri 检查：

```bash
cd src-tauri
cargo test
cargo check
```

打包桌面版本：

```bash
npm run tauri:build
```

打包产物：

```text
src-tauri/target/release/bundle/macos/Hermes Team.app
```

## 文档

设计和迁移文档位于同级目录：

```text
../hermes-team-design
```

主要文档：

- `desktop-capability-migration.md`：桌面能力迁移矩阵。
- `implementation-plan.md`：阶段实施计划。
- `product-architecture.md`：产品与架构设计。

## 参考来源

- Hermes Agent：https://github.com/NousResearch/hermes-agent
- 上游桌面基线：https://github.com/fathah/hermes-desktop
