# 容器内 Agent Runner 模块

[返回模块索引](../MODULES.md)

## 模块定位

容器内执行入口，承载 Claude Agent SDK 查询循环、Hook 注入、IPC follow-up 消息消费与结果输出协议。

## 关键文件

- `container/agent-runner/src/index.ts`
- `container/agent-runner/src/ipc-mcp-stdio.ts`

## 主要职责

1. 读取容器输入并启动 SDK 查询流。
2. 通过 `OUTPUT_START/END` 标记回传结果。
3. 在查询期间轮询 IPC follow-up 消息并推送到会话。
4. 注入 Hook（如 `PreToolUse`）做 Bash 输入清理。
5. 挂接 MCP stdio server，实现容器内任务/消息工具调用。

## 输入与输出

- 输入：容器 stdin 初始请求、IPC follow-up 消息文件。
- 输出：标准输出流式结果标记、标准错误运行日志。

## 上下游关系

- 上游： [容器执行层](./05-container-execution.md)
- 下游：
  - [IPC 控制面](./06-ipc-control-plane.md)
  - [数据存储层](./08-storage-db.md)（经 IPC 工具间接作用）

## 改动建议

1. 输出协议变更必须同步 `src/container-runner.ts` 的解析逻辑。
2. Hook 变量名单与外层注入变量名单应保持一致，避免泄漏或误删。
