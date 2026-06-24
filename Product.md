下面是一份可直接给 Cursor / Claude Code 使用的开发文档。

````md
# CloudDesk 开发文档

## 1. 项目定位

CloudDesk 是一个类似 Chrome Remote Desktop 的开源远程桌面项目。

目标：

- 控制端使用浏览器
- 被控端运行 Agent 客户端
- 不需要 VPS
- 不需要公网 IP
- 使用 Cloudflare Workers + Durable Objects 做信令
- 使用 WebRTC 建立 P2P 连接
- 支持屏幕共享、鼠标控制、键盘控制、剪贴板、文件传输
- 默认端到端加密
- 可选无人值守远程控制

---

## 2. 总体架构

```text
Browser 控制端
    |
    | HTTPS / WebSocket
    |
Cloudflare Worker
    |
Durable Objects 信令房间
    |
    | WebSocket
    |
Agent 被控端
    |
Windows / macOS / Linux
````

WebRTC 建立成功后：

```text
Browser 控制端  <==== WebRTC P2P ====>  Agent 被控端
```

Cloudflare 只负责：

* 登录认证
* 设备注册
* 在线状态
* SDP 交换
* ICE Candidate 交换
* 会话创建
* 权限校验

Cloudflare 不转发桌面视频流。

---

## 3. 技术栈

### 前端控制端

推荐：

```text
React
Vite
TypeScript
WebRTC API
WebSocket
Tailwind CSS
```

主要功能：

* 登录
* 设备列表
* 发起远程连接
* 显示远程桌面视频
* 捕获鼠标键盘事件
* 剪贴板同步
* 文件上传下载

---

### Cloudflare 服务端

推荐：

```text
Cloudflare Workers
Durable Objects
D1
KV
R2
Wrangler
TypeScript
```

用途：

| 技术              | 用途                       |
| --------------- | ------------------------ |
| Workers         | API 网关、认证、路由             |
| Durable Objects | WebSocket 信令、设备在线状态、会话房间 |
| D1              | 用户、设备、会话、日志              |
| KV              | 短期 Token、验证码、临时状态        |
| R2              | 文件传输、截图、日志归档             |
| Wrangler        | 部署和本地开发                  |

---

### Agent 被控端

推荐优先用 Go，开发速度快。

```text
Go
Pion WebRTC
Gorilla WebSocket
robotgo
kbinani/screenshot
ffmpeg / x264 / VP8
```

Go 相关库：

```text
github.com/pion/webrtc/v4
github.com/gorilla/websocket
github.com/go-vgo/robotgo
github.com/kbinani/screenshot
```

Agent 负责：

* 注册设备
* 保持在线
* 接收连接请求
* 屏幕采集
* 视频编码
* 鼠标控制
* 键盘控制
* 剪贴板同步
* 文件读写
* WebRTC P2P 连接

---

## 4. 模块划分

```text
clouddesk/
├── apps/
│   ├── web/              # 浏览器控制端
│   ├── worker/           # Cloudflare Worker 服务端
│   └── agent/            # 被控端 Agent
│
├── packages/
│   ├── protocol/         # 通信协议定义
│   ├── crypto/           # 加密、签名、Token
│   └── shared/           # 公共类型
│
├── docs/
│   ├── deploy.md
│   ├── security.md
│   └── protocol.md
│
└── README.md
```

---

## 5. 数据库设计 D1

### users

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  name TEXT,
  avatar TEXT,
  created_at INTEGER,
  updated_at INTEGER
);
```

### devices

```sql
CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_name TEXT,
  hostname TEXT,
  os TEXT,
  public_key TEXT NOT NULL,
  unattended_enabled INTEGER DEFAULT 0,
  online INTEGER DEFAULT 0,
  last_seen INTEGER,
  created_at INTEGER,
  updated_at INTEGER
);
```

