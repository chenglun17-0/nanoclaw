# Skills Engine 模块

[返回模块索引](../MODULES.md)

## 模块定位

管理 NanoClaw 技能化改造流程：应用、回放、升级、冲突处理、状态持久化。

## 关键文件

- `skills-engine/index.ts`
- `skills-engine/apply.ts`
- `skills-engine/replay.ts`
- `skills-engine/update.ts`
- `skills-engine/rebase.ts`
- `skills-engine/state.ts`
- `skills-engine/manifest.ts`

## 主要职责

1. 解析技能 manifest 与依赖约束。
2. 应用文件操作并记录可回滚状态。
3. 在 core 更新时进行冲突预览与合并。
4. 管理 `.nanoclaw` 下的状态、锁和备份。

## 输入与输出

- 输入：技能目录、目标代码树、当前状态文件。
- 输出：应用结果、冲突报告、回滚点、更新结果。

## 上下游关系

- 上游：开发/定制命令入口（非主运行时）
- 下游：
  - [Setup 与部署](./11-setup-deployment.md)（技能可影响 setup 行为）
  - [容器执行层](./05-container-execution.md)（技能可修改运行策略）

## 改动建议

1. 修改状态结构时必须同步迁移与测试快照。
2. 合并策略变更先验证 `__tests__` 中更新/回放/冲突用例。
