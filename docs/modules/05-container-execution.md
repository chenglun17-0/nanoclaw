# 容器执行层模块

[返回模块索引](../MODULES.md)

## 模块定位

负责把“某个 group 的一次 Agent 执行”落地为实际容器运行，包括挂载、安全边界、输入输出桥接。

## 关键文件

- `src/container-runner.ts`
- `src/container-runtime.ts`

## 主要职责

1. 生成容器挂载与运行参数。
2. 写入 group 级 `settings.json`（用户级运行配置）。
3. 启动容器并通过 stdin 传入请求。
4. 解析流式输出标记并回调上游。
5. 清理容器并处理超时/截断日志策略。

## 输入与输出

- 输入：`ContainerInput`、组配置、挂载策略。
- 输出：`ContainerOutput` 流、容器生命周期事件。

## 上下游关系

- 上游：
  - [启动与主编排](./01-startup-orchestrator.md)
  - [组队列与并发控制](./04-group-queue-concurrency.md)
  - [任务调度](./07-task-scheduler.md)
- 下游：
  - [安全与挂载校验](./09-security-mounts.md)
  - [容器内 Agent Runner](./13-agent-runner.md)
  - [配置与环境](./10-config-env-logging.md)

## 改动建议

1. 任何挂载策略改动都应同步复核 `mount-security` 规则。
2. 认证/中转变量调整时，需同步检查容器内 runner 的脱敏名单。
