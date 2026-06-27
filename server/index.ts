import express from 'express'
import http from 'node:http'

const app = express()
const server = http.createServer(app)
const port = Number(process.env.PORT ?? 3001)

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'ai-parent-child-tug' })
})

server.listen(port, '0.0.0.0', () => {
  console.log(`API server listening on http://0.0.0.0:${port}`)
})
