# CloudDesk VPS 自托管

VPS 与 Cloudflare Worker **协议相同**：API + WebSocket 信令 + 可配置 Web 控制端。根路径 `GET /` 返回 **`success`**；手机/浏览器控制界面在 **`WEB_APP_PATH`**（默认 `/app/`）。

Windows 主客户端请用 **[clouddesk-client.exe](https://github.com/gsvps/cloud-desk/releases/latest/download/clouddesk-client.exe)**；浏览器控制无需安装 exe。

| 部署 | 存储 | 信令 | Web UI |
|------|------|------|--------|
| Cloudflare | D1 / KV / R2 / DO | Durable Objects | `[assets]` + `WEB_APP_PATH` |
| VPS | SQLite / SqliteKv / 本地文件 | Node `ws` | `web-app-static.ts` + `WEB_APP_PATH` |

HTTP 路由与 Worker 共享：`apps/worker/src/app.ts`（`createCoreApp`）。

Cloudflare 部署见 [deploy.md](./deploy.md)。

---

## 快速启动

```bash
git clone https://github.com/gsvps/cloud-desk.git
cd CloudDesk
npm install
cp apps/server/.env.example apps/server/.env   # 按需修改
npm run dev:server    # http://127.0.0.1:8787
```

验证：

```bash
curl http://127.0.0.1:8787/              # success
curl http://127.0.0.1:8787/api/health    # 含 web_app_entry: "/app/"
```

浏览器打开 `http://127.0.0.1:8787/app/` 可测试 Web 控制端。

运行 `clouddesk-client.exe`，**设置** → API 地址 `http://127.0.0.1:8787`，令牌与 `.env` 中 `CONTROLLER_JWT_SECRET` 一致。

---

## 环境变量

复制 `apps/server/.env.example` 并按需修改：

| 变量 | 默认 | 说明 |
|------|------|------|
| `PORT` | `8787` | HTTP + WebSocket 监听端口 |
| `CLOUDDESK_DATA` | `./data` | SQLite 数据库与上传文件目录 |
| `CONTROLLER_JWT_SECRET` | 开发默认 | 与客户端 JWT 令牌一致，**生产必换** |
| `WEB_APP_PATH` | `/app` | 手机/浏览器控制入口 |
| `SKIP_SIGNATURE_VERIFY` | `false` | 生产建议保持 `false` |
| `ALLOWED_ORIGIN` | 无 | 跨域 Origin（一般不需要） |
| `APP_NAME` | 无 | 界面显示名称，留空则 `CloudDesk` |

示例：

```env
PORT=8787
CLOUDDESK_DATA=./data
CONTROLLER_JWT_SECRET=请更换为强随机字符串
WEB_APP_PATH=/app
SKIP_SIGNATURE_VERIFY=false
```

---

## Web 控制端静态资源

VPS 从 `apps/web/dist` 提供 SPA（需预先构建）：

```bash
npm run build:web:app   # 读取 wrangler.toml 或 WEB_APP_PATH 环境变量
npm run dev:server
```

修改 `WEB_APP_PATH` 后必须重新 `build:web:app`，否则 Vite `base` 与路由不一致。

`GET /api/health` 返回的 `web_app_entry` 供客户端设置页显示完整手机链接。

---

## Docker Compose

```bash
docker compose up -d --build
```

- 监听 **8787**
- 数据持久化到卷 `./data`
- 环境变量通过 `docker-compose.yml` 或 `.env` 注入

部署前建议在宿主机执行 `npm run build:web:app`，确保镜像内 `apps/web/dist` 与 `WEB_APP_PATH` 匹配（若 compose 未在构建阶段自动执行）。

访问：

- `http://服务器IP:8787/` → `success`
- `http://服务器IP:8787/app/` → Web 控制端

---

## 与 Cloudflare 的差异

| 项 | Cloudflare | VPS |
|----|------------|-----|
| 数据库 | D1 | SQLite |
| KV | Cloudflare KV | `SqliteKv`（表 `kv_store`） |
| 文件 | R2 | 本地 `CLOUDDESK_DATA` |
| 信令 | Durable Objects | 内存 WebSocket 房间 |
| TLS | Cloudflare 边缘 | 需自行配置 Nginx / Caddy 反代 |

---

## 切换后端

Cloudflare Worker 与 VPS **数据不共享**。切换时：

1. 在新后端重新注册设备（Agent 会获得新 `device_id`）
2. 客户端 **设置** 更新 API 地址与 JWT
3. 重新配置 OTP / 永久密码

---

## 故障排查

| 问题 | 处理 |
|------|------|
| `/app/` 404 | 先 `npm run build:web:app`；确认 `apps/web/dist` 存在 |
| 限流 / OTP 重启丢失 | 检查 `CLOUDDESK_DATA` 可写；KV 已持久化到 SQLite |
| 签名失败 | 设置 `SKIP_SIGNATURE_VERIFY=false` 并确保 Agent 时钟正常 |
| WebRTC 不通 | 检查防火墙；当前无 TURN |

---

VPS 同样**不中转桌面视频流**；远控画面经 WebRTC P2P 直连。
