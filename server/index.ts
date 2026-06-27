import express from 'express'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Server } from 'socket.io'
import { generateFamilyReport, generateQuestions } from './src/aiService.js'
import type { Question } from './src/mockQuestions.js'
import type { Report, ReportGameState } from './src/reportGenerator.js'

type PlayerRole = 'parent' | 'child'

type Player = {
  id: string
  nickname: string
  connected: boolean
}

type RoundResult = {
  questionId: string
  title: string
  message: string
  parentAnswerId: string
  childAnswerId: string
  isMatch: boolean
  scores: Pick<
    GameState,
    'ropePosition' | 'tacitScore' | 'empathyScore' | 'pressureScore' | 'consensusScore'
  >
}

type GameState = {
  currentQuestionIndex: number
  answers: Record<string, Partial<Record<PlayerRole, string>>>
  ropePosition: number
  tacitScore: number
  empathyScore: number
  pressureScore: number
  consensusScore: number
  differences: string[]
  emotionWarnings: string[]
  questions: Question[]
  lastRoundResult?: RoundResult
  report?: Report
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
app.set('trust proxy', true)
const server = http.createServer(app)
const io = new Server(server, {
  cors: {
    origin: true,
    methods: ['GET', 'POST'],
  },
})

const port = Number(process.env.PORT ?? 3001)
const isProduction = process.env.NODE_ENV === 'production'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const clientDistPath = path.resolve(__dirname, '../../dist')
const rooms = new Map<string, Room>()
const socketRooms = new Map<string, string>()
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

const getLanIp = () => {
  const interfaces = os.networkInterfaces()
  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) return address.address
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

const createInitialGameState = (questions: Question[]): GameState => ({
  currentQuestionIndex: 0,
  answers: {},
  ropePosition: 0,
  tacitScore: 0,
  empathyScore: 0,
  pressureScore: 0,
  consensusScore: 0,
  differences: [],
  emotionWarnings: [],
  questions,
})

const toClientRoom = (room: Room): ClientRoom => ({
  ...room,
  isParentReady: Boolean(room.parent?.connected),
  isChildReady: Boolean(room.child?.connected),
})

const currentQuestion = (room: Room) => room.game?.questions[room.game.currentQuestionIndex]

const emitRoomUpdated = (room: Room) => {
  io.to(room.code).emit('room_updated', toClientRoom(room))
}

const emitCurrentQuestion = (room: Room) => {
  const game = room.game
  const question = currentQuestion(room)
  if (!game || !question) return

  const answers = game.answers[question.id] ?? {}
  io.to(room.code).emit('question_updated', {
    question,
    currentQuestionIndex: game.currentQuestionIndex,
    totalQuestions: game.questions.length,
    answeredRoles: Object.keys(answers),
    scores: {
      ropePosition: game.ropePosition,
      tacitScore: game.tacitScore,
      empathyScore: game.empathyScore,
      pressureScore: game.pressureScore,
      consensusScore: game.consensusScore,
    },
  })
}

const getRoleForSocket = (room: Room, socketId: string): PlayerRole | null => {
  if (room.parent?.id === socketId) return 'parent'
  if (room.child?.id === socketId) return 'child'
  return null
}

const moveRopeTowardCenter = (position: number) => {
  if (position > 0) return Math.max(0, position - 15)
  if (position < 0) return Math.min(0, position + 15)
  return 0
}

const findOption = (question: Question, answerId: string) =>
  question.options.find((option) => option.id === answerId)

const settleRound = (room: Room, question: Question, answers: Record<PlayerRole, string>) => {
  const game = room.game
  if (!game) return

  const isMatch = answers.parent === answers.child
  let message = ''

  if (question.type === 'tacit') {
    if (isMatch) {
      game.tacitScore += 20
      game.consensusScore += 10
      game.ropePosition = moveRopeTowardCenter(game.ropePosition)
      message = '默契共鸣'
    } else {
      const parentOption = findOption(question, answers.parent)?.text ?? answers.parent
      const childOption = findOption(question, answers.child)?.text ?? answers.child
      game.differences.push(`${question.title}：家长选择「${parentOption}」，孩子选择「${childOption}」`)
      game.ropePosition -= 10
      message = '发现认知差异'
    }
  } else {
    const parentOption = findOption(question, answers.parent)
    const empathy = parentOption?.empathy ?? 0
    const pressure = parentOption?.pressure ?? 0
    const solution = parentOption?.solution ?? 0
    const respect = parentOption?.respect ?? 0

    game.empathyScore += empathy
    game.pressureScore += pressure
    game.consensusScore += Math.round((solution + respect) / 2)

    if (isMatch) {
      game.tacitScore += 5
      game.consensusScore += 10
      message = '表达被接住了'
    } else {
      message = '表达选择已记录'
    }

    if (pressure >= 7 && empathy <= 4) {
      game.emotionWarnings.push(`${question.title}：高压力低共情表达可能让压力上升`)
      message = '这句话可能让压力上升'
      game.ropePosition -= 10
    } else if (isMatch) {
      game.ropePosition = moveRopeTowardCenter(game.ropePosition)
    }
  }

  game.lastRoundResult = {
    questionId: question.id,
    title: question.title,
    message,
    parentAnswerId: answers.parent,
    childAnswerId: answers.child,
    isMatch,
    scores: {
      ropePosition: game.ropePosition,
      tacitScore: game.tacitScore,
      empathyScore: game.empathyScore,
      pressureScore: game.pressureScore,
      consensusScore: game.consensusScore,
    },
  }
}

const makeReportState = (room: Room): ReportGameState => {
  const game = room.game
  if (!game) throw new Error('Missing game state')

  return {
    parentNickname: room.parent?.nickname ?? '家长',
    childNickname: room.child?.nickname ?? '孩子',
    tacitScore: game.tacitScore,
    empathyScore: game.empathyScore,
    pressureScore: game.pressureScore,
    consensusScore: game.consensusScore,
    ropePosition: game.ropePosition,
    differences: game.differences,
    emotionWarnings: game.emotionWarnings,
    questions: game.questions,
    answers: game.answers,
  }
}

const finishGame = async (room: Room) => {
  if (!room.game) return

  room.status = 'finished'
  emitRoomUpdated(room)
  const report = await generateFamilyReport(makeReportState(room))
  room.game.report = report
  emitRoomUpdated(room)
  io.to(room.code).emit('report_ready', toClientRoom(room))
  io.to(room.code).emit('game_finished', toClientRoom(room))
}

const advanceAfterRound = (room: Room) => {
  setTimeout(() => {
    const game = room.game
    if (!game) return

    if (game.currentQuestionIndex >= game.questions.length - 1) {
      void finishGame(room)
      return
    }

    game.currentQuestionIndex += 1
    emitRoomUpdated(room)
    emitCurrentQuestion(room)
  }, 2000)
}

app.get('/api/health', (req, res) => {
  const requestOrigin = `${req.protocol}://${req.get('host')}`

  res.json({
    ok: true,
    service: 'ai-parent-child-tug',
    socket: 'started',
    serverOrigin: isProduction ? requestOrigin : `http://${getLanIp()}:${port}`,
  })
})

if (isProduction) {
  app.use(express.static(clientDistPath))
  app.use((req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      next()
      return
    }

    res.sendFile(path.join(clientDistPath, 'index.html'))
  })
}

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

    if (room.child?.connected && room.child.id !== socket.id) {
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

  socket.on('start_game', async (payload: { code?: string }) => {
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

    const questions = await generateQuestions({
      gameTitle: '谁更懂谁：AI 亲子默契拔河',
      target: '亲子活动现场',
      totalQuestions: 10,
      tacitCount: 5,
      emotionCount: 5,
      ageRange: '小学高年级到初中',
      style: '温和、真实、有活动展示感',
    })

    room.game = createInitialGameState(questions)
    room.status = 'playing'
    emitRoomUpdated(room)
    io.to(room.code).emit('game_started', toClientRoom(room))
    emitCurrentQuestion(room)
  })

  socket.on(
    'submit_answer',
    (payload: { code?: string; role?: PlayerRole; questionId?: string; answerId?: string }) => {
      const code = normalizeCode(payload.code ?? '')
      const room = rooms.get(code)

      if (!room || !room.game) {
        socket.emit('error_message', '游戏尚未开始')
        return
      }

      const actualRole = getRoleForSocket(room, socket.id)
      if (!actualRole || actualRole !== payload.role) {
        socket.emit('error_message', '答题身份不匹配')
        return
      }

      const question = currentQuestion(room)
      if (!question || question.id !== payload.questionId || !payload.answerId) {
        socket.emit('error_message', '当前题目不匹配')
        return
      }

      if (!question.options.some((option) => option.id === payload.answerId)) {
        socket.emit('error_message', '答案不存在')
        return
      }

      const questionAnswers = room.game.answers[question.id] ?? {}
      questionAnswers[actualRole] = payload.answerId
      room.game.answers[question.id] = questionAnswers

      io.to(room.code).emit('answer_submitted', {
        questionId: question.id,
        role: actualRole,
      })
      emitCurrentQuestion(room)

      if (questionAnswers.parent && questionAnswers.child) {
        settleRound(room, question, questionAnswers as Record<PlayerRole, string>)
        emitRoomUpdated(room)
        io.to(room.code).emit('round_result', room.game.lastRoundResult)
        advanceAfterRound(room)
      }
    },
  )

  socket.on('disconnect', () => {
    const code = socketRooms.get(socket.id)
    if (!code) return

    const room = rooms.get(code)
    if (!room) {
      socketRooms.delete(socket.id)
      return
    }

    if (room.parent?.id === socket.id) room.parent.connected = false
    if (room.child?.id === socket.id) room.child.connected = false

    socketRooms.delete(socket.id)
    emitRoomUpdated(room)
  })
})

server.listen(port, '0.0.0.0', () => {
  console.log(`Socket.IO service started on http://0.0.0.0:${port}`)
  console.log(`Express health check: http://0.0.0.0:${port}/api/health`)
})
