# CloudDesk 开发文档

与 [README.md](README.md) 对齐的当前实现说明（v0.1.0）。

---

## 1. 项目定位

CloudDesk 是开源远程桌面：**Cloudflare Worker 或 VPS 自托管** 提供 API + WebSocket 信令；**控制端与被控端统一使用 Windows 客户端** `clouddesk-client.exe`（本地 UI `http://127.0.0.1:19527`）。桌面画面经 **WebRTC P2P** 直连，服务端不转发视频流。

目标能力：

- 8 位数字设备 ID 连接
- OTP 一次性密码 / 自定义永久密码
- Ed25519 设备密钥 + JWT 控制器令牌
- 可选自动接受或弹窗确认远程连接
- 键鼠、剪贴板、文件传输（R2）
- Cloudflare 免费套餐可部署，也可 Docker 自托管 VPS

---

## 2. 总体架构

```text
                    ┌─────────────────────────────────────┐
                    │  后端（二选一，API only）             │
                    │  • Cloudflare Worker + DO + D1      │
                    │  • VPS apps/server (Node + SQLite)  │
                    │  GET /  →  success                  │
                    │  /api/*  /ws/*                      │
                    └──────────────┬──────────────────────┘
                                   │ HTTPS / WSS
                                   ▼
                    clouddesk-client.exe（Windows）
                    127.0.0.1:19527  控制 + 被控 UI
                                   │
                    远程会话 WebRTC P2P ◄────────► 对端 Agent
```

Cloudflare / VPS 只负责：

- 设备注册与在线状态
- 会话创建与权限校验（OTP / 永久密码 / 限流）
- SDP / ICE 信令转发
- 文件元数据与 R2 存储
- 审计日志

不托管 Web UI；浏览器访问 Worker 域名仅见 `success`。

---

## 3. 技术栈

| 模块 | 技术 |
|------|------|
| 嵌入 UI | React、Vite、TypeScript、Tailwind（编译进 exe，不部署到 Worker） |
| Worker | Hono、D1、KV、R2、Durable Objects、Wrangler |
| VPS | Node、Hono、SQLite（KV 持久化 `SqliteKv`）、WebSocket 房间 |
| Agent | Go、Pion WebRTC、Gorilla WebSocket、robotgo、screenshot |
| 协议 | `packages/protocol` 共享消息类型 |

已移除 / 未使用：`packages/shared`（遗留，可删）、浏览器独立控制端、用户登录配对码流程。

---

## 4. 目录结构

```text
CloudDesk/
├── apps/
│   ├── web/           # 嵌入 clouddesk-client.exe 的 UI
│   ├── worker/        # Cloudflare Worker API
│   ├── server/        # VPS 自托管 API
│   └── agent/         # Go 客户端（clouddesk-client.exe 由 Release 分发）
├── packages/protocol/
├── docs/
├── wrangler.toml
└── .github/workflows/ci.yml
```

---

## 5. 数据库（D1 / SQLite）

核心表：`devices`、`sessions`、`audit_logs`。设备以 8 位数字 ID 标识，绑定 Ed25519 公钥；控制器通过 `CONTROLLER_JWT_SECRET` 签发 JWT，无多用户登录 UI。

字段要点：

- `devices.access_password_hash` — 永久密码（PBKDF2）
- `devices.online` — Agent WebSocket 心跳维护
- `sessions.status` — `pending` / `active` / `closed`

---

## 6. 核心流程

### 6.1 Agent 注册

1. 本地生成 Ed25519 密钥对（私钥仅存本机）
2. `POST /api/device/register` 提交公钥与设备名
3. 返回 `device_id`（8 位）与 `device_token`

注册与 OTP 刷新受 KV 限流保护；公钥格式校验（Ed25519 SPKI）。

### 6.2 保持在线

Agent 连接 `wss://…/ws/device/:id`，发送心跳；Durable Object / VPS 房间维护在线状态。

### 6.3 发起远程连接

