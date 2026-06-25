# GSDesk 开发文档

与 [README.md](README.md) 对齐的当前实现说明（**v0.1.7**）。

---

## 1. 项目定位

GSDesk 是开源远程桌面：**Cloudflare Worker 或 VPS 自托管** 提供 API + WebSocket 信令；**Windows 主客户端** `gsdesk-client.exe`（本地 UI `http://127.0.0.1:19527`）同时承担控制端与被控端。桌面画面经 **WebRTC P2P** 直连，服务端不转发视频流。

此外，Worker / VPS 在可配置路径（默认 `/app/`）托管**轻量 Web 控制端**，供手机或浏览器远程连接；根路径 `/` 仍返回 `success`，用于健康探测。

目标能力：

- 8 位数字设备 ID 连接
- OTP 一次性密码 / 永久密码（连接时自动识别，无需选择类型）
- Ed25519 设备密钥 + JWT 控制器令牌
- 默认自动接受远程连接；关闭后被控端弹窗确认
- 键鼠、剪贴板、文件传输（R2 / 本地存储）
- Cloudflare 免费套餐可部署，也可 Docker 自托管 VPS

---

## 2. 总体架构

```text
         ┌──────────────────────────────────────────┐
         │  后端（二选一）                            │
         │  Cloudflare Worker  或  VPS apps/server   │
         │  GET /           →  success（健康探测）    │
         │  GET /app/       →  手机/浏览器控制 UI     │
         │  /api/*  /ws/*   →  API + 信令             │
         └─────────────────┬────────────────────────┘
                           │ HTTPS / WSS
                           ▼
              gsdesk-client.exe（Windows）
              127.0.0.1:19527  控制 + 被控
                           │
              WebRTC P2P ◄──────────────► 对端 Agent
```

Cloudflare / VPS 负责：

- 设备注册与在线状态
- 会话创建与权限校验（OTP / 永久密码 / 限流）
- SDP / ICE 信令转发
- 文件元数据与存储（R2 或 VPS 本地）
- 审计日志
- 托管 Web 控制端静态资源（路径由 `WEB_APP_PATH` 配置）

**不负责：** 中转桌面视频流；根路径不提供控制 UI。

---

## 3. 技术栈

| 模块 | 技术 |
|------|------|
| 嵌入 UI | React、Vite、TypeScript、Tailwind（编译进 exe） |
| 托管 Web UI | 同上，经 `npm run build:web:app` 按 `WEB_APP_PATH` 构建后部署 |
| Worker | Hono、D1、KV、R2、Durable Objects、Wrangler `[assets]` |
| VPS | Node、Hono、SQLite、`SqliteKv` 持久化、WebSocket 房间 |
| Agent | Go、Pion WebRTC、Gorilla WebSocket、robotgo、screenshot |
| 协议 | `packages/protocol` 共享消息类型 |

已移除 / 未使用：多用户登录 UI、配对码流程、`packages/shared`（遗留）。

---

## 4. 目录结构

```text
GSDesk/
├── apps/
│   ├── web/           # 控制端 UI（嵌入 exe + Worker/VPS 托管）
│   ├── worker/        # Cloudflare Worker API
│   ├── server/        # VPS 自托管 API
│   └── agent/         # Go 客户端（Release 分发 exe）
├── packages/protocol/
├── scripts/           # build-web-app.mjs 等
├── docs/
├── wrangler.toml
└── .github/workflows/ci.yml
```

---

## 5. 配置项

### Worker（`wrangler.toml` → `[vars]`）

| 变量 | 默认 | 说明 |
|------|------|------|
| `WEB_APP_PATH` | `/app` | 手机/浏览器控制入口；修改后须 `build:web:app` 再 deploy |
| `CONTROLLER_JWT_SECRET` | 开发默认 | 控制器 JWT 密钥，生产必换 |
| `CLIENT_LATEST_VERSION` | `0.1.7` | 客户端版本号（更新检查） |
| `CLIENT_DOWNLOAD_URL` | GitHub Releases | exe 下载地址 |

### VPS（`apps/server/.env`）

| 变量 | 默认 | 说明 |
|------|------|------|
| `WEB_APP_PATH` | `/app` | 同 Worker |
| `CONTROLLER_JWT_SECRET` | 开发默认 | 与客户端令牌一致 |
| `SKIP_SIGNATURE_VERIFY` | `false` | 生产建议保持 `false` |
| `PORT` | `8787` | HTTP + WebSocket |
| `GSDESK_DATA` | `./data` | SQLite 与文件 |

`GET /api/health` 返回 `web_app_entry`（如 `/app/`），客户端设置页据此显示手机链接。

---

## 6. 数据库（D1 / SQLite）

核心表：`devices`、`sessions`、`audit_logs`。设备以 8 位数字 ID 标识，绑定 Ed25519 公钥；控制器通过 `CONTROLLER_JWT_SECRET` 签发 JWT，无多用户登录 UI。

字段要点：

- `devices.access_password_hash` — 永久密码（PBKDF2）
- `devices.online` — Agent WebSocket 心跳维护
- `sessions.status` — `pending` / `active` / `closed`

VPS 另用 SQLite 表 `kv_store` 持久化 KV（限流、OTP 等）。

---

## 7. 核心流程

### 7.1 Agent 注册

1. 本地生成 Ed25519 密钥对（私钥仅存本机）
2. `POST /api/device/register` 提交公钥与设备名
3. 返回 `device_id`（8 位）与 `device_token`

