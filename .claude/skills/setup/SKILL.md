---
name: setup
description: Run initial NanoClaw setup for Weixin channel. Use when user wants to install dependencies, configure Weixin credentials, register main chat, or start background services.
---

# NanoClaw Setup (Weixin)

Run setup steps automatically. Only pause when user action is required (container choice, Weixin login, selecting main chat).

- Bootstrap: `bash setup.sh`
- Setup steps: `npx tsx setup/index.ts --step <name>`
- Logs: `logs/setup.log`

Use `AskUserQuestion` for all user-facing questions.

## 1. Bootstrap (Node.js + Dependencies)

Run `bash setup.sh` and parse status.

- If `NODE_OK=false`: install Node.js 20+ (prefer Node 22), then rerun.
- If `DEPS_OK=false`: inspect `logs/setup.log`, reinstall deps.
- If `NATIVE_OK=false`: install build tools then rerun.
- Record `PLATFORM` and `IS_WSL`.

## 2. Check Environment

Run `npx tsx setup/index.ts --step environment`.

Read fields:
- `APPLE_CONTAINER`, `DOCKER`
- `HAS_CHANNEL_CONFIG` (Weixin token exists)
- `HAS_REGISTERED_GROUPS` (main chat already registered)

## 3. Container Runtime

Choose runtime using environment output:
- Linux: Docker only
- macOS: Docker (default) or Apple Container (if installed)

Then run:
```bash
npx tsx setup/index.ts --step container -- --runtime <docker|apple-container>
```

If build/test fails, inspect `logs/setup.log`, fix runtime, retry.

## 4. Claude Credentials

NanoClaw expects `ANTHROPIC_AUTH_TOKEN` in `.env`.

If missing, ask user for permission and set it in `.env` (do not print token in chat).

Optional advanced fields:
- `ANTHROPIC_BASE_URL`
- `ANTHROPIC_MODEL`

## 5. Weixin Login (Automated)

If `HAS_CHANNEL_CONFIG=false`, run login script:

```bash
npm run weixin:login
```

User scans QR code, token is automatically saved to `.env`.

## 6. Register Main Chat

Setup register step needs a JID in format: `wx:<user_id>`.

Ask user for:
- main chat `user_id` (Weixin user ID, ends with @im.wechat)
- assistant trigger word (default `@Andy`)

Then register:
```bash
npx tsx setup/index.ts --step register -- \
  --jid "wx:<user_id>" \
  --name "main" \
  --trigger "@Andy" \
  --folder "main" \
  --no-trigger-required
```

If user uses custom assistant name, append:
```bash
--assistant-name "<Name>"
```

## 7. Mount Allowlist

Ask whether agents need external directory access.

- No:
```bash
npx tsx setup/index.ts --step mounts -- --empty
```
- Yes: build allowlist JSON and apply with `--json`.

## 8. Start Service

Run:
```bash
npx tsx setup/index.ts --step service
```

If already running, stop old service first:
- macOS: `launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist`
- Linux: `systemctl --user stop nanoclaw` (or `systemctl stop nanoclaw` as root)

## 9. Verify

Run:
```bash
npx tsx setup/index.ts --step verify
```

If failed, fix by status field:
- `SERVICE`: rerun service step
- `CREDENTIALS=missing`: set `ANTHROPIC_AUTH_TOKEN`
- `WEIXIN_CONFIG=missing`: rerun `npm run weixin:login`
- `REGISTERED_GROUPS=0`: rerun register step
- `MOUNT_ALLOWLIST=missing`: run mounts step

## 10. Smoke Test

Tell user to send message in Weixin to the bot.

Watch logs:
```bash
tail -f logs/nanoclaw.log
```

## Troubleshooting

- Service not starting: check `logs/nanoclaw.error.log`
- No response in chat:
  - confirm JID is `wx:<user_id>`
  - confirm chat is in `registered_groups`
  - confirm trigger config for non-main chats
- Weixin token error:
  - verify `.env` has non-empty `WEIXIN_TOKEN`
  - rerun `npm run weixin:login` if needed
  - restart service after changes

- Unload service:
  - macOS: `launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist`
  - Linux: `systemctl --user stop nanoclaw`
