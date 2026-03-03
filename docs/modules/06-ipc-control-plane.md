# IPC 控制面模块

[返回模块索引](../MODULES.md)

## 模块定位

通过文件系统 IPC 在主进程与容器工具层之间传递控制命令，并承担关键鉴权逻辑。

## 关键文件

- `src/ipc.ts`
- `container/agent-runner/src/ipc-mcp-stdio.ts`

## 主要职责

1. 扫描并消费 `data/ipc/<group>/messages|tasks` 的 JSON 请求。
2. 基于“来源目录即身份”执行 group 级授权判断。
3. 处理任务控制命令（创建/暂停/恢复/取消等）。
4. 处理跨组消息发送限制（main 与非 main 不同权限）。

## 输入与输出

- 输入：IPC 请求文件。
- 输出：DB 变更、消息发送调用、错误文件迁移。

## 上下游关系

- 上游：
  - [启动与主编排](./01-startup-orchestrator.md)
  - [容器内 Agent Runner](./13-agent-runner.md)
- 下游：
  - [任务调度](./07-task-scheduler.md)
  - [数据存储层](./08-storage-db.md)
  - [组队列与并发控制](./04-group-queue-concurrency.md)

## 改动建议

1. IPC 协议字段扩展时必须保持向后兼容或显式版本化。
2. 鉴权判断不要分散到调用方，统一在 IPC 入口层处理。
