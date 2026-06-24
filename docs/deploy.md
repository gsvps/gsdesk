# CloudDesk 部署指南

CloudDesk 支持两种**互相隔离**的后端部署方式。二者均**仅提供 API + WebSocket 信令**，不在域名上托管控制端 Web 页面（访问根路径返回 `success`）。

| 方式 | 文档 | 入口 |
|------|------|------|
| **Cloudflare Workers** | 本文 | 根目录 `wrangler.toml` |
| **VPS 自托管** | [self-host.md](./self-host.md) | `apps/server` |

控制与被控请使用 **[clouddesk-client.exe](../apps/agent/clouddesk-client.exe)**，在本地 UI（`127.0.0.1:19527`）填写 Worker / VPS 地址。

---

## 一键部署

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/)

### 配置资源

| 资源 | 默认名称 |
|------|----------|
| D1 | `clouddesk` |
| KV | `clouddesk` |
| R2 | `clouddesk-files` |
| Durable Objects | `DeviceRoom`, `SessionRoom` |

部署后访问 Worker 域名，应看到纯文本 **`success`**。然后：

1. 下载运行 `clouddesk-client.exe`
2. 在 **设置** 中填写 Worker URL 与 `CONTROLLER_JWT_SECRET`

## 手动部署

```bash
git clone https://github.com/gsvps/cloud-desk.git
cd CloudDesk
npm install
npx wrangler login
npm run deploy:cloudflare
```

等价于：

```bash
npm run db:migrate
wrangler deploy --config wrangler.toml --name cloud-desk
```

> 无需 `npm run build`（Web 前端不再上传到 Worker）。

## 本地开发

```bash
npm run db:migrate:local -w @clouddesk/worker
npm run dev:worker          # http://127.0.0.1:8787
curl http://127.0.0.1:8787/   # success
curl http://127.0.0.1:8787/api/health
```

客户端设置 API 为 `http://127.0.0.1:8787`，令牌与 `CONTROLLER_JWT_SECRET` 一致。

## Agent 连接生产环境

在客户端 **设置** 填写 Worker 地址，或：

```powershell
$env:CLOUDDESK_SERVER="https://your-worker.example.com"
```

## 故障排查

| 问题 | 处理 |
|------|------|
| 访问域名不是 `success` | 确认已部署最新 Worker（无 `[assets]` 静态站） |
| 设备离线 | Agent 已启动且 API 地址正确 |
| 令牌无效 | 客户端令牌 = Worker `CONTROLLER_JWT_SECRET` |
| WebRTC 失败 | 检查 NAT；MVP 无 TURN |

---

远控视频走 WebRTC P2P，**不经过 Cloudflare 转发桌面流**。
