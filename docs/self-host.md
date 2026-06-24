# CloudDesk VPS 自托管

VPS 部署与 Cloudflare Worker **原理相同**：提供 API + WebSocket 信令；WebRTC 画面仍为 Browser ↔ Agent **P2P 直连**。

Worker 与 VPS 在代码上已隔离：

| 部署 | 入口 | 存储 | 信令 |
|------|------|------|------|
| Cloudflare | `wrangler.toml` + `apps/worker` | D1 / KV / R2 / DO | Durable Objects |
| VPS 自托管 | `apps/server` | SQLite / 内存 KV / 本地文件 | Node `ws` 房间 |

共享 HTTP 路由：`apps/worker/src/app.ts`（`createCoreApp`）。

---

## 快速启动（本地验证）

```bash
# 1. 构建 Web 前端
npm run build

# 2. 安装 server 依赖
npm install

# 3. 启动自托管服务（默认 :8787）
npm run dev:server
```

浏览器打开 `http://127.0.0.1:8787`，或在控制端设置 → **VPS 自托管加速** → API 地址填 `http://127.0.0.1:8787`。

Agent 设置中 **服务器地址** 填同一 URL，重启 Agent。

---

## 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `PORT` | `8787` | HTTP + WebSocket 端口 |
| `CLOUDDESK_DATA` | `./data` | SQLite、KV 持久化目录、文件缓存 |
| `CLOUDDESK_WEB_ROOT` | `apps/web/dist` | 静态前端目录 |
| `CONTROLLER_JWT_SECRET` | （开发默认） | 与控制器 JWT 一致 |
| `ALLOWED_ORIGIN` | 无 | 跨域时填写浏览器 Origin |
| `SKIP_SIGNATURE_VERIFY` | `true` | 生产建议 `false` |
| `APP_NAME` | `CloudDesk` | 健康检查显示名称 |

复制 `apps/server/.env.example` 为 `.env` 并按需修改（通过 shell 导出或进程管理器注入）。

---

## Docker Compose

```bash
npm run build
docker compose up -d
```

服务监听 `8787`，数据卷 `./data`，内置已构建的 Web UI。

---

## 生产建议

1. **HTTPS**：前置 Nginx/Caddy，反代 HTTP 与 WebSocket（`/ws/device/*`、`/ws/session/*`）。
2. **密钥**：设置强随机 `CONTROLLER_JWT_SECRET`，关闭 `SKIP_SIGNATURE_VERIFY`。
3. **双端一致**：控制端 API 地址与 Agent `server_url` 必须相同。
4. **防火墙**：开放 443（及 3478 若将来部署 TURN）；无需为 WebRTC 媒体开放 VPS 大带宽（P2P 不经过 VPS）。
5. **备份**：定期备份 `CLOUDDESK_DATA/clouddesk.db` 与 `files/` 目录。

---

## 与 Cloudflare 部署的关系

- **不要**在同一环境混用两套后端指向同一 Agent（设备注册在各自 DB 中独立）。
- 从 CF 迁到 VPS：在 VPS 重新注册 Agent，控制端切换 API 地址并更新控制器令牌（若密钥不同）。
- Cloudflare 部署说明见 [deploy.md](./deploy.md)。

---

## 故障排查

| 现象 | 处理 |
|------|------|
| `/api/health` 返回 `backend: self_hosted` | 正常 |
| Agent 离线 | 检查 `server_url`、VPS 防火墙、WSS 反代 |
| WebRTC 失败 | NAT/防火墙；与 Worker 相同，可后续加 TURN |
| 跨域错误 | 设置 `ALLOWED_ORIGIN` 或同源托管 Web |
