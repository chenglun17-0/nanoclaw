# 启动与主编排模块

[返回模块索引](../MODULES.md)

## 模块定位

主进程入口与总编排模块，负责把通道、队列、容器执行、调度和 IPC 连接成一条完整链路。

## 关键文件

- `src/index.ts`

## 主要职责

1. 初始化数据库与运行态（已注册群组、session、游标状态）。
2. 启动通道连接（当前为 WhatsApp）。
3. 拉起消息轮询循环并将消息提交到队列。
4. 拉起 IPC watcher 与任务调度循环。
5. 维护主流程级错误恢复与状态保存。

## 输入与输出

- 输入：通道入站消息、IPC 任务请求、调度器触发事件。
- 输出：调用容器执行、发送通道回复、更新 DB 状态。

## 上下游关系

- 上游：无（系统入口）。
- 下游：
  - [通道接入](./02-channels-whatsapp.md)
  - [路由与格式化](./03-routing-formatting.md)
  - [组队列与并发控制](./04-group-queue-concurrency.md)
  - [容器执行层](./05-container-execution.md)
  - [IPC 控制面](./06-ipc-control-plane.md)
  - [任务调度](./07-task-scheduler.md)
  - [数据存储层](./08-storage-db.md)
  - [配置与环境](./10-config-env-logging.md)

## 改动建议

1. 优先保持此模块“薄编排”原则，不把平台细节/SQL 细节塞进主循环。
2. 涉及消息时序改动时，必须联动检查队列模块和调度模块。
