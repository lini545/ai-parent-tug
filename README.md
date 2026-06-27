# 谁更懂谁：AI 亲子默契拔河

当天可完成的亲子活动 MVP：家长在电脑端创建房间，孩子用微信扫码加入，同一局域网内通过 Socket.IO 实时联机答题，结束后生成亲子默契报告和雷达图。

## 技术栈

- Vite + React + TypeScript + Tailwind CSS
- Node.js + Express + Socket.IO
- qrcode.react + Recharts
- openai + dotenv + zod

## 本地配置

复制 `.env.example` 为 `.env.local`，然后填写自己的 OpenAI API Key。

```bash
OPENAI_API_KEY=请填写你的API_KEY
OPENAI_MODEL=gpt-4o-mini
AI_TIMEOUT_MS=15000
USE_AI=true
```

如果当前账号不能使用默认模型，可以把 `OPENAI_MODEL` 改成账号可用模型。`.env.local` 已写入 `.gitignore`，不会提交到 Git。

## 启动

```bash
npm install
npm run dev
```

启动后终端会显示 Vite 的 `Network` 地址，例如：

```text
http://192.168.x.x:5173/
```

家长用电脑打开这个地址或 `http://localhost:5173/` 创建房间。二维码里的加入链接会使用电脑局域网 IP，不会使用 `localhost`。孩子手机需要和电脑在同一个 Wi-Fi 下，用微信扫码进入加入页。

## 验收重点

- 家长端创建房间后显示 6 位房间码和二维码。
- 孩子端扫码进入 `/join/:code`，自动带入房间码，输入昵称后加入。
- 两台设备在同一局域网下实时同步玩家、题目、答题进度和报告。
- AI 只在后端调用，前端不会出现 API Key。
- AI 出题和报告都要求 JSON 输出，并用 zod 校验。
- AI 失败、超时、额度不足、没有 Key、JSON 错误或字段缺失时，自动 fallback 到 mock 题库或规则模板报告。

## 检查

```bash
npm run check
```

该命令会执行 TypeScript 检查和 Vite 构建。
