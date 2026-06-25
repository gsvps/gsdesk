# GSDesk Cloudflare 部署指南

GSDesk 支持两种**互相隔离**的后端：Cloudflare Workers 与 VPS 自托管。本文说明 **Cloudflare** 部署；VPS 见 [self-host.md](./self-host.md)。

| 方式 | 文档 | 配置文件 |
|------|------|----------|
| **Cloudflare Workers** | 本文 | 根目录 `wrangler.toml` |
| **VPS 自托管** | [self-host.md](./self-host.md) | `apps/server/.env` |

部署完成后：

| 地址 | 预期结果 |
|------|----------|
| `https://你的域名/` | 纯文本 **`success`**（API 健康，非控制页） |
| `https://你的域名/app/` | 手机 / 浏览器控制界面（默认路径，可配置） |
| `GET /api/health` | JSON，含 `web_app_entry` 字段 |

Windows 控制与被控请使用 **[gsdesk-client.exe](https://github.com/gsvps/gsdesk/releases/latest/download/gsdesk-client.exe)**，在本地 UI（`127.0.0.1:19527`）填写 Worker 地址与 JWT。

---

## 一键部署

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/)

点击后在部署页填入仓库地址：`https://github.com/gsvps/gsdesk`

### 需创建的资源

| 资源 | 默认名称 | 用途 |
|------|----------|------|
| D1 | `gsdesk` | 设备、会话、审计 |
| KV | `gsdesk` | OTP、限流、Token |
| R2 | `gsdesk-files` | 会话文件传输 |
| Durable Objects | `DeviceRoom`, `SessionRoom` | WebSocket 信令 |

一键部署页中 KV 命名空间名称填 **`gsdesk`**（与 D1 同名，类型不同不冲突）。

部署后：

1. 访问 `/` 确认 **`success`**
2. 访问 `/app/` 确认 Web 控制端可打开
3. 下载运行 `gsdesk-client.exe`
4. 在 **设置** 填写 Worker URL 与 `CONTROLLER_JWT_SECRET`

---

## 手动部署

```bash
git clone https://github.com/gsvps/gsdesk.git
cd GSDesk
npm install
npx wrangler login
npm run deploy:cloudflare
```

`deploy:cloudflare` 依次执行：

1. `npm run build:web:app` — 按 `WEB_APP_PATH` 构建 Web UI 到 `apps/web/dist`
2. `npm run db:migrate` — 应用 D1 远程迁移
3. `wrangler deploy` — 部署 Worker + `[assets]` 静态资源

等价命令：

```bash
npm run build:web:app
npm run db:migrate
wrangler deploy --config wrangler.toml --name gsdesk
```

---

## 环境变量（`wrangler.toml` → `[vars]`）

| 变量 | 默认 | 说明 |
|------|------|------|
| `WEB_APP_PATH` | `/app` | 手机/浏览器控制入口路径 |
| `CONTROLLER_JWT_SECRET` | 开发默认 | **生产必换**为强随机字符串 |
| `CLIENT_LATEST_VERSION` | `0.1.7` | 客户端版本（更新检查） |
| `CLIENT_DOWNLOAD_URL` | GitHub Releases | exe 下载链接 |

### 修改手机入口路径

例如改为 `/desk`：

1. 编辑 `wrangler.toml`：`WEB_APP_PATH = "/desk"`
2. `npm run build:web:app`（脚本会读取 wrangler 中的路径作为 Vite `--base`）
3. `npm run deploy:cloudflare`

跳过第 2 步会导致静态资源 404 或路由错乱。

---

## 本地开发

```bash
npm run db:migrate:local -w @gsdesk/worker
npm run dev:worker          # http://127.0.0.1:8787
```

验证：

```bash
curl http://127.0.0.1:8787/              # success
curl http://127.0.0.1:8787/api/health    # 含 web_app_entry
```

本地 Worker 开发模式下 `/app/` 需先 `npm run build:web:app` 才有静态 UI。

客户端 **设置** → API 地址 `http://127.0.0.1:8787`，令牌与 `CONTROLLER_JWT_SECRET` 一致。

---

## Agent 连接生产环境

在客户端 **设置** 填写 Worker 地址，或设置环境变量：

```powershell
$env:GSDESK_SERVER = "https://your-worker.example.com"
```

---

## 发布 Windows 客户端

exe 不进 git，通过 GitHub Releases 分发：

```bash
git tag v0.1.7
git push origin v0.1.7
```

CI 会自动编译 `gsdesk-client.exe` 并附到 Release。`CLIENT_DOWNLOAD_URL` 默认指向 `releases/latest/download/…`。

---

## 故障排查

| 问题 | 处理 |
|------|------|
| `/` 不是 `success` | 确认 Worker 已部署最新代码 |
| `/app/` 404 或白屏 | 执行 `npm run build:web:app` 后重新 deploy；检查 `WEB_APP_PATH` 与构建 base 一致 |
| 设备离线 | Agent 已启动且 API 地址正确 |
| 令牌无效 | 客户端令牌 = Worker `CONTROLLER_JWT_SECRET` |
| 连接密码错误 | OTP 6 位一次性；永久密码在「本机」栏设置；输入框自动识别 |
| WebRTC 失败 | 检查 NAT / 防火墙；当前版本无 TURN 中继 |
| 传文件失败 | 确认 R2 绑定 `gsdesk-files` 且 bucket 已创建 |

---

远控视频走 WebRTC P2P，**不经过 Cloudflare 转发桌面流**。
