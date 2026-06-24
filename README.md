# CloudDesk

**开源远程桌面：Cloudflare Worker 或 VPS 自托管 + WebRTC P2P**

Browser 控制端 + Windows Agent 被控端。信令与 API 可部署在 **Cloudflare Workers** 或 **自有 VPS**；桌面画面始终走 **WebRTC 直连**，不经由边缘节点或 VPS 中转视频流。

[English brief](#architecture) · [部署 Cloudflare](docs/deploy.md) · [VPS 自托管](docs/self-host.md) · [产品规格](Product.md)

---

## 特性

- **双部署模式** — Cloudflare（无服务器）或 VPS 自托管（加速 / 规避 CF 网络波动）
- **浏览器控制端** — React + Vite，8 位设备 ID 连接、远程桌面、文件传输
- **Windows 桌面客户端** — 统一 UI（WebView2）+ 系统托盘，集成 Agent 与被控设置
- **WebRTC P2P** — 画面、键鼠、剪贴板端到端直连；服务端只做 API + WebSocket 信令
- **断线重连** — 网络不稳定时 30 秒倒计时自动重连，可取消
- **安全** — Ed25519 设备密钥、JWT 控制器令牌、OTP/永久密码、连接确认、nonce 防重放
- **文件传输** — 浏览器 ↔ 对象存储 ↔ Agent（CF 用 R2，VPS 用本地目录）
- **双路推流** — VP8 VideoTrack（可选 CGO）或 DataChannel JPEG 回退

---

## 架构

```text
                    ┌─────────────────────────────────────┐
                    │  后端（二选一，原理相同）              │
                    │  • Cloudflare Worker + DO           │
                    │  • VPS apps/server (Node)           │
                    │    API + /ws/device + /ws/session   │
                    └──────────────┬──────────────────────┘
                                   │ HTTPS / WSS
              ┌────────────────────┼────────────────────┐
              ▼                    ▼                    ▼
        Browser 控制端        桌面客户端 UI          Agent 被控端
        (设置 API 地址)      (Go 代理 /api)         (server_url)

连接建立后：

Browser / 控制端  ◄════ WebRTC P2P ════►  Agent
                      画面 · 键鼠 · 剪贴板
```

| 层级 | Cloudflare | VPS 自托管 |
|------|------------|------------|
| 入口 | `wrangler.toml` | `apps/server` + Docker |
| 数据库 | D1 | SQLite |
| 缓存/Token | KV | 内存 KV（可扩展 Redis） |
| 文件 | R2 | 本地 `data/files/` |
| 信令 | Durable Objects | Node `ws` 房间 |
| 健康检查 `backend` | `cloudflare` | `self_hosted` |

**共享代码**：HTTP 路由定义在 `apps/worker/src/app.ts`（`createCoreApp`），Worker 与 Server 复用，保证行为一致。

---

## 项目结构

```text
CloudDesk/
├── apps/
│   ├── web/           # React 控制端 / 嵌入桌面 UI
│   ├── worker/        # Cloudflare Worker（仅 CF 部署）
│   ├── server/        # VPS 自托管 Node 服务（与 Worker 隔离）
│   └── agent/         # Go Windows 客户端 + Agent
├── packages/
│   ├── protocol/      # WebSocket / DataChannel 消息类型
│   └── shared/        # 共享类型
├── docs/
│   ├── deploy.md      # Cloudflare 部署
│   └── self-host.md   # VPS 自托管
├── wrangler.toml      # ⚠️ 仅 Cloudflare 生产部署
├── docker-compose.yml # VPS 一键启动
└── Product.md
```

---

## 环境要求

- **Node.js** ≥ 22
- **Go** ≥ 1.22（编译 Agent / 桌面客户端）
- **Windows 10/11**（Agent）
- Cloudflare 账号（仅 CF 部署）
- VPS + Docker（可选，自托管）

---

## 快速开始（本地开发）

```bash
git clone <your-repo-url>
cd CloudDesk
npm install
```

### 方式 A：Cloudflare Worker 本地模拟

```bash
# 终端 1
npm run db:migrate:local -w @clouddesk/worker
npm run dev:worker          # http://127.0.0.1:8787

# 终端 2
npm run dev:web             # http://127.0.0.1:5173
```

### 方式 B：VPS 自托管本地验证

```bash
npm run build               # 构建 Web UI
npm run dev:server          # http://127.0.0.1:8787  backend=self_hosted
```

### Agent / 桌面客户端

```powershell
cd apps/agent
powershell -ExecutionPolicy Bypass -File .\build-client.ps1
.\clouddesk-client.exe
```

首次运行走安装向导；配置写入 `%USERPROFILE%\.clouddesk\config.json` 或安装目录 `data\config.json`。

---

## 后端 / 加速节点配置

控制端与 Agent **必须指向同一 API 地址**。

### 浏览器控制端

**设置 → 后端 / 加速节点**

| 模式 | 说明 |
|------|------|
| 本地开发 | 默认 `http://127.0.0.1:8787` |
| Cloudflare Worker | 填写 Worker 域名 |
| VPS 自托管加速 | 填写 VPS HTTPS 地址（需部署 `apps/server`） |

保存后会调用 `/api/health` 验证；返回 `backend: self_hosted` 表示 VPS 节点。

### Agent / 桌面客户端

**设置 → Agent 服务器（API + 信令）** → `server_url`  
修改后需**重启 Agent** 以重连 WebSocket。

环境变量（可选）：

```powershell
$env:CLOUDDESK_SERVER = "https://your-node.example.com"
```

---

## 部署

### Cloudflare Workers

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/)

