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

- 浏览器控制端：8 位设备 ID 连接、远程桌面、适应 / 铺满 / 画质 / 全屏
- Windows 桌面客户端：统一 UI（WebView2）+ 系统托盘，集成 Agent 与被控设置
- WebRTC P2P：画面、键鼠、剪贴板端到端直连
- 断线重连：网络不稳定时 30 秒倒计时自动重连，可取消或立即重连

### 安全与访问

- Ed25519 设备密钥、JWT 控制器令牌
- OTP 一次性密码 / 永久密码、连接确认、nonce 防重放
- 设备 ID 不是密码；私钥仅保存在 Agent 本机

### 文件与协作

- 浏览器 ↔ 对象存储 ↔ Agent 文件传输（Cloudflare 用 R2，VPS 用本地目录）
- 支持拖放上传

### 部署方式

- **Cloudflare Workers** — 无服务器，D1 + KV + R2 + Durable Objects
- **VPS 自托管** — Docker 一键启动，适合国内加速或规避 CF 网络波动
- 双路推流：VP8 VideoTrack（可选 CGO）或 DataChannel JPEG 回退

---

## 更新说明

### v0.1.0

- Cloudflare Worker + VPS 双后端部署
- 浏览器控制端与 Windows 桌面客户端（WebView2 + 托盘）
- WebRTC P2P 信令、断线重连、文件传输
- 首次运行自动安装 WebView2、安装向导与 GitHub 直链下载客户端
- D1 自动建表、控制器令牌校验、OTP 生成优化

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

## 技术栈

