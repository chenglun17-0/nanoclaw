# NanoClaw 功能模块地图

本文件是模块索引页。每个模块的详细说明已拆分到 `docs/modules/` 目录。

## 模块索引

| 模块 | 说明 | 详细文档 |
|---|---|---|
| 启动与主编排 | 主进程生命周期、消息循环、全局状态协同 | [01-startup-orchestrator.md](modules/01-startup-orchestrator.md) |
| 通道接入（飞书） | 通道连接、收发消息、会话状态 | [02-channels-feishu.md](modules/02-channels-feishu.md) |
| 路由与格式化 | 入站消息结构化、出站文本清理与路由 | [03-routing-formatting.md](modules/03-routing-formatting.md) |
| 组队列与并发控制 | group 内串行、跨 group 限流、任务/消息排队 | [04-group-queue-concurrency.md](modules/04-group-queue-concurrency.md) |
| 容器执行层 | 容器启动、挂载构造、输出流处理 | [05-container-execution.md](modules/05-container-execution.md) |
| IPC 控制面 | 文件 IPC 消息与任务控制、鉴权边界 | [06-ipc-control-plane.md](modules/06-ipc-control-plane.md) |
| 任务调度 | 到期任务轮询、任务执行、结果落库 | [07-task-scheduler.md](modules/07-task-scheduler.md) |
| 数据存储层 | SQLite schema、迁移兼容、读写接口 | [08-storage-db.md](modules/08-storage-db.md) |
| 安全与挂载校验 | 额外挂载 allowlist 与路径安全校验 | [09-security-mounts.md](modules/09-security-mounts.md) |
| 配置与环境 | `.env` 读取、运行参数、代理、日志 | [10-config-env-logging.md](modules/10-config-env-logging.md) |
| Setup 与部署 | setup 各步骤与服务管理配置 | [11-setup-deployment.md](modules/11-setup-deployment.md) |
| Skills Engine | 技能应用、回放、升级、冲突检测 | [12-skills-engine.md](modules/12-skills-engine.md) |
| 容器内 Agent Runner | 容器内 SDK 查询循环与 Hook 链路 | [13-agent-runner.md](modules/13-agent-runner.md) |

## 核心调用链（跨模块）

1. 主编排加载状态并拉起通道、IPC、调度器：见 [01-startup-orchestrator.md](modules/01-startup-orchestrator.md)
2. 通道接收消息写入 DB：见 [02-channels-feishu.md](modules/02-channels-feishu.md)
3. 主循环取消息并进入队列：见 [04-group-queue-concurrency.md](modules/04-group-queue-concurrency.md)
4. 队列触发容器执行并流式回传：见 [05-container-execution.md](modules/05-container-execution.md)
5. 容器内 runner 调用 SDK：见 [13-agent-runner.md](modules/13-agent-runner.md)
6. 结果经路由发回通道，任务控制经 IPC/调度闭环：见 [03-routing-formatting.md](modules/03-routing-formatting.md)、[06-ipc-control-plane.md](modules/06-ipc-control-plane.md)、[07-task-scheduler.md](modules/07-task-scheduler.md)

## 维护约定

1. 任何涉及模块边界变更的代码提交，都应同步更新对应 `docs/modules/*.md` 文件。
2. 若新增一级模块，先在本索引新增条目，再新增对应模块文档。
3. 文档内容以职责边界、输入输出、依赖关系为主，避免粘贴实现细节代码。
