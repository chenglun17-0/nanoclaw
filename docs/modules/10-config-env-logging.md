# 配置、环境与日志模块

[返回模块索引](../MODULES.md)

## 模块定位

集中管理运行配置读取、环境变量解析、日志输出和代理参数解析工具。

## 关键文件

- `src/config.ts`
- `src/env.ts`
- `src/logger.ts`
- `src/proxy-agent.ts`

## 主要职责

1. 从 `process.env` 与 `.env` 读取配置（按模块需要选择）。
2. 定义全局常量（超时、并发、路径、时区、触发词等）。
3. 提供统一日志输出实例。
4. 提供代理 URL 读取与安全脱敏工具函数。

## 输入与输出

- 输入：系统环境变量与 `.env`。
- 输出：类型化配置值、日志实例、代理 agent 对象。

## 上下游关系

- 上游：无（基础设施层）
- 下游：
  - [启动与主编排](./01-startup-orchestrator.md)
  - [通道接入](./02-channels-whatsapp.md)
  - [容器执行层](./05-container-execution.md)
  - [Setup 与部署](./11-setup-deployment.md)

## 改动建议

1. 配置项新增时，优先明确作用域（主进程/容器内/通道侧）。
2. 涉及认证变量改动时，同步更新 setup 校验与文档说明。