```bash
npm run deploy:cloudflare
```

详见 [docs/deploy.md](docs/deploy.md)。**不要**与 VPS 混用同一 Agent 配置（设备数据在不同后端）。

### VPS 自托管

```bash
npm run build
docker compose up -d
# 或 npm run dev:server
```

详见 [docs/self-host.md](docs/self-host.md)。生产环境请配置 HTTPS 反代与强随机 `CONTROLLER_JWT_SECRET`。

---

## 桌面客户端构建

```powershell
cd apps/agent
.\build-client.ps1
# 输出: clouddesk-client.exe
```

| 组件 | 说明 |
|------|------|
| 嵌入 UI | `apps/web` 构建产物 |
| 本地 UI 端口 | 固定 `127.0.0.1:19527` |
| 关闭窗口 | 默认退到托盘（可设置） |
| 远程重连 | 断线 30 秒倒计时自动重连 |

---

## Agent 主要设置

| 设置 | 说明 |
|------|------|
| 服务器地址 | Worker 或 VPS API 根 URL |
| 允许被控 | 开关 Agent 与 Worker/VPS 的连接 |
| 自动接受连接 | 跳过连接确认（慎用） |
| 关闭窗口退到托盘 | 默认开启 |
| 剪贴板 / 画质 / 下载目录 | 见设置页 |

---

## 远程控制端

| 功能 | 说明 |
|------|------|
| 8 位设备 ID 连接 | 无需配对码（Agent 自动注册） |
| 适应 / 铺满 / 画质 / 全屏 | 工具栏 |
| 断线重连 | 30 秒倒计时，可取消或立即重连 |
| 文件传输 / 拖放上传 | R2 或 VPS 本地存储中转 |
| 剪贴板 | 双向文本同步 |
| 控制器 JWT | 与 Worker/VPS `CONTROLLER_JWT_SECRET` 一致 |

---

## 功能状态

| 功能 | 状态 |
|------|------|
| Cloudflare 部署 | ✅ |
| VPS 自托管 (`apps/server`) | ✅ |
| 后端加速设置 UI | ✅ |
| WebRTC P2P + 信令 | ✅ |
| 断线自动重连 UI | ✅ |
| 文件传输 | ✅ |
| TURN 中继（P2P 失败兜底） | ⏳ 规划中 |
| macOS / Linux Agent | ⏳ 规划中 |

---

## 常用命令

```bash
npm run dev:worker       # Cloudflare 本地 Worker
npm run dev:server       # VPS 自托管本地
npm run dev:web          # Web 开发服务器
npm run build            # 构建 Web
npm run deploy:cloudflare
npm run typecheck
```

---

## 安全说明

- 设备 ID 不是密码；私钥仅保存在 Agent 本机
- WebRTC 媒体 DTLS 加密；服务端不转发桌面流
- 生产环境关闭 `SKIP_SIGNATURE_VERIFY`，使用强 JWT 密钥
- CF 与 VPS 是**独立后端**，切换部署需重新注册设备

---

## License

MIT
