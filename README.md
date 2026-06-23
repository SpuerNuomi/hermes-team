# Hermes Team

Hermes Team 是一个基于 Tauri 的 Hermes Desktop 能力迁移项目。

当前阶段优先完整迁移 Hermes Desktop 的单 Agent 桌面体验：安装检测、Gateway、Profile、Provider/Model、MCP、Toolsets、Skills、Memory、会话、附件、Context folder、文件预览和真实流式调用。

## 核心方向

- 先迁移 Hermes Desktop 单 Agent 能力。
- 不使用 mock 代替 Hermes Gateway、配置、会话或工具能力。
- 不把多 Agent 编排作为默认入口或默认会话体验。
- 代码与设计文档分离维护。
- Hermes 负责能力运行。

## 当前代码范围

- Hermes 安装检测
- Hermes Profile / Gateway / API key 状态检测
- Gateway 启动、停止、刷新
- Models / Provider 当前配置与模型库管理
- Provider API key / credential pool 基础管理
- 远程模型发现 / provider 健康诊断
- Toolsets / MCP servers / Memory 基础编辑能力
- Skills 安装 / 删除 / 搜索管理
- Session 历史快照
- 本地附件路径上下文
- Context folder 与 Worktree 目录浏览
- 文件预览、图片预览、从文件预览加入附件
- 运行生命周期事件与任务终止
- Token 级流式输出
- Local / Remote URL / SSH Tunnel 连接配置

## 文档

设计和迁移文档已从代码目录拆出，位于同级目录：

```text
../hermes-team-design
```

## 本地运行

浏览器预览只能看 UI，不能调用本机 Hermes。要使用真实 Agent/Gateway，请运行：

```bash
npm install
npm run tauri:dev
```

如果工作台提示缺少 `API_SERVER_KEY`，可以在 Hermes Runtime 面板点击“生成 API key”，再点击“启动 Gateway”。

当前实现不提供 mock Agent 输出：浏览器预览只能查看界面，真实 Agent 调用必须在 Tauri 桌面应用中通过 Hermes Gateway 完成。
