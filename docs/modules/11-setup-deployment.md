# Setup 与部署模块

[返回模块索引](../MODULES.md)

## 模块定位

负责首次安装与服务部署流程编排，包括环境检测、容器准备、服务注册和最终验证。

## 关键文件

- `setup/index.ts`
- `setup/environment.ts`
- `setup/container.ts`
- `setup/register.ts`
- `setup/mounts.ts`
- `setup/service.ts`
- `setup/verify.ts`

## 主要职责

1. 按 step 执行 setup 子流程。
2. 生成并加载服务配置（launchd/systemd）。
3. 完成飞书群组注册引导。
4. 输出结构化状态供上层技能或脚本消费。

## 输入与输出

- 输入：CLI 参数（`--step`）、宿主机环境。
- 输出：安装状态、服务配置文件、通道配置检查结果。

## 上下游关系

- 上游：无（安装入口）
- 下游：
  - [配置与环境](./10-config-env-logging.md)
  - [通道接入](./02-channels-feishu.md)
  - [容器执行层](./05-container-execution.md)
  - [数据存储层](./08-storage-db.md)

## 改动建议

1. setup 步骤新增时，同时更新 `setup/index.ts` 的 step 注册表。
2. 服务模板改动应覆盖 macOS/Linux 两条链路并补对应测试。