### sessions

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  status TEXT,
  started_at INTEGER,
  ended_at INTEGER,
  ip TEXT,
  user_agent TEXT
);
```

### audit_logs

```sql
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  device_id TEXT,
  action TEXT,
  ip TEXT,
  metadata TEXT,
  created_at INTEGER
);
```

---

## 6. 核心通信流程

### 6.1 Agent 首次启动

Agent 本地生成设备密钥：

```text
Ed25519 private key
Ed25519 public key
```

私钥只保存在本机。

Agent 调用：

```http
POST /api/device/register
```

请求：

```json
{
  "device_name": "DESKTOP-PC",
  "hostname": "DESKTOP-PC",
  "os": "windows",
  "public_key": "xxx"
}
```

返回：

```json
{
  "device_id": "dev_xxx",
  "device_token": "token_xxx"
}
```

---

### 6.2 Agent 保持在线

Agent 连接：

```text
wss://your-domain.com/ws/device/dev_xxx
```

发送心跳：

```json
{
  "type": "heartbeat",
  "device_id": "dev_xxx",
  "timestamp": 123456789
}
```

Durable Object 保存在线状态。

---

### 6.3 浏览器发起连接

浏览器请求：

```http
POST /api/session/create
```

请求：

```json
{
  "device_id": "dev_xxx"
}
```

服务端检查：

* 用户是否登录
* 是否拥有该设备
* 设备是否在线
* 是否允许无人值守
* 是否需要 Agent 弹窗确认

返回：

```json
{
  "session_id": "sess_xxx",
  "signal_url": "wss://your-domain.com/ws/session/sess_xxx"
}
```

---

### 6.4 信令交换

浏览器创建 WebRTC Offer：

```json
{
  "type": "webrtc_offer",
  "session_id": "sess_xxx",
  "sdp": "..."
}
```

Agent 返回 Answer：

```json
{
  "type": "webrtc_answer",
  "session_id": "sess_xxx",
  "sdp": "..."
}
```

双方继续交换 ICE Candidate：

```json
{
  "type": "ice_candidate",
  "candidate": "..."
}
```

WebRTC 建立成功后，视频和控制数据走 P2P。

---

## 7. WebRTC 设计

### 推荐通道

```text
Video Track      屏幕画面
DataChannel      鼠标、键盘、剪贴板、控制命令
FileChannel      文件传输，可选
```

### DataChannel 消息

#### 鼠标移动

```json
{
  "type": "mouse_move",
  "x": 500,
  "y": 300
}
```

#### 鼠标点击

```json
{
  "type": "mouse_click",
  "button": "left",
  "action": "down"
}
```

#### 键盘输入

```json
{
  "type": "key_press",
  "key": "A",
  "ctrl": false,
  "alt": false,
  "shift": true
}
```

#### 剪贴板

```json
{
  "type": "clipboard",
  "content": "hello"
}
```

---

## 8. 安全设计

必须实现：

```text
1. 设备 ID 不能作为密码
2. Agent 本地生成 Ed25519 密钥
3. 私钥永不上传
4. 用户必须登录后才能连接设备
5. 用户和设备必须绑定
6. 每次连接使用一次性 session token
7. 每次连接使用 nonce 防重放
8. Agent 默认弹窗确认
9. 无人值守需要单独密码
10. WebRTC 默认 DTLS 加密
11. 所有连接记录写入 audit_logs
```

### 连接挑战

Worker 生成：

```json
{
  "nonce": "random_xxx"
}
```

Agent 使用私钥签名：

```json
{
  "device_id": "dev_xxx",
  "signature": "sign(nonce)"
}
```

Worker 使用 public_key 验证。

---

## 9. Agent 功能设计

### Windows Agent

第一版只做 Windows。

功能：

```text
1. 开机自启动
2. ✅ 后台运行
3. ✅ 托盘图标
4. ✅ 显示设备 ID（托盘菜单）
5. ✅ 显示在线状态（托盘菜单）
6. ✅ 连接请求弹窗
7. ✅ 屏幕采集
8. ✅ 鼠标键盘控制
9. ✅ WebRTC 连接
```

### Windows 服务

后期支持：

```text
CloudDeskService
```

用于无人值守远控。

---

## 10. MVP 版本范围

第一版不要做太复杂。

### MVP 必须实现

```text
1. ✅ 用户登录
2. ✅ Agent 注册设备
3. ✅ 设备在线状态
4. ✅ 浏览器设备列表
5. ✅ 浏览器连接 Agent
6. ✅ WebRTC 信令
7. ✅ 屏幕显示（VP8 VideoTrack + JPEG DataChannel 回退）
8. ✅ 鼠标控制
9. ✅ 键盘控制
10. ✅ Agent 弹窗确认（Windows MessageBox）
```

### MVP 暂不实现

```text
1. 文件传输
2. 多用户协作
3. 远程声音
4. 多显示器切换
5. 移动端 Agent
6. TURN 中继
7. 商业化套餐
```

---

## 11. 后续高级功能

```text
1. 文件传输：R2
2. 剪贴板同步
3. 多显示器
4. 远程声音
5. 远程终端
6. Web SSH
7. 设备分组
8. 团队共享
9. 临时邀请码
10. 无人值守访问密码
11. TOTP 二次验证
12. TURN fallback
13. 屏幕录像
14. ✅ 审计日志（基础版）
15. 企业版控制台
```

---

## 12. Cloudflare 部署资源 ✅

仓库已提供根目录 `wrangler.toml` 与 [docs/deploy.md](docs/deploy.md) 一键部署说明。

### wrangler.toml 示例

```toml
name = "clouddesk-worker"
main = "src/index.ts"
compatibility_date = "2026-01-01"

