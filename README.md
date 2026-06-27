# 谁更懂谁：AI 亲子默契拔河

一个亲子活动场景下的双人联机 H5 MVP。家长创建房间，孩子扫码加入，双方完成默契题和情绪题，结束后生成亲子默契观察报告。

## 技术栈

- Vite + React + TypeScript + Tailwind CSS
- Node.js + Express + Socket.IO
- qrcode.react + Recharts
- openai + dotenv + zod

## 本地开发

复制 `.env.example` 为 `.env.local`，按需填写：

```bash
OPENAI_API_KEY=请填写你的API_KEY
OPENAI_MODEL=gpt-4o-mini
AI_TIMEOUT_MS=15000
USE_AI=true
```

没有 `OPENAI_API_KEY` 时，系统会自动使用 mock 题库和规则报告，仍然可以完整演示。

```bash
npm install
npm run dev
```

局域网调试可以使用：

```bash
npm run dev:host
```

本地开发时，前端默认 `5173`，后端默认 `3001`。Socket.IO 会根据当前页面 hostname 连接 `http://当前hostname:3001`。

## 生产模式本地测试

```bash
npm run build
$env:NODE_ENV="production"; npm start
```

生产模式下，Express 会托管 Vite 构建出的 `dist` 静态文件，并把非 API、非 Socket.IO 路径回退到 `dist/index.html`。以下路径刷新不应 404：

- `/`
- `/create`
- `/join`
- `/join?code=XXXXXX`
- `/room/:code`
- `/game/:code`
- `/report/:code`

生产环境中，Socket.IO 使用同源连接；二维码加入链接使用 `window.location.origin + "/join?code=房间码"`。

## Render 部署

1. 将项目推送到 GitHub。
2. 打开 Render。
3. 点击 `New +`，创建 `Web Service`。
4. 连接 GitHub 仓库。
5. `Root Directory` 留空。
6. `Build Command` 填：

```bash
npm run render-build
```

7. `Start Command` 填：

```bash
npm start
```

8. 在 `Environment Variables` 添加：

```bash
NODE_ENV=production
OPENAI_API_KEY=你的API_KEY
OPENAI_MODEL=gpt-4o-mini
AI_TIMEOUT_MS=15000
USE_AI=true
```

如果暂时没有 API Key，也可以不填 `OPENAI_API_KEY`，项目会自动 fallback 到 mock 题库和规则报告。

9. 部署完成后，访问 Render 生成的公网 URL，例如：

```text
https://parent-child-tug.onrender.com/
```

10. 家长创建房间后，二维码会自动生成公网加入地址，例如：

```text
https://parent-child-tug.onrender.com/join?code=K7M2Q9
```

孩子用微信扫码即可加入，不需要和家长设备处于同一 Wi-Fi。

## Render 免费服务提醒

- Render 免费服务空闲后可能休眠。
- 第一次打开可能需要等待几十秒。
- 演示前请提前打开网站唤醒服务。
- 免费服务不适合长期高并发，但适合 MVP 演示。

## 常用命令

```bash
npm run dev          # 本地前后端开发
npm run dev:host     # 本地局域网调试
npm run check        # TypeScript 检查和构建检查
npm run build        # 构建前端和后端
npm start            # 启动生产服务
```
