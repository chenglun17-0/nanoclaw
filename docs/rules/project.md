# NanoClaw 项目规则

## 1. 文档目标与作用范围

本文件定义 NanoClaw 的项目级约束，覆盖架构边界、安全边界、数据边界、变更流程与验收要求。  
模块实现细节以 `docs/modules/*.md` 和 `src/*.ts` 为准，本文件用于统一“必须遵守”的规则。

## 2. 架构基线（不可破坏）

| 规则项 | 约束内容 | 代码依据 |
|---|---|---|
| 单主进程编排 | 系统主流程由 `src/index.ts` 统一编排，禁止引入额外常驻编排进程造成状态分裂。 | `src/index.ts` |
| 单通道基线（飞书） | 当前主通道为飞书，入站事件与出站发送必须通过 `FeishuChannel` 进入统一 `Channel` 抽象。 | `src/index.ts`, `src/channels/feishu.ts`, `src/types.ts` |
| 容器隔离执行 | Agent 必须通过容器执行，业务代码不得绕过 `runContainerAgent` 直接在宿主执行 agent 逻辑。 | `src/container-runner.ts`, `src/task-scheduler.ts` |
| 组级隔离 | 以 group folder 作为会话、IPC、工作目录隔离边界；主组存在“项目根目录只读可见”例外，业务写操作仍应限定在组目录与授权挂载。 | `src/group-folder.ts`, `src/container-runner.ts`, `src/ipc.ts` |
| 文件 IPC 控制面 | 容器与主进程控制信令通过 `data/ipc/<group>/` 命名空间传递，来源目录即身份。 | `src/ipc.ts` |
| 统一消息格式化出口 | 入站格式化由 `src/router.ts` 统一处理；出站清理优先复用 `router` 能力，主循环中的内联清理仅视为兼容兜底。 | `src/router.ts`, `src/index.ts` |

## 3. 数据与状态规则

| 规则项 | 约束内容 | 代码依据 |
|---|---|---|
| SQLite 单一事实源 | 消息、聊天、任务、路由游标、注册组、会话均落在 `store/messages.db`，禁止并行引入第二套持久化状态。 | `src/db.ts` |
| 兼容迁移 | 任何 schema 变更必须保留向后兼容迁移逻辑，不允许破坏旧库启动。 | `src/db.ts#createSchema` |
| 组目录合法性 | `registered_groups.folder` 必须通过 `isValidGroupFolder` 校验，禁止路径穿越和保留名。 | `src/group-folder.ts`, `src/db.ts` |
| 游标一致性 | `last_timestamp` 与 `last_agent_timestamp` 由主编排集中管理，发生容器错误时按回滚策略处理，禁止并发写乱序。 | `src/index.ts` |

## 4. 安全规则（强约束）

| 规则项 | 强制要求 | 代码依据 |
|---|---|---|
| 额外挂载白名单 | `additionalMounts` 仅允许在外部 allowlist (`~/.config/nanoclaw/mount-allowlist.json`) 校验通过后挂载。 | `src/mount-security.ts` |
| 默认阻断敏感路径 | `.ssh`、`.env`、`credentials` 等敏感模式必须保持阻断；放宽前必须先做威胁评估。 | `src/mount-security.ts` |
| 非主组写权限收敛 | allowlist 配置 `nonMainReadOnly=true` 时，非主组写挂载请求必须被强制降级为只读。 | `src/mount-security.ts` |
| secrets 最小暴露 | 主进程不把 `.env` 全量注入子进程；仅允许白名单 keys 进入容器 settings。 | `src/env.ts`, `src/config.ts`, `src/container-runner.ts` |
| IPC 权限边界 | 非主组不得操作其他组任务或跨组发消息；主组保留注册组与全局刷新权限，且当前实现允许主组向任意 `chatJid` 发送 IPC 消息。 | `src/ipc.ts` |

## 5. 业务行为规则

| 规则项 | 约束内容 | 代码依据 |
|---|---|---|
| 触发策略 | 非主组默认需要触发词（`requiresTrigger !== false`），主组可直接对话。 | `src/index.ts`, `src/types.ts` |
| 任务调度类型 | 业务约定使用 `cron` / `interval` / `once`；当前实现仅对这三类做分支校验，调用侧必须避免传入未知类型。 | `src/ipc.ts`, `src/task-scheduler.ts` |
| 上下文模式 | `context_mode` 仅允许 `group` / `isolated`，默认 `isolated`。 | `src/ipc.ts`, `src/db.ts`, `src/task-scheduler.ts` |
| 并发控制 | 全局容器并发由 `MAX_CONCURRENT_CONTAINERS` 控制，组内消息串行由队列保证。 | `src/config.ts`, `src/group-queue.ts` |

## 6. 代码与文档一致性规则

1. 改动 `src/config.ts`、`src/types.ts`、`src/ipc.ts`、`src/task-scheduler.ts`、`src/mount-security.ts` 时，必须同步检查并更新：
   - `docs/rules/project.md`
   - `docs/rules/业务规则配置规范.md`
2. 模块边界变化时，必须同步更新 `docs/modules/*.md` 与 `docs/MODULES.md`。
3. 若当前实现与规则冲突，以代码行为为准先修正文档；若文档代表目标行为，则必须补测试后再改代码对齐。

## 7. 变更验收基线

1. 至少通过 `npm run test`（或受影响模块的最小测试集）并确认无新增失败。
2. 核查关键日志路径：`logs/` 与 `groups/*/logs/`，确保无新增高频错误。
3. 安全相关变更（挂载、IPC 授权、secrets 注入）必须附带回滚方案。

## 8. ⚠️ 严禁事项

- 严禁在业务代码中读取或打印 `.env` 全量内容。
- 严禁绕过 `isValidGroupFolder` 直接拼接组目录路径。
- 严禁新增“跨组默认可写”或“非主组跨组控制”能力。
- 严禁未更新规则文档即合并影响核心边界的改动。
