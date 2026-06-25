# GSDesk — 利用Cloudflare Workers + KV + D1 + R2自建免费开源远程桌面

**v0.1.7** · [产品规格](https://www.gsvps.com/articles/news-19) · [Cloudflare 部署](https://www.gsvps.com/articles/news-20) · [VPS 自托管](https://www.gsvps.com/articles/news-21)

GSDesk 是一款**开源远程桌面**方案：用 **Cloudflare Workers**（免费套餐可用）或 **VPS 自托管** 提供 API 与 WebSocket 信令；桌面画面经 **WebRTC P2P 直连**，服务端不中转视频流。

- **Windows 主客户端**：`gsdesk-client.exe`，本地 UI `http://127.0.0.1:19527`，控制端与被控端合一
- **手机 / 浏览器**：通过可配置的安全入口（默认 `https://你的域名/app/`）打开控制界面
- **根路径 `/`**：仅返回 `success`，表示 API 正常，**不是**控制页面

> **国内用户说明**  
> 使用 Cloudflare 时，部分操作（绑定支付方式、升级套餐等）可能需要 **Visa / Mastercard**。若国内银行卡无法验证，可参考：[虚拟信用卡实测与开卡指南](https://www.gsvps.com/articles/tutorials-2)。

---

## 快速开始

| 步骤 | 操作 |
|------|------|
| 1 | 部署 [Cloudflare Worker](#部署到-cloudflare) 或 [VPS](#vps-自托管) |
| 2 | 下载 [gsdesk-client.exe](https://github.com/gsvps/gsdesk/releases/latest/download/gsdesk-client.exe) 并运行 |
| 3 | 客户端 **设置** → 填写 API 地址与 `CONTROLLER_JWT_SECRET` → **本机** 开启「允许被控」→ **远程控制** 输入 8 位设备 ID |

连接密码支持**一次性密码（OTP）**或**永久密码**，输入后系统自动识别；永久密码连接成功后会记住，OTP 不会保存。

---

## 功能概览

### 远程控制

- 统一 Windows 客户端：控制端 + 被控端，无需分别安装
- WebRTC P2P：键鼠、剪贴板、桌面画面端到端直连（默认 JPEG，可选 VP8）
- 8 位设备 ID、最近连接、适应 / 铺满 / 画质 / 全屏、断线 30 秒自动重连

### 安全与访问

- Ed25519 设备密钥 + JWT 控制器令牌
- OTP 可手动刷新；永久密码自定义
- 默认**自动接受**远程连接；关闭后被控端弹窗确认
- 连接限流与签名校验（生产环境请更换强随机密钥）

### 部署方式

| 方式 | 说明 |
|------|------|
| **Cloudflare Workers** | D1 + KV + R2 + Durable Objects，一键 Deploy 按钮 |
| **VPS 自托管** | Docker 或 `npm run dev:server`，SQLite 持久化 |
| **手机浏览器入口** | `WEB_APP_PATH` 配置（默认 `/app`），见 [配置说明](#配置说明) |

---

## 架构一览

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
              （画面不经 Worker / VPS 中转）
```

| 层级 | Cloudflare | VPS 自托管 |
|------|------------|------------|
| 配置文件 | 根目录 `wrangler.toml` | `apps/server` + `.env` |
| 数据库 | D1 | SQLite |
| 信令 | Durable Objects | Node WebSocket 房间 |
| 文件存储 | R2 | 本地 / 可扩展 |

---

## 部署到 Cloudflare

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/)

部署完成后验证：

1. 访问 `https://你的域名/` → 看到 **`success`**
2. 访问 `https://你的域名/app/` → 打开手机 / 浏览器控制界面（路径可在 `wrangler.toml` 修改）
3. 在客户端 **设置** 填入 Worker 地址与 `CONTROLLER_JWT_SECRET`

```bash
git clone https://github.com/gsvps/gsdesk.git
cd GSDesk
npm install
npx wrangler login
npm run deploy:cloudflare   # 构建 Web 入口 + 数据库迁移 + 部署 Worker
```

详见 [Cloudflare Worker部署](https://www.gsvps.com/articles/news-20)。

### VPS 自托管

```bash
docker compose up -d --build
# 或本地开发：npm run dev:server
```

详见 [VPS 自托管](https://www.gsvps.com/articles/news-21)。

---

## Windows 客户端

**[下载 gsdesk-client.exe（最新 Release）](https://github.com/gsvps/gsdesk/releases/latest/download/gsdesk-client.exe)**

便携免安装。启动后浏览器打开 `http://127.0.0.1:19527`：

| 左栏 · 本机 | 中栏 · 设置 | 右栏 · 远程控制 |
|-------------|-------------|-----------------|
| 允许被控、设备 ID、连接测试 | API 地址、控制器令牌、画质与剪贴板 | 输入 8 位 ID、最近连接、进入远程桌面 |
| 一次性 / 永久密码 | 设备名、下载目录、手机入口链接 | 远程会话与文件传输 |

**配置存放位置**

- API / 令牌：`localStorage`（`127.0.0.1:19527` 页面）
- Agent 设置：`%USERPROFILE%\.gsdesk\config.json`

**自行编译**

```powershell
cd apps/agent
powershell -ExecutionPolicy Bypass -File .\build-client.ps1
```

---

## 手机 / 浏览器控制

Worker 与 VPS 均托管一份**轻量 Web 控制端**，入口路径由环境变量 **`WEB_APP_PATH`** 决定（默认 `/app`）。

| 场景 | 地址示例 |
|------|----------|
| 健康探测 | `https://你的域名/` → `success` |
| 手机控制 | `https://你的域名/app/` |
| 健康检查 API | `GET /api/health` → 含 `web_app_entry` 字段 |

客户端 **设置** 页会在连接成功后显示完整手机链接，无需手拼路径。

**修改入口路径时**（例如改为 `/desk`）：

1. 编辑 `wrangler.toml` 的 `[vars] WEB_APP_PATH`，或 VPS 的 `.env`
2. 执行 `npm run build:web:app`（同步 Vite `base` 路径）
3. 重新 `npm run deploy:cloudflare` 或重启 VPS

---

## 配置说明

### Worker（`wrangler.toml` → `[vars]`）

| 变量 | 说明 |
|------|------|
| `WEB_APP_PATH` | 手机 / 浏览器控制入口，默认 `/app` |
| `CONTROLLER_JWT_SECRET` | 控制器 JWT 密钥，**生产环境务必更换** |
| `CLIENT_DOWNLOAD_URL` | 客户端 exe 下载地址 |
| `CLIENT_LATEST_VERSION` | 客户端版本号（可选展示） |

### VPS（`apps/server/.env`）

```env
WEB_APP_PATH=/app
CONTROLLER_JWT_SECRET=请更换为强随机字符串
```

### Agent 可选环境变量

```powershell
$env:GSDESK_SERVER = "https://your-worker.example.com"
```

---

## 本地开发

```bash
git clone https://github.com/gsvps/gsdesk.git
cd GSDesk
npm install
```

| 终端 | 命令 | 说明 |
|------|------|------|
| 1 | `npm run db:migrate:local -w @gsdesk/worker` | 本地 D1 迁移 |
| 1 | `npm run dev:worker` | API @ `http://127.0.0.1:8787` |
| 2 | `.\apps\agent\gsdesk-client.exe` | 客户端；设置 API 为 `http://127.0.0.1:8787` |

改 UI 时：`npm run dev:web`（Vite）；嵌入 exe 前需重新 `build-client.ps1`。

---

## 常用命令

```bash
npm run dev:worker        # Worker 本地 API
npm run dev:server        # VPS 本地 API
npm run dev:web           # 前端开发
npm run build:web:app     # 按 WEB_APP_PATH 构建托管用 Web UI
npm run deploy:cloudflare # 构建 + 迁移 + 部署
npm run typecheck
npm run test
```

---

## 主要 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | `success`（非 UI） |
| GET | `/api/health` | 健康检查，含 `web_app_entry` |
| POST | `/api/device/register` | Agent 注册 |
| GET | `/api/device/:id` | 查询设备（需 JWT） |
| POST | `/api/session/create` | 创建远程会话 |
| GET | `/ws/device/:id` | Agent 信令 |
| GET | `/ws/session/:id` | 控制端信令 |

---

## 目录结构

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
└── wrangler.toml
```

---

## 安全说明

- 设备 ID 不是密码；Ed25519 私钥仅保存在 Agent 本机
- WebRTC 媒体经 DTLS 加密；服务端不转发桌面流
- 生产环境使用强随机 `CONTROLLER_JWT_SECRET`
- Cloudflare 与 VPS 为**独立后端**，切换后需重新注册设备
- 可通过修改 `WEB_APP_PATH` 使用非默认入口，降低被扫描常见路径的概率

---

## 作者与交流

- 官网：[https://www.gsvps.com](https://www.gsvps.com)
- Telegram：[https://t.me/gsvpscom](https://t.me/gsvpscom)
- GitHub：[https://github.com/gsvps/gsdesk](https://github.com/gsvps/gsdesk)

---

## License

MIT