[[durable_objects.bindings]]
name = "SIGNAL_ROOM"
class_name = "SignalRoom"

[[d1_databases]]
binding = "DB"
database_name = "clouddesk"
database_id = "xxxx"

[[kv_namespaces]]
binding = "KV"
id = "xxxx"

[[r2_buckets]]
binding = "R2"
bucket_name = "clouddesk-files"
```

---

## 13. API 路由设计

```text
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/user/me

POST   /api/device/register
GET    /api/devices
GET    /api/device/:id
POST   /api/device/:id/rename
POST   /api/device/:id/delete

POST   /api/session/create
POST   /api/session/:id/close
GET    /api/sessions

GET    /ws/device/:deviceId
GET    /ws/session/:sessionId
```

---

## 14. 项目开发顺序

### 第 1 阶段：服务端 ✅

```text
1. ✅ 初始化 Worker
2. ✅ 创建 D1 表
3. ✅ 实现用户登录
4. ✅ 实现设备注册
5. ✅ 实现 Durable Object WebSocket
6. ✅ 实现设备在线状态
```

### 第 2 阶段：Agent ✅

```text
1. ✅ Go Agent 启动
2. ✅ 生成设备密钥
3. ✅ 注册设备
4. ✅ 连接 WebSocket
5. ✅ 保持心跳
6. ✅ 接收连接请求
```

### 第 3 阶段：WebRTC ✅

```text
1. ✅ 浏览器创建 offer
2. ✅ Worker 转发 offer
3. ✅ Agent 创建 answer
4. ✅ 双方交换 ICE
5. ✅ 建立 DataChannel
```

### 第 4 阶段：远控 ✅

```text
1. ✅ Agent 截屏
2. ✅ 编码视频（JPEG 帧，MVP）
3. ✅ 推送 WebRTC video track（VP8，CGO+libvpx；否则 JPEG 回退）
4. ✅ 浏览器显示画面
5. ✅ 浏览器发送鼠标键盘
6. ✅ Agent 执行控制
```

### 第 5 阶段：安全 ✅

```text
1. ✅ 设备签名
2. ✅ session token
3. ✅ nonce 防重放
4. ✅ 弹窗确认
5. ✅ 审计日志
```

---

## 15. 项目名称建议

```text
CloudDesk
CFDesk
WorkerDesk
ZeroVPS Desk
EdgeDesk
```

推荐使用：

```text
CloudDesk
```

Slogan：

```text
A serverless remote desktop powered by Cloudflare and WebRTC.
```

中文：

```text
基于 Cloudflare 和 WebRTC 的无服务器远程桌面。
```

---

## 16. README 简介模板

```md
# CloudDesk

CloudDesk is a serverless remote desktop project powered by Cloudflare Workers, Durable Objects and WebRTC.

## Features

- No VPS required
- No public IP required
- Browser-based controller
- Lightweight desktop agent
- WebRTC P2P connection
- Cloudflare Workers signaling
- End-to-end encrypted
- Secure device authentication
- Unattended access support
- File transfer via R2

## Architecture

Browser <-> Cloudflare Worker / Durable Objects <-> Agent

After signaling, screen and control data are transmitted directly over WebRTC P2P.
```

---

## 17. 重要注意事项

1. 不要把设备 ID 当密码。
2. 不要默认开启无人值守。
3. 不要让 Cloudflare 转发视频流。
4. 第一版不要做 TURN。
5. 第一版只支持 Windows Agent。
6. 第一版不要追求极致画质，先跑通远控。
7. 后期再优化 H264、硬件编码、低延迟。

```

我建议你第一版就按这个方向做：**Windows Agent + 浏览器控制端 + Cloudflare DO 信令 + WebRTC P2P**。
```
