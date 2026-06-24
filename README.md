# CloudDesk

**当前版本：v0.1.0** · [产品规格](Product.md) · [Cloudflare 部署](docs/deploy.md) · [VPS 自托管](docs/self-host.md)

**开源远程桌面：Cloudflare Worker 或 VPS 自托管 + WebRTC P2P**

Browser 控制端 + Windows 桌面客户端（Agent 被控端）。信令与 API 可部署在 **Cloudflare Workers** 或 **自有 VPS**；桌面画面始终走 **WebRTC 直连**，不经由边缘节点或 VPS 中转视频流。

> **国内用户说明**  
> 部署或使用 Cloudflare 时，部分功能（如绑定支付方式、升级套餐、开通特定服务等）可能需要账户关联 **Visa 或 Mastercard**。若国内银行卡无法完成验证，可参考作者实测的跨境虚拟卡开通方式：[虚拟信用卡实测与开卡指南](https://www.gsvps.com/articles/tutorials-2)。

---

## 功能介绍

CloudDesk 适合个人或小团队，在 Cloudflare 免费套餐内搭建远程桌面控制服务，也可部署到 VPS 作为加速节点。服务端只做 **API + WebSocket 信令 + 文件中转**，桌面画面与键鼠输入走 **WebRTC P2P**。

### 远程控制

- 浏览器控制端：8 位设备 ID 连接、最近连接列表、远程桌面、适应 / 铺满 / 画质 / 全屏
- Windows 桌面客户端：系统浏览器 UI（`127.0.0.1:19527`）+ 系统托盘，集成 Agent 与被控设置
- WebRTC P2P：画面、键鼠、剪贴板端到端直连（默认 DataChannel JPEG，可选 VP8）
- 断线重连：网络不稳定时 30 秒倒计时自动重连，可取消或立即重连
- 远程工具栏连接状态：绿点（已连接）/ 连接中… / 未连接

### 安全与访问

- Ed25519 设备密钥、JWT 控制器令牌
- OTP 一次性密码（可手动刷新）/ 自定义永久密码
- 密码验证通过后自动接受连接
- 设备 ID 不是密码；私钥仅保存在 Agent 本机

### 文件与协作

- 浏览器 ↔ 对象存储 ↔ Agent 文件传输（Cloudflare 用 R2，VPS 用本地目录）
- 支持拖放上传
- 双向剪贴板（可开关）

### 部署方式

- **Cloudflare Workers** — 无服务器，D1 + KV + R2 + Durable Objects
- **VPS 自托管** — Docker 一键启动，适合国内加速或规避 CF 网络波动

---

## 更新说明

### v0.1.0

- Cloudflare Worker + VPS 双后端部署
- 浏览器控制端与 Windows 便携客户端（系统浏览器 UI，无需 WebView2）
- 单页三栏布局：本机 | 设置 | 远程控制
- WebRTC P2P 信令、断线重连、文件传输
- 默认画质超清、OTP 手动刷新、连接测试
- D1 自动建表、控制器令牌校验

---

## 架构

```text
                    ┌─────────────────────────────────────┐
                    │  后端（二选一，原理相同）              │
                    │  • Cloudflare Worker + DO           │
                    │  • VPS apps/server (Node)         │
                    │    API + /ws/device + /ws/session   │
                    └──────────────┬──────────────────────┘
                                   │ HTTPS / WSS
              ┌────────────────────┼────────────────────┐
              ▼                    ▼                    ▼
        Browser 控制端        桌面客户端 UI          Agent 被控端
        (设置 API 地址)      (127.0.0.1:19527)      (server_url)

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

## 技术栈

- [Cloudflare Workers](https://developers.cloudflare.com/workers/) + [Hono](https://hono.dev/)
- [Cloudflare D1](https://developers.cloudflare.com/d1/) + [R2](https://developers.cloudflare.com/r2/) + [KV](https://developers.cloudflare.com/kv/) + [Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [WebRTC](https://webrtc.org/) P2P · [React](https://react.dev/) + [Vite](https://vitejs.dev/) + [TypeScript](https://www.typescriptlang.org/)
- Windows Agent / 桌面客户端：[Go](https://go.dev/) + 系统浏览器

---

## 一键部署到 Cloudflare

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/gsvps/cloud-desk/tree/main)

> 在「Configure resources」步骤确认：**D1** = `clouddesk`，**KV** = `clouddesk`，**R2** = `clouddesk-files`，**Durable Objects** = `DeviceRoom` / `SessionRoom`。**项目名称 / Worker 名称 / `APP_NAME` 默认留空，请按需自行填写**（留空 `APP_NAME` 时界面显示 `CloudDesk`）。

部署完成后访问 Workers 域名，首次打开会引导完成管理员初始化。

详见 [docs/deploy.md](docs/deploy.md)。**不要**与 VPS 混用同一 Agent 配置（设备数据在不同后端）。

### VPS 自托管

```bash
npm run build
docker compose up -d
# 或 npm run dev:server
```

详见 [docs/self-host.md](docs/self-host.md)。生产环境请配置 HTTPS 反代与强随机 `CONTROLLER_JWT_SECRET`。

---

## Windows 桌面客户端

### 直接下载（推荐）

**[下载 clouddesk-client.exe](https://github.com/gsvps/cloud-desk/raw/main/apps/agent/clouddesk-client.exe)**

便携模式，**无需安装向导**。Agent 界面使用系统默认浏览器打开 `http://127.0.0.1:19527`，**不需要 WebView2**。后台 Agent + 系统托盘由 exe 负责。

### 首次运行

1. 双击 `clouddesk-client.exe`（单实例，已在运行时会在托盘恢复窗口）
2. 浏览器自动打开 `http://127.0.0.1:19527`
3. 在中间 **设置** 栏填写 Worker / VPS **API 地址**与**控制器令牌**（自动保存）
4. 左栏 **本机** 打开「允许被控」，复制 8 位设备 ID 或一次性密码供远程连接

> **配置存储**：浏览器 UI 下 API 地址与控制器令牌保存在 `localStorage`（域 `127.0.0.1:19527`）；Agent 其他设置写入 `%USERPROFILE%\.clouddesk\config.json`。  
> **日志**：`%USERPROFILE%\.clouddesk\agent.log`  
> **从网络下载的 exe 若无法运行**：右键 exe → 属性 → 勾选「解除锁定 / Unblock」后重试。

### 自行编译

```powershell
cd apps/agent
powershell -ExecutionPolicy Bypass -File .\build-client.ps1
# 输出: apps/agent/clouddesk-client.exe
```

| 组件 | 说明 |
|------|------|
| 嵌入 UI | `apps/web` 构建产物 |
| 本地 UI | `http://127.0.0.1:19527`（仅本机） |
| 默认画质 | 超清（3840px 宽 JPEG） |
| 断线重连 | 远程页 30 秒倒计时自动重连 |

---

## 桌面客户端界面

单页三栏（桌面客户端嵌入模式）：

| 左栏 · 本机 | 中栏 · 设置 | 右栏 · 远程控制 |
|-------------|-------------|-----------------|
| 允许被控、设备 ID、连接测试 | API 地址、控制器令牌 | 8 位 ID 快速连接 |
| 一次性密码（复制 / 刷新） | 设备名称、默认画质 | 最近连接（ID 去重） |
| 自定义密码 | OTP 空闲刷新、剪贴板、下载目录 | 在线状态、连接 |
| localStorage 信息与清理缓存 | 自动保存 | |

纯浏览器控制端（非 Agent 本地 UI）仅显示 **设置** + **远程控制** 两栏。

---

## 快速开始（本地开发）

```bash
git clone https://github.com/gsvps/cloud-desk.git
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
npm run build
npm run dev:server          # http://127.0.0.1:8787  backend=self_hosted
```

### 方式 C：Agent 本地 UI

```powershell
cd apps/agent
powershell -ExecutionPolicy Bypass -File .\build-client.ps1
.\clouddesk-client.exe
# 浏览器 http://127.0.0.1:19527
```

---

## 后端 / API 配置

控制端与 Agent **必须指向同一 API 地址**。

### 浏览器控制端 / Agent 设置栏

| 模式 | 说明 |
|------|------|
| 本地开发 | 默认 `http://127.0.0.1:8787` |
| Cloudflare Worker | 填写 Worker 域名 |
| VPS 自托管加速 | 填写 VPS HTTPS 地址 |

保存后会调用 `/api/health` 验证；返回 `backend: self_hosted` 表示 VPS 节点。修改 API 地址后 Agent 会自动同步 `server_url` 并重连。

环境变量（可选）：

```powershell
$env:CLOUDDESK_SERVER = "https://your-worker.example.com"
```

---

## Agent 主要设置

| 设置 | 说明 |
|------|------|
| 允许被控 | 开关 Agent 与后端的 WebSocket 连接 |
| 设备名称 | 远程列表中显示的名称 |
| 默认画质 | 流畅 / 标准 / 高清 / **超清**（默认） |
| 一次性密码 | 空闲自动刷新，可手动刷新 |
| 自定义密码 | 长期有效，至少 4 位 |
| 双向剪贴板 | 远程会话文本同步 |
| 下载目录 | Agent 接收文件的本地路径 |

---

## 远程控制端

| 功能 | 说明 |
|------|------|
| 8 位设备 ID 连接 | Agent 注册后左栏显示，支持连接测试 |
| 最近连接 | 按 ID 去重，显示在线 / 离线 |
| 适应 / 铺满 / 画质 / 全屏 | 远程页工具栏 |
| 连接状态 | 绿点 / 连接中… / 未连接 |
| 断线重连 | 30 秒倒计时，可取消或立即重连 |
| 文件传输 / 拖放上传 | R2 或 VPS 本地存储中转 |
| 控制器 JWT | 与 Worker/VPS `CONTROLLER_JWT_SECRET` 一致 |

---

## API 规范

所有接口返回统一 JSON 格式：

```json
{ "success": true, "data": {} }
```

```json
{ "success": false, "error": { "code": "BAD_REQUEST", "message": "..." } }
```

### 主要接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查（含 `backend` 类型） |
| POST | `/api/device/register` | Agent 注册设备 |
| GET | `/api/device/:id` | 查询设备（需控制器 JWT） |
| POST | `/api/session/create` | 创建远程会话 |
| POST | `/api/session/:id/reconnect` | 断线重连 |
| POST | `/api/session/:id/close` | 关闭会话 |
| GET | `/ws/device/:deviceId` | Agent WebSocket 信令 |
| GET | `/ws/session/:sessionId` | 浏览器 WebRTC 信令 |

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
| Windows 便携客户端 | ✅ |
| TURN 中继（P2P 失败兜底） | ⏳ 规划中 |
| macOS / Linux Agent | ⏳ 规划中 |

---

## 环境要求

- **Node.js** ≥ 22
- **Go** ≥ 1.22（编译 Agent / 桌面客户端）
- **Windows 10/11**（Agent / 桌面客户端）
- Cloudflare 账号（仅 CF 部署）
- VPS + Docker（可选，自托管）

---

## 目录结构

```text
CloudDesk/
├── apps/
│   ├── web/           # React 控制端 / 嵌入桌面 UI
│   ├── worker/        # Cloudflare Worker（仅 CF 部署）
│   ├── server/        # VPS 自托管 Node 服务
│   └── agent/         # Go Windows 客户端 + Agent
│       └── clouddesk-client.exe   # 预编译客户端（GitHub 直链下载）
├── packages/
│   ├── protocol/      # WebSocket / DataChannel 消息类型
│   └── shared/        # 共享类型
├── docs/
│   ├── deploy.md      # Cloudflare 部署
│   └── self-host.md   # VPS 自托管
├── wrangler.toml      # Cloudflare 生产部署
├── docker-compose.yml # VPS 一键启动
└── Product.md
```

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

## 作者与交流

- 作者官网：[https://www.gsvps.com](https://www.gsvps.com)
- Telegram 交流群：[https://t.me/gsvpscom](https://t.me/gsvpscom)

有问题欢迎在 GitHub Issues 反馈，或加入 Telegram 群交流部署与使用经验。

---

## License

MIT
