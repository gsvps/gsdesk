# CloudDesk VPS 自托管

VPS 与 Cloudflare Worker **原理相同**：API + WebSocket 信令；**不托管 Web 控制页**（`GET /` 返回 `success`）。UI 请用 **clouddesk-client.exe**。

| 部署 | 存储 | 信令 |
|------|------|------|
| Cloudflare | D1 / KV / R2 / DO | Durable Objects |
| VPS | SQLite / 内存 KV / 本地文件 | Node `ws` |

共享 HTTP 路由：`apps/worker/src/app.ts`（`createCoreApp`）。

---

## 快速启动

```bash
npm install
npm run dev:server    # http://127.0.0.1:8787
```

验证：

```bash
curl http://127.0.0.1:8787/          # success
curl http://127.0.0.1:8787/api/health
```

运行 `clouddesk-client.exe`，**设置** → API 地址 `http://127.0.0.1:8787`。

---

## 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `PORT` | `8787` | HTTP + WebSocket |
| `CLOUDDESK_DATA` | `./data` | SQLite 与文件 |
| `CONTROLLER_JWT_SECRET` | 开发默认 | 与客户端令牌一致 |
| `ALLOWED_ORIGIN` | 无 | 跨域 Origin（一般不需要，客户端走 127.0.0.1） |
| `SKIP_SIGNATURE_VERIFY` | `true` | 生产建议 `false` |

复制 `apps/server/.env.example` 并按需修改。

---

## Docker Compose

```bash
docker compose up -d --build
```

监听 `8787`，数据卷 `./data`。容器内不提供 Web UI。

---

## 与 Cloudflare 切换

两套后端数据**不共享**。切换时在新区重新注册设备，并在客户端更新 API 地址。
