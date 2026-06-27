import express from 'express'
import http from 'node:http'
import os from 'node:os'
import { Server } from 'socket.io'

type Player = {
  id: string
  nickname: string
  connected: boolean
}

type Question = {
  id: string
  type: 'tacit' | 'emotion'
  text: string
  options: string[]
}

type GameState = {
  currentQuestionIndex: number
  answers: Record<string, unknown>
  ropePosition: number
  tacitScore: number
  empathyScore: number
  pressureScore: number
  consensusScore: number
  differences: string[]
  emotionWarnings: string[]
  questions: Question[]
}

type Room = {
  code: string
  parent?: Player
  child?: Player
  status: 'waiting' | 'generating_questions' | 'playing' | 'finished'
  game?: GameState
}

type ClientRoom = Room & {
  isParentReady: boolean
  isChildReady: boolean
}

const app = express()
const server = http.createServer(app)
const io = new Server(server, {
  cors: {
    origin: true,
    methods: ['GET', 'POST'],
  },
})

const port = Number(process.env.PORT ?? 3001)
const rooms = new Map<string, Room>()
const socketRooms = new Map<string, string>()
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

const mockQuestions: Question[] = [
  {
    id: 'mock-1',
    type: 'tacit',
    text: '孩子放学后最希望家长先做什么？',
    options: ['问今天开心吗', '给一点安静时间', '聊作业安排', '一起吃点东西'],
  },
  {
    id: 'mock-2',
    type: 'emotion',
    text: '发生争执时，哪句话更适合先打开沟通？',
    options: ['你必须听我的', '我想先听听你的想法', '这有什么好说的', '你怎么又这样'],
  },
]

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

const makeRoomCode = () => {
  let code = ''

  do {
    code = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)])
      .join('')
  } while (rooms.has(code))

  return code
}

const normalizeCode = (code: string) => code.trim().toUpperCase()

const createPlayer = (id: string, nickname: string): Player => ({
  id,
  nickname: nickname.trim() || '未命名',
  connected: true,
})

const createInitialGameState = (): GameState => ({
  currentQuestionIndex: 0,
  answers: {},
  ropePosition: 0,
  tacitScore: 0,
  empathyScore: 0,
  pressureScore: 0,
  consensusScore: 0,
  differences: [],
  emotionWarnings: [],
  questions: mockQuestions,
})

const toClientRoom = (room: Room): ClientRoom => ({
  ...room,
  isParentReady: Boolean(room.parent?.connected),
  isChildReady: Boolean(room.child?.connected),
})

const emitRoomUpdated = (room: Room) => {
  io.to(room.code).emit('room_updated', toClientRoom(room))
}

const emitCurrentQuestion = (room: Room) => {
  const game = room.game
  if (!game) {
    return
  }

  io.to(room.code).emit('question_updated', {
    question: game.questions[game.currentQuestionIndex],
    currentQuestionIndex: game.currentQuestionIndex,
    totalQuestions: game.questions.length,
    answers: game.answers,
  })
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'ai-parent-child-tug',
    socket: 'started',
    serverOrigin: `http://${getLanIp()}:${port}`,
  })
})

io.on('connection', (socket) => {
  socket.on('create_room', (payload: { nickname?: string }) => {
    const code = makeRoomCode()
    const room: Room = {
      code,
      parent: createPlayer(socket.id, payload.nickname ?? ''),
      status: 'waiting',
    }

    rooms.set(code, room)
    socketRooms.set(socket.id, code)
    socket.join(code)

    socket.emit('room_created', toClientRoom(room))
    emitRoomUpdated(room)
  })

  socket.on('join_room', (payload: { code?: string; nickname?: string }) => {
    const code = normalizeCode(payload.code ?? '')
    const room = rooms.get(code)

    if (!room) {
      socket.emit('error_message', '房间不存在，请检查房间码')
      return
    }

    if (room.child && room.child.id !== socket.id) {
      socket.emit('error_message', '这个房间已经有孩子加入了')
      return
    }

    if (room.parent?.id === socket.id) {
      socket.emit('error_message', '家长端不能作为孩子重复加入')
      return
    }

    room.child = createPlayer(socket.id, payload.nickname ?? '')
    socketRooms.set(socket.id, code)
    socket.join(code)
    emitRoomUpdated(room)
  })

  socket.on('start_game', (payload: { code?: string }) => {
    const code = normalizeCode(payload.code ?? '')
    const room = rooms.get(code)

    if (!room) {
      socket.emit('error_message', '房间不存在，请检查房间码')
      return
    }

    if (room.parent?.id !== socket.id) {
      socket.emit('error_message', '只有家长可以开始游戏')
      return
    }

    if (!room.parent || !room.child) {
      socket.emit('error_message', '家长和孩子都加入后才能开始游戏')
      return
    }

    room.status = 'generating_questions'
    emitRoomUpdated(room)
    io.to(room.code).emit('generating_questions', toClientRoom(room))

    setTimeout(() => {
      room.game = createInitialGameState()
      room.status = 'playing'
      emitRoomUpdated(room)
      io.to(room.code).emit('game_started', toClientRoom(room))
      emitCurrentQuestion(room)
    }, 600)
  })

  socket.on('disconnect', () => {
    const code = socketRooms.get(socket.id)
    if (!code) {
      return
    }

    const room = rooms.get(code)
    if (!room) {
      socketRooms.delete(socket.id)
      return
    }

    if (room.parent?.id === socket.id) {
      room.parent.connected = false
    }

    if (room.child?.id === socket.id) {
      room.child.connected = false
    }

    socketRooms.delete(socket.id)
    emitRoomUpdated(room)
  })
})

server.listen(port, '0.0.0.0', () => {
  console.log(`Socket.IO service started on http://0.0.0.0:${port}`)
  console.log(`Express health check: http://0.0.0.0:${port}/api/health`)
})
