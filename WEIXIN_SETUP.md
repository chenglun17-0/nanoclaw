# 微信频道设置指南

## 1. 登录微信获取 Token

运行登录脚本：

```bash
npm run weixin:login
```

扫描二维码完成登录，token 会自动显示。

## 2. 配置 NanoClaw

将 token 添加到 `.env` 文件：

```bash
WEIXIN_TOKEN=你的token
WEIXIN_BASE_URL=https://api.weixin.qq.com
```

## 3. 启动服务

```bash
npm run dev
```

## 4. 注册主频道

在微信中给 bot 发送消息：
```
@Andy register main
```

完成！现在可以开始使用 NanoClaw 了。
