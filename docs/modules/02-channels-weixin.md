# 通道接入（微信）

微信通道负责与微信服务器建立连接、接收消息、发送消息。

## 核心文件

- `src/channels/weixin.ts`

## 主要职责

1. **连接管理**：通过长轮询方式连接微信 API
2. **消息接收**：轮询获取新消息并转换为统一格式
3. **消息发送**：将文本消息发送到微信用户
4. **上下文令牌管理**：维护每个用户的 context_token 用于消息关联

## 关键实现

### WeixinChannel 类

实现 `Channel` 接口：
- `connect()` - 启动长轮询
- `sendMessage(jid, text)` - 发送消息
- `disconnect()` - 停止轮询
- `ownsJid(jid)` - 判断 JID 是否属于微信（前缀 `wx:`）

### 消息流

**入站**：
1. 长轮询 `/bot/getupdates` 获取新消息
2. 提取 `context_token` 并缓存
3. 调用 `onChatMetadata` 更新会话元数据
4. 调用 `onMessage` 传递消息给主编排器

**出站**：
1. 从缓存获取 `context_token`
2. 构造消息体（包含 text_item）
3. POST 到 `/bot/sendmessage`

## 配置

环境变量（`.env`）：
- `WEIXIN_BASE_URL` - 微信 API 地址
- `WEIXIN_TOKEN` - Bot 认证令牌

## 依赖模块

- [主编排器](./01-startup-orchestrator.md) - 接收入站消息
- [路由格式化](./03-routing-formatting.md) - 消息格式转换
