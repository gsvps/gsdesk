# CloudDesk

**当前版本：v0.1.0** · [产品规格](Product.md) · [Cloudflare 部署](docs/deploy.md) · [VPS 自托管](docs/self-host.md)

**开源远程桌面：Cloudflare Worker 或 VPS 自托管 + WebRTC P2P**

Worker / VPS 仅提供 **API + WebSocket 信令**；控制与被控统一使用 Windows 客户端 `clouddesk-client.exe`（本地 UI `http://127.0.0.1:19527`）。桌面画面始终走 **WebRTC 直连**，不经由边缘节点或 VPS 中转视频流。

> **国内用户说明**  
> 部署或使用 Cloudflare 时，部分功能（如绑定支付方式、升级套餐、开通特定服务等）可能需要账户关联 **Visa 或 Mastercard**。若国内银行卡无法完成验证，可参考作者实测的跨境虚拟卡开通方式：[虚拟信用卡实测与开卡指南](https://www.gsvps.com/articles/tutorials-2)。

---

## 功能介绍

CloudDesk 适合个人或小团队，在 Cloudflare 免费套餐内搭建远程桌面控制服务，也可部署到 VPS 作为加速节点。

### 远程控制

- **统一客户端**：控制端与被控端均通过 `clouddesk-client.exe` 完成（本机 UI + 远程桌面）
- WebRTC P2P：画面、键鼠、剪贴板端到端直连（默认 DataChannel JPEG，可选 VP8）
- 8 位设备 ID 连接、最近连接列表、适应 / 铺满 / 画质 / 全屏
- 断线重连：30 秒倒计时自动重连；工具栏显示绿点 / 连接中… / 未连接

### 安全与访问

- Ed25519 设备密钥、JWT 控制器令牌
- OTP 一次性密码（可手动刷新）/ 自定义永久密码
- 可选「自动接受远程连接」；关闭时被控端弹窗确认

### 部署方式

- **Cloudflare Workers** — D1 + KV + R2 + Durable Objects，根路径返回 `success`
- **VPS 自托管** — Docker 一键启动，同样仅 API，不托管 Web UI

---

## 架构

```text
                    ┌─────────────────────────────────────┐
                    │  后端（二选一，API only）             │
                    │  • Cloudflare Worker + DO           │
                    │  • VPS apps/server (Node)         │
                    │  GET /  →  success                │
                    │  /api/* /ws/*                     │
                    └──────────────┬──────────────────────┘
                                   │ HTTPS / WSS
                                   ▼
                    clouddesk-client.exe（Windows）
                    127.0.0.1:19527  控制 + 被控 UI
                                   │
                    远程会话 WebRTC P2P ◄────────► 对端 Agent
```

| 层级 | Cloudflare | VPS 自托管 |
|------|------------|------------|
| 入口 | `wrangler.toml` | `apps/server` + Docker |
| 浏览器访问域名 | 纯文本 `success` | 纯文本 `success` |
| 数据库 | D1 | SQLite |
| 信令 | Durable Objects | Node `ws` 房间 |

---

## 一键部署到 Cloudflare

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/gsvps/cloud-desk/tree/main)

部署完成后：

1. 浏览器访问 Worker 域名应看到 **`success`**（表示 API 服务正常，非控制界面）
2. 下载并运行 [clouddesk-client.exe](https://github.com/gsvps/cloud-desk/releases/latest/download/clouddesk-client.exe)
3. 在客户端 **设置** 栏填入 Worker 地址与 `CONTROLLER_JWT_SECRET`

```bash
npm install
npx wrangler login
npm run deploy:cloudflare   # 仅部署 Worker，无需构建 Web 前端
```

详见 [docs/deploy.md](docs/deploy.md)。

### VPS 自托管

```bash
docker compose up -d --build
# 或 npm run dev:server
```

详见 [docs/self-host.md](docs/self-host.md)。

---

## Windows 客户端（控制 + 被控）

**[下载 clouddesk-client.exe](https://github.com/gsvps/cloud-desk/releases/latest/download/clouddesk-client.exe)**

便携模式，无需安装。双击后浏览器打开 `http://127.0.0.1:19527`，三栏布局：

| 左栏 · 本机 | 中栏 · 设置 | 右栏 · 远程控制 |
|-------------|-------------|-----------------|
| 允许被控、设备 ID、连接测试 | Worker/VPS API 地址、控制器令牌 | 8 位 ID 连接、最近列表 |
| 一次性密码、自定义密码 | 设备名、画质、剪贴板、下载目录 | 远程桌面入口 |

### 首次使用

1. 部署 Worker 或 VPS，确认访问域名返回 `success`
2. 运行 `clouddesk-client.exe`
3. **设置** → 填写 API 地址与控制器令牌（与 Worker `CONTROLLER_JWT_SECRET` 一致）
4. **本机** → 开启「允许被控」；**远程控制** → 输入对方 8 位 ID 连接

配置：API/令牌存 `localStorage`（`127.0.0.1:19527`）；Agent 设置存 `%USERPROFILE%\.clouddesk\config.json`。

### 自行编译

```powershell
cd apps/agent
powershell -ExecutionPolicy Bypass -File .\build-client.ps1
```

---

## 本地开发

```bash
git clone https://github.com/gsvps/cloud-desk.git
cd CloudDesk
npm install
```

| 终端 | 命令 | 说明 |
|------|------|------|
| 1 | `npm run db:migrate:local -w @clouddesk/worker` + `npm run dev:worker` | API @ `:8787`，`/` 返回 `success` |
| 2 | `.\apps\agent\clouddesk-client.exe` | 客户端 UI；设置 API 为 `http://127.0.0.1:8787` |

开发 UI 时可选：`npm run dev:web`（Vite，用于改 `apps/web` 后重新 `build-client.ps1`）。

VPS 本地：`npm run dev:server` → 同样 `:8787` API only。

---

## 环境变量（Agent 可选）

```powershell
$env:CLOUDDESK_SERVER = "https://your-worker.example.com"
```

---

## 主要 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | `success`（非 UI） |
| GET | `/api/health` | 健康检查 |
| POST | `/api/device/register` | Agent 注册 |
| GET | `/api/device/:id` | 查询设备（需 JWT） |
| POST | `/api/session/create` | 创建远程会话 |
| GET | `/ws/device/:id` | Agent 信令 |
| GET | `/ws/session/:id` | 控制端信令 |

---

## 常用命令

```bash
npm run dev:worker       # Worker 本地 API
npm run dev:server       # VPS 本地 API
npm run dev:web          # 仅 UI 开发（嵌入客户端前需 build-client.ps1）
npm run build            # 构建 apps/web（编译 exe 时用）
npm run deploy:cloudflare
npm run typecheck
npm run test
```

---

## 目录结构

```text
CloudDesk/
├── apps/
│   ├── web/           # 嵌入 clouddesk-client.exe 的 UI（不部署到 Worker）
│   ├── worker/        # Cloudflare Worker API
│   ├── server/        # VPS 自托管 API
│   └── agent/         # Go 客户端 + clouddesk-client.exe
├── packages/protocol/
├── docs/
└── wrangler.toml
```

---

## 安全说明

- 设备 ID 不是密码；私钥仅保存在 Agent 本机
- WebRTC 媒体 DTLS 加密；服务端不转发桌面流
- 生产环境使用强随机 `CONTROLLER_JWT_SECRET`
- CF 与 VPS 为独立后端，切换需重新注册设备

---

## 作者与交流

- 作者官网：[https://www.gsvps.com](https://www.gsvps.com)
- Telegram：[https://t.me/gsvpscom](https://t.me/gsvpscom)

---

## License

MIT