- [Cloudflare Workers](https://developers.cloudflare.com/workers/) + [Hono](https://hono.dev/)
- [Cloudflare D1](https://developers.cloudflare.com/d1/) + [R2](https://developers.cloudflare.com/r2/) + [KV](https://developers.cloudflare.com/kv/) + [Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [WebRTC](https://webrtc.org/) P2P · [React](https://react.dev/) + [Vite](https://vitejs.dev/) + [TypeScript](https://www.typescriptlang.org/)
- Windows Agent / 桌面客户端：[Go](https://go.dev/) + WebView2

---

## 一键部署到 Cloudflare

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/gsvps/cloud-desk/tree/main)

> 在「Configure resources」步骤确认：**D1** = `clouddesk`，**KV** = `clouddesk`，**R2** = `clouddesk-files`，**Durable Objects** = `DeviceRoom` / `SessionRoom`。**项目名称 / Worker 名称 / `APP_NAME` 默认留空，请按需自行填写**（留空 `APP_NAME` 时界面显示 `CloudDesk`）。

> **若提示「已存在具有该名称的存储库」**  
> 一键部署会在你的 GitHub 账号下**新建一个 fork 仓库**。本项目**不再预填项目名称**，请在部署页自行填写 Git 仓库名称（例如 `my-cloud-desk`）。若你已有源码仓库，建议**跳过一键按钮**，改用 Dashboard 连接已有仓库（见下文）。

> **若你已有该源码仓库，想直接部署（不 fork）**  
> 可跳过一键按钮，在 [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create** → 连接 GitHub 仓库 `gsvps/cloud-desk`，按 `wrangler.toml` 配置资源后部署即可。

点击按钮后，Cloudflare 会读取 `wrangler.toml` 并**自动创建** D1、KV、R2。默认命名如下：

| 资源 | 默认名称 | 说明 |
|------|----------|------|
| 项目名称 / Worker 名称 | **留空（需自填）** | 不在仓库中预填；部署页由用户指定 |
| 应用显示名 `APP_NAME` | **留空（可选）** | 留空时界面默认显示 `CloudDesk` |
| D1 | `clouddesk` | 用户、设备、会话、审计日志 |
| KV | `clouddesk` | 登录会话、OTP、Token（与 D1 同名，类型不同不冲突） |
| R2 | `clouddesk-files` | 文件传输中转 |
| Durable Objects | `DeviceRoom`, `SessionRoom` | Agent / 浏览器 WebSocket 信令 |

部署完成后访问 Workers 域名，首次打开会引导完成管理员初始化。

### 高级设置默认值

点击一键部署后，展开「高级设置」时，以下参数会**自动预填**，一般无需修改：

| 参数 | 默认值 | 来源 |
|------|--------|------|
| 项目名称 / Worker 名称 | **留空** | 由用户在部署页填写 |
| 应用显示名 `APP_NAME` | **留空** | 可选；未设置时应用内为 `CloudDesk` |
| 构建命令 | `npm run build` | `package.json` → `scripts.build` |
| 部署命令 | `npm run deploy:cloudflare` | `package.json` |
| Node.js 版本 | `22` | `engines.node` |
| 生产分支 | `main` | 仓库默认分支 |
| D1 数据库 | `clouddesk` | `wrangler.toml` |
| KV 命名空间 | `clouddesk` | `wrangler.toml` / 部署页 |
| R2 存储桶 | `clouddesk-files` | `wrangler.toml` |

> 说明：D1、KV、R2 默认名称已在仓库中预填；部署页一般保持默认即可。首次部署后 D1 会自动建表，无需手动执行迁移（也可按需运行 `npm run db:migrate`）。

#### 高级设置里其他字段要不要管？

| 字段 | 是否需要理会 | 说明 |
|------|-------------|------|
| **非生产分支部署命令** | 一般不用 | 默认 `npx wrangler versions upload`，仅预览部署时需要 |
| **路径（根目录）** | 留空即可 | monorepo 根目录即仓库根 |
| **API 令牌** | 一键部署不用填 | 点按钮时 Cloudflare 会引导授权 |
| **变量名称 / 变量值** | 生产必改 `CONTROLLER_JWT_SECRET` | 控制器 JWT 密钥，请设为强随机字符串 |

### 手动部署步骤

#### 1. Fork 并克隆仓库

```bash
git clone https://github.com/gsvps/cloud-desk.git
cd CloudDesk
npm install
```

#### 2. 登录 Cloudflare

```bash
npx wrangler login
```

#### 3. 构建并部署

```bash
npm run deploy:cloudflare
```

等价于：

```bash
npm run build
npm run db:migrate
wrangler deploy --config wrangler.toml --name cloud-desk
```

> 仓库未预填 Worker 名称时，本地部署需通过 `--name` 指定（名称需与 Cloudflare Dashboard 中 Worker 一致）。

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

无需自行编译，从 GitHub 下载最新版：

**[下载 clouddesk-client.exe](https://github.com/gsvps/cloud-desk/raw/main/apps/agent/clouddesk-client.exe)**

### 首次运行

1. 双击下载的 `clouddesk-client.exe`（**不要**直接运行已安装目录里的旧版本）
2. 若提示缺少 WebView2，程序会**自动下载安装**（约 1–3 分钟，需联网）
3. **安装向导窗口会自动弹出**；若未看到，请检查任务栏是否有 CloudDesk 窗口，或再次双击 exe（会自动激活已有窗口）
4. 选择安装目录（有 D 盘默认 `D:\CloudDesk`，否则为 `%USERPROFILE%\CloudDesk`），点击「安装」
5. 安装完成后程序会**自动启动** `CloudDesk.exe`，并在设置页配置 Worker / VPS 地址

> **从网络下载的 exe 若双击无反应**：右键 exe → **属性** → 勾选「解除锁定 / Unblock」后重试。  
> **已安装用户**：请使用桌面快捷方式或安装目录中的 `CloudDesk.exe`，不要反复运行下载目录里的 bootstrap exe。  
> 日志：安装前 `%USERPROFILE%\.clouddesk\agent.log`，安装后 `<安装目录>\logs\agent.log`。

### 自行编译

```powershell
cd apps/agent
powershell -ExecutionPolicy Bypass -File .\build-client.ps1
# 输出: apps/agent/clouddesk-client.exe
```

| 组件 | 说明 |
|------|------|
| 嵌入 UI | `apps/web` 构建产物 |
| 本地 UI 端口 | 固定 `127.0.0.1:19527` |
| 关闭窗口 | 默认退到托盘（可设置） |
| 远程重连 | 断线 30 秒倒计时自动重连 |

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

---

## 后端 / 加速节点配置

控制端与 Agent **必须指向同一 API 地址**。

### 浏览器控制端

**设置 → 后端 / 加速节点**

| 模式 | 说明 |
|------|------|
| 本地开发 | 默认 `http://127.0.0.1:8787` |
| Cloudflare Worker | 填写 Worker 域名 |
| VPS 自托管加速 | 填写 VPS HTTPS 地址 |

保存后会调用 `/api/health` 验证；返回 `backend: self_hosted` 表示 VPS 节点。

### Agent / 桌面客户端

**设置 → Agent 服务器（API + 信令）** → `server_url`  
修改后需**重启 Agent** 以重连 WebSocket。

环境变量（可选）：

```powershell
$env:CLOUDDESK_SERVER = "https://your-worker.example.com"
```

---

## Agent 主要设置

| 设置 | 说明 |
|------|------|
| 服务器地址 | Worker 或 VPS API 根 URL |
| 允许被控 | 开关 Agent 与后端的连接 |
| 自动接受连接 | 跳过连接确认（慎用） |
| 关闭窗口退到托盘 | 默认开启 |
| 剪贴板 / 画质 / 下载目录 | 见设置页 |

---

## 远程控制端

| 功能 | 说明 |
|------|------|
| 8 位设备 ID 连接 | Agent 自动注册后显示 |
| 适应 / 铺满 / 画质 / 全屏 | 工具栏 |
| 断线重连 | 30 秒倒计时，可取消或立即重连 |
| 文件传输 / 拖放上传 | R2 或 VPS 本地存储中转 |
| 剪贴板 | 双向文本同步 |
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
| GET | `/api/client/update` | 桌面客户端版本检查 |

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
| Windows 桌面客户端 | ✅ |
| TURN 中继（P2P 失败兜底） | ⏳ 规划中 |
| macOS / Linux Agent | ⏳ 规划中 |

---

## 环境要求

- **Node.js** ≥ 22
- **Go** ≥ 1.22（编译 Agent / 桌面客户端）
- **Windows 10/11** + **WebView2 Runtime**（桌面客户端）
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