注册与 OTP 刷新受 KV 限流保护；公钥格式校验（Ed25519 SPKI）。

### 7.2 保持在线

Agent 连接 `wss://…/ws/device/:id`，发送心跳；Durable Object / VPS 房间维护在线状态。

### 7.3 发起远程连接

1. 客户端 **设置** 配置 API 地址与控制器 JWT
2. **远程控制** 输入 8 位设备 ID；若设备启用了访问保护，输入 OTP 或永久密码（**同一输入框，服务端自动识别**）
3. `POST /api/session/create` → 返回 `session_id`、`signal_url`、`access_type`（`otp` / `permanent`）
4. 控制端与被控端经 WebSocket 交换 WebRTC Offer/Answer/ICE
5. 被控端若关闭「自动接受」，Windows 弹窗确认（`PromptAccept`）；默认 **auto_accept = true**

永久密码连接成功后客户端自动记住；OTP 不保存。

### 7.4 手机 / 浏览器控制

1. 访问 `https://域名{WEB_APP_PATH}/`（默认 `/app/`）
2. 前端以 hosted 模式运行，`BrowserRouter` 使用对应 `basename`
3. 填写 API 地址与 JWT，流程与 exe 控制端相同

### 7.5 媒体与控制

- 默认 DataChannel JPEG 帧（二进制）；可选 VP8 VideoTrack
- DataChannel：鼠标、键盘、剪贴板
- R2 / VPS：会话内文件上传下载

---

## 8. 安全设计

| 项 | 实现 |
|----|------|
| 设备 ID 非密码 | 需 OTP / 永久密码或设备未启用保护 |
| Ed25519 设备签名 | 连接挑战 nonce + 私钥签名 |
| 控制器 JWT | `Authorization: Bearer`，生产环境强随机 secret |
| OTP | CSPRNG 6 位，一次性，可手动刷新 |
| 密码验证 | 6 位先试 OTP，再试永久密码（`verifyDeviceAccessAuto`） |
| 限流 | 注册、OTP/密码失败、会话创建（KV 固定窗口） |
| 验签 | 生产默认 `SKIP_SIGNATURE_VERIFY=false` |
| 自动接受 | 默认开启；关闭后弹窗确认 |
| WebRTC | DTLS；服务端不中转桌面流 |
| 安全入口 | 可通过 `WEB_APP_PATH` 使用非默认路径 |
| 健康检查 | `/api/health` 弱 secret 时返回 `security_warning` |

---

## 9. API 路由（当前）

```text
GET    /                          → success
GET    {WEB_APP_PATH}/            → Web 控制端 SPA
GET    /api/health                → 含 web_app_entry
POST   /api/device/register
GET    /api/device/:id            （需 JWT）
POST   /api/device/:id/otp        （需 JWT）
POST   /api/device/:id/access-password
POST   /api/session/create        （需 JWT，password 自动识别 OTP/永久）
POST   /api/session/:id/close
GET    /ws/device/:deviceId
GET    /ws/session/:sessionId
… 文件传输 /api/…/files …
```

---

## 10. Windows 客户端

- 下载：[GitHub Releases v0.1.7](https://github.com/gsvps/gsdesk/releases/tag/v0.1.7)（`latest` 始终指向最新）
- 三栏 UI：本机 / 设置 / 远程控制
- 配置：`localStorage`（API、JWT）+ `%USERPROFILE%\.gsdesk\config.json`（Agent）
- 编译：`apps/agent/build-client.ps1`（先 `npm run build -w @gsdesk/web`）
- CI：打 tag `v*` 时自动构建并上传 exe

---

## 11. 部署

### Cloudflare

```bash
npm install
npx wrangler login
npm run deploy:cloudflare   # build:web:app + db:migrate + wrangler deploy
```

- 根路径 `success`；`{WEB_APP_PATH}/` 为 Web 控制端
- `CLIENT_DOWNLOAD_URL` 指向 GitHub Releases

### VPS

```bash
docker compose up -d --build
# 或 npm run dev:server
```

修改 `WEB_APP_PATH` 后需在本机构建 Web UI 再启动/部署。

详见 [docs/deploy.md](docs/deploy.md)、[docs/self-host.md](docs/self-host.md)。

---

## 12. 开发与 CI

```bash
npm run dev:worker      # :8787 API
npm run dev:server      # VPS 本地
npm run dev:web         # UI 开发
npm run build:web:app   # 按 WEB_APP_PATH 构建托管 UI
npm run typecheck
npm run test            # worker vitest
```

GitHub Actions（`.github/workflows/ci.yml`）：

- `test`：typecheck + vitest
- `agent`：build web + `build-client.ps1` + `go test`
- `release`：打 tag `v*` 时上传 `gsdesk-client.exe`

---

## 13. MVP 范围与后续

**已实现：** 统一 Windows 客户端、Web 托管控制端、WebRTC 远控、OTP/永久密码自动识别、弹窗确认、文件传输、审计日志、VPS 自托管、开机自启动开关。

**后续可选：** TURN 中继、多显示器、远程声音、macOS/Linux Agent、多用户团队、TOTP。

---

## 14. 注意事项

1. 不要把设备 ID 当密码。
2. 生产环境使用强随机 `CONTROLLER_JWT_SECRET`。
3. 修改 `WEB_APP_PATH` 后必须 `npm run build:web:app` 再 deploy，否则静态资源路径不一致。
4. CF Worker 与 VPS 为独立后端，切换需重新注册设备。
5. 第一版仅 Windows Agent；画质默认「高清」，可按网络调整。
