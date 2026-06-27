import express from 'express'
import http from 'node:http'
import os from 'node:os'
import { Server } from 'socket.io'
import { buildFallbackReport, generateQuestions, generateReport } from './ai.ts'
import { fallbackQuestions } from './mockData.ts'
import type {
  Answer,
  CreateRoomPayload,
  JoinRoomPayload,
  Player,
  PublicRoomState,
  RoomState,
  SocketAck,
  SubmitAnswerPayload,
} from '../src/shared/types.ts'

const app = express()
const server = http.createServer(app)
const io = new Server(server, {
  cors: {
    origin: true,
    methods: ['GET', 'POST'],
  },
})
const port = Number(process.env.PORT ?? 3001)
const rooms = new Map<string, RoomState>()

const getLanIp = () => {
  const interfaces = os.networkInterfaces()

  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) {
        return address.address
      }
    }
  }

  return '127.0.0.1'
}

const clientPort = Number(process.env.CLIENT_PORT ?? 5173)
const lanIp = process.env.LAN_IP ?? getLanIp()
const clientOrigin = `http://${lanIp}:${clientPort}`

const makeRoomCode = () => {
  let code = ''

  do {
    code = Math.floor(100000 + Math.random() * 900000).toString()
  } while (rooms.has(code))

  return code
}

const now = () => Date.now()

const makePublicState = (room: RoomState): PublicRoomState => {
  const answerProgress = room.questions.reduce<Record<string, string[]>>((acc, question) => {
    acc[question.id] = room.answers
      .filter((answer) => answer.questionId === question.id)
      .map((answer) => answer.role)
    return acc
  }, {})
  const { answers: _answers, ...publicRoom } = room

  return {
    ...publicRoom,
    answerProgress,
  }
}

const emitRoom = (room: RoomState) => {
  io.to(room.code).emit('room:state', makePublicState(room))
}

const getPlayer = (room: RoomState, socketId: string) =>
  room.players.find((player) => player.id === socketId)

const createPlayer = (id: string, role: Player['role'], nickname: string): Player => ({
  id,
  role,
  nickname: nickname.trim() || (role === 'parent' ? '家长' : '孩子'),
  connected: true,
})

const acknowledge = <T>(ack: ((response: SocketAck<T>) => void) | undefined, response: SocketAck<T>) => {
  if (ack) {
    ack(response)
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'ai-parent-child-tug', lanIp, clientOrigin })
})

app.get('/api/network', (_req, res) => {
  res.json({
    lanIp,
    clientOrigin,
    serverOrigin: `http://${lanIp}:${port}`,
  })
})

io.on('connection', (socket) => {
  socket.on(
    'room:create',
    (payload: CreateRoomPayload, ack?: (response: SocketAck<PublicRoomState>) => void) => {
      const code = makeRoomCode()
      const room: RoomState = {
        code,
        phase: 'waiting',
        joinUrl: `${clientOrigin}/join/${code}`,
        players: [createPlayer(socket.id, 'parent', payload.nickname)],
        questions: fallbackQuestions,
        currentQuestionIndex: 0,
        answers: [],
        createdAt: now(),
        updatedAt: now(),
      }

      rooms.set(code, room)
      socket.join(code)
      acknowledge(ack, { ok: true, data: makePublicState(room) })
      emitRoom(room)
    },
  )

  socket.on(
    'room:join',
    (payload: JoinRoomPayload, ack?: (response: SocketAck<PublicRoomState>) => void) => {
      const room = rooms.get(payload.code)

      if (!room) {
        acknowledge(ack, { ok: false, error: '房间不存在或已过期' })
        return
      }

      const existingChild = room.players.find((player) => player.role === 'child')
      if (existingChild && existingChild.id !== socket.id) {
        acknowledge(ack, { ok: false, error: '这个房间已经有孩子加入了' })
        return
      }

      socket.join(room.code)
      const child = existingChild ?? createPlayer(socket.id, 'child', payload.nickname)
      child.id = socket.id
      child.nickname = payload.nickname.trim() || '孩子'
      child.connected = true

      if (!existingChild) {
        room.players.push(child)
      }

      room.updatedAt = now()
      acknowledge(ack, { ok: true, data: makePublicState(room) })
      emitRoom(room)
    },
  )

  socket.on('room:watch', (code: string, ack?: (response: SocketAck<PublicRoomState>) => void) => {
    const room = rooms.get(code)

    if (!room) {
      acknowledge(ack, { ok: false, error: '房间不存在或已过期' })
      return
    }

    socket.join(room.code)
    acknowledge(ack, { ok: true, data: makePublicState(room) })
  })

  socket.on('game:start', async (code: string, ack?: (response: SocketAck<PublicRoomState>) => void) => {
    const room = rooms.get(code)
    if (!room) {
      acknowledge(ack, { ok: false, error: '房间不存在或已过期' })
      return
    }

    const player = getPlayer(room, socket.id)
    if (player?.role !== 'parent') {
      acknowledge(ack, { ok: false, error: '只有家长可以开始游戏' })
      return
    }

    if (!room.players.some((item) => item.role === 'child')) {
      acknowledge(ack, { ok: false, error: '请等待孩子加入后再开始' })
      return
    }

    room.phase = 'playing'
    room.currentQuestionIndex = 0
    room.questions = await generateQuestions()
    room.answers = []
    room.report = undefined
    room.updatedAt = now()
    acknowledge(ack, { ok: true, data: makePublicState(room) })
    emitRoom(room)
  })

  socket.on(
    'answer:submit',
    async (payload: SubmitAnswerPayload, ack?: (response: SocketAck<PublicRoomState>) => void) => {
      const room = rooms.get(payload.code)
      if (!room) {
        acknowledge(ack, { ok: false, error: '房间不存在或已过期' })
        return
      }

      const player = getPlayer(room, socket.id)
      const question = room.questions[room.currentQuestionIndex]
      if (!player || !question || question.id !== payload.questionId) {
        acknowledge(ack, { ok: false, error: '当前答题状态不匹配' })
        return
      }

      const answer: Answer = {
        questionId: question.id,
        playerId: socket.id,
        role: player.role,
        optionIndex: payload.optionIndex,
        answeredAt: now(),
      }

      room.answers = room.answers.filter(
        (item) => !(item.questionId === question.id && item.playerId === socket.id),
      )
      room.answers.push(answer)

      const answersForQuestion = room.answers.filter((item) => item.questionId === question.id)
      const bothAnswered = ['parent', 'child'].every((role) =>
        answersForQuestion.some((item) => item.role === role),
      )

      if (bothAnswered) {
        if (room.currentQuestionIndex >= room.questions.length - 1) {
          room.phase = 'report'
          room.report = await generateReport(room)
        } else {
          room.currentQuestionIndex += 1
        }
      }

      room.updatedAt = now()
      acknowledge(ack, { ok: true, data: makePublicState(room) })
      emitRoom(room)
    },
  )

  socket.on('disconnect', () => {
    for (const room of rooms.values()) {
      const player = getPlayer(room, socket.id)
      if (player) {
        player.connected = false
        if (room.phase === 'report' && !room.report) {
          room.report = buildFallbackReport(room)
        }
        room.updatedAt = now()
        emitRoom(room)
      }
    }
  })
})

server.listen(port, '0.0.0.0', () => {
  console.log(`API server listening on http://0.0.0.0:${port}`)
  console.log(`LAN client URL: ${clientOrigin}`)
})