1. 客户端 **设置** 栏配置 API 地址与控制器 JWT
2. **远程控制** 输入 8 位设备 ID；若设备启用了访问保护，需 OTP 或永久密码
3. `POST /api/session/create` → 返回 `session_id` 与 `signal_url`
4. 控制端与被控端经 WebSocket 交换 WebRTC Offer/Answer/ICE
5. 被控端若关闭「自动接受」，Windows 弹窗确认（`PromptAccept`）

### 6.4 媒体与控制

- 默认 DataChannel JPEG 帧（二进制，非 base64）；可选 VP8 VideoTrack
- DataChannel：鼠标、键盘、剪贴板
- R2：会话内文件上传下载

---

## 7. 安全设计

| 项 | 实现 |
|----|------|
| 设备 ID 非密码 | 需 OTP / 永久密码或设备未启用保护 |
| Ed25519 设备签名 | 连接挑战 nonce + 私钥签名 |
| 控制器 JWT | `Authorization: Bearer`，生产环境强随机 secret |
| OTP | CSPRNG 6 位，一次性，可手动刷新 |
| 限流 | 注册、OTP/密码失败、会话创建（KV 固定窗口） |
| 验签 | 生产默认 `SKIP_SIGNATURE_VERIFY=false` |
| 自动接受 | 默认开启；关闭后弹窗确认 |
| WebRTC | DTLS；服务端不中转桌面流 |
| 健康检查 | `/api/health` 弱 secret 时返回 `security_warning` |

---

## 8. API 路由（当前）

```text
GET    /                          → success
GET    /api/health
POST   /api/device/register
GET    /api/device/:id            （需 JWT）
POST   /api/device/:id/otp        （需 JWT）
POST   /api/device/:id/access-password
POST   /api/session/create        （需 JWT）
POST   /api/session/:id/close
GET    /ws/device/:deviceId
GET    /ws/session/:sessionId
… 文件传输 /api/…/files …
```

已移除：`/api/auth/login`、配对码 `pairing_token`、Worker 托管静态 Web UI。

---

## 9. Windows 客户端

- 下载：[GitHub Releases](https://github.com/gsvps/cloud-desk/releases/latest/download/clouddesk-client.exe)（不再提交 exe 到 git）
- 三栏 UI：本机 / 设置 / 远程控制
- 配置：`localStorage`（API、JWT）+ `%USERPROFILE%\.clouddesk\config.json`（Agent）
- 编译：`apps/agent/build-client.ps1`（先 `npm run build -w @clouddesk/web`）

---

## 10. 部署

### Cloudflare

```bash
npm install
npx wrangler login
npm run deploy:cloudflare
```

根路径返回 `success`；`CLIENT_DOWNLOAD_URL` 指向 GitHub Releases。

### VPS

```bash
docker compose up -d --build
```

KV 使用 SQLite 表 `kv_store` 持久化；同样 API only。

详见 [docs/deploy.md](docs/deploy.md)、[docs/self-host.md](docs/self-host.md)。

---

## 11. 开发与 CI

```bash
npm run dev:worker      # :8787 API
npm run dev:server      # VPS 本地
npm run dev:web         # UI 开发
npm run typecheck
npm run test            # worker vitest（crypto、device-access、rate-limit）
```

GitHub Actions（`.github/workflows/ci.yml`）：

- `test`：typecheck + vitest
- `agent`：build web + `build-client.ps1` + `go test`
- `release`：打 tag `v*` 时上传 `clouddesk-client.exe`

---

## 12. MVP 范围与后续

**已实现：** 统一客户端、WebRTC 远控、OTP/永久密码、弹窗确认、文件传输、审计日志、VPS 自托管。

**后续可选：** TURN 中继、多显示器、远程声音、macOS/Linux Agent、多用户团队、TOTP。

---

## 13. 注意事项

1. 不要把设备 ID 当密码。
2. 生产环境使用强随机 `CONTROLLER_JWT_SECRET`。
3. 关闭自动接受时，被控端必须有人确认弹窗。
4. CF Worker 与 VPS 为独立后端，切换需重新注册设备。
5. 第一版仅 Windows Agent；画质优先跑通链路，再优化编码与延迟。
