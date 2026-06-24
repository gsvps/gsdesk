# CloudDesk 部署指南

CloudDesk 支持两种**互相隔离**的后端部署方式，API 与信令原理相同，存储与运行时不同：

| 方式 | 文档 | 入口 |
|------|------|------|
| **Cloudflare Workers**（默认） | 本文 | `wrangler.toml` |
| **VPS 自托管 / 加速节点** | [self-host.md](./self-host.md) | `apps/server` |

> 同一 Agent 请勿同时指向两套后端。切换部署时在新区重新注册设备，并在控制端设置中更新 API 地址。

---

CloudDesk 部署到 Cloudflare Workers，使用 D1、KV、R2 与 Durable Objects。

## 一键部署

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/)

> 部署前请将按钮 URL 中的 GitHub 仓库地址替换为你的 fork 地址。

### 配置资源（Configure resources）

| 资源 | 默认名称 | 说明 |
|------|----------|------|
| Project / Worker 名称 | **留空（自行填写）** | 仓库不预填 Worker 名 |
| `APP_NAME` | **留空（可选）** | 界面默认显示 `CloudDesk` |
| D1 | `clouddesk` | 用户、设备、会话、审计日志 |
| KV | `clouddesk` | 登录会话、配对码、Token |
| R2 | `clouddesk-files` | 预留文件传输 |
| Durable Objects | `DeviceRoom`, `SessionRoom` | WebSocket 信令 |

首次访问 Web 控制台会引导完成管理员初始化。

## 手动部署

```bash
git clone <your-repo-url>
cd CloudDesk
npm install
npx wrangler login
npm run deploy:cloudflare
```

等价于：

```bash
npm run build          # 构建 Web 前端到 apps/web/dist
npm run db:migrate     # 应用 D1 迁移（远程）
wrangler deploy --config wrangler.toml
```

## 本地开发

```bash
npm install

# 终端 1：Worker（使用 apps/worker/wrangler.toml）
npm run db:migrate:local -w @clouddesk/worker
npm run dev -w @clouddesk/worker

# 终端 2：Web 开发服务器
npm run dev -w @clouddesk/web
```

Worker 默认 `http://127.0.0.1:8787`，Web 默认 `http://127.0.0.1:5173`（API 代理到 Worker）。

## Agent 连接生产环境

```powershell
$env:CLOUDDESK_SERVER="https://your-worker.example.com"
$env:CLOUDDESK_PAIRING_TOKEN="配对码"
cd apps/agent
go run .
```

启用 VP8 VideoTrack（可选，需 libvpx）：

```powershell
# Windows：通过 vcpkg 安装 libvpx 后
$env:CGO_ENABLED="1"
$env:PKG_CONFIG_PATH="C:\vcpkg\installed\x64-windows\lib\pkgconfig"
go build -tags cgo -o clouddesk-agent.exe .
```

未启用 CGO/libvpx 时，Agent 自动使用 DataChannel JPEG 推流，功能仍可用。

## Cloudflare 免费额度提示

- Workers：每日请求数有限
- D1：读写行数有限
- KV：每日读写在免费额度内
- R2：存储与 Class A/B 操作有限
- Durable Objects：请求与 WebSocket 时长计费

远控视频走 WebRTC P2P，**不经过 Cloudflare 转发桌面流**，信令流量通常较低。

## 故障排查

| 问题 | 处理 |
|------|------|
| 部署报错 `10097` / `new_sqlite_classes` | Workers **Free** 须用 SQLite 版 DO；本仓库通过 `v2` 删除 KV 版、`v3` 创建 SQLite 版。若仍失败，在 Cloudflare 控制台 **删除 Worker `cloud-desk`** 后重新部署 |
| Worker 名称 `undefined` | 根目录 `wrangler.toml` 已设置 `name = "cloud-desk"` |
| 设备显示离线 | 确认 Agent 已启动且 `CLOUDDESK_SERVER` 正确 |
| WebRTC 连接失败 | 检查 NAT/防火墙；MVP 未配置 TURN |
| VP8 无画面 | 确认 Agent 用 CGO+libvpx 编译，或依赖 JPEG 回退 |
| D1 迁移失败 / `db_ready: false` | 重新部署最新 Worker（会自动建表）；或 `npm run db:migrate`。若**删过 D1 再重建**，请在 Cloudflare → Worker → **Settings → Bindings** 确认 `DB` 已绑定到新 D1 `clouddesk`，再 redeploy |
