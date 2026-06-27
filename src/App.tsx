import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { socket } from './lib/socket'

type PlayerRole = 'parent' | 'child'

type Player = {
  id: string
  nickname: string
  connected: boolean
}

type QuestionOption = {
  id: string
  text: string
  empathy?: number
  pressure?: number
  solution?: number
  respect?: number
}

type Question = {
  id: string
  type: 'tacit' | 'emotion'
  mode?: 'parent_guess_child' | 'child_guess_parent'
  title: string
  scene?: string
  question: string
  options: QuestionOption[]
  analysisHint?: string
}

type Scores = {
  ropePosition: number
  tacitScore: number
  empathyScore: number
  pressureScore: number
  consensusScore: number
}

type RoundResult = {
  questionId: string
  title: string
  message: string
  parentAnswerId: string
  childAnswerId: string
  isMatch: boolean
  scores: Scores
}

type GameState = Scores & {
  currentQuestionIndex: number
  answers: Record<string, Partial<Record<PlayerRole, string>>>
  differences: string[]
  emotionWarnings: string[]
  questions: Question[]
  lastRoundResult?: RoundResult
}

type Room = {
  code: string
  parent?: Player
  child?: Player
  status: 'waiting' | 'generating_questions' | 'playing' | 'finished'
  game?: GameState
  isParentReady: boolean
  isChildReady: boolean
}

type QuestionState = {
  question: Question
  currentQuestionIndex: number
  totalQuestions: number
  answeredRoles: PlayerRole[]
  scores: Scores
}

type Page = 'home' | 'create' | 'join' | 'room' | 'game'

const getInitialPage = (): Page => {
  if (window.location.pathname.startsWith('/create')) return 'create'
  if (window.location.pathname.startsWith('/join')) return 'join'
  if (window.location.pathname.startsWith('/room')) return 'room'
  if (window.location.pathname.startsWith('/game')) return 'game'
  return 'home'
}

const getCodeFromUrl = () => {
  const searchCode = new URLSearchParams(window.location.search).get('code')
  if (searchCode) return searchCode.trim().toUpperCase()

  const roomMatch = window.location.pathname.match(/^\/room\/([A-Z0-9]{6})/i)
  const gameMatch = window.location.pathname.match(/^\/game\/([A-Z0-9]{6})/i)
  return roomMatch?.[1]?.toUpperCase() ?? gameMatch?.[1]?.toUpperCase() ?? ''
}

const navigate = (path: string) => window.history.pushState(null, '', path)

const makeJoinUrl = (code: string) =>
  `${window.location.protocol}//${window.location.hostname}:5173/join?code=${code}`

const isLocalHost = () =>
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'

function App() {
  const [page, setPage] = useState<Page>(getInitialPage)
  const [connected, setConnected] = useState(socket.connected)
  const [role, setRole] = useState<PlayerRole | null>(null)
  const [nickname, setNickname] = useState('')
  const [roomCode, setRoomCode] = useState(getCodeFromUrl)
  const [room, setRoom] = useState<Room | null>(null)
  const [questionState, setQuestionState] = useState<QuestionState | null>(null)
  const [selectedAnswerId, setSelectedAnswerId] = useState('')
  const [roundResult, setRoundResult] = useState<RoundResult | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const syncRoute = () => {
      setPage(getInitialPage())
      setRoomCode(getCodeFromUrl())
    }
    const onConnect = () => setConnected(true)
    const onDisconnect = () => setConnected(false)
    const onRoomCreated = (nextRoom: Room) => {
      setRole('parent')
      setRoom(nextRoom)
      setRoomCode(nextRoom.code)
      setPage('room')
      navigate(`/room/${nextRoom.code}`)
    }
    const onRoomUpdated = (nextRoom: Room) => {
      setRoom(nextRoom)
      setRoomCode(nextRoom.code)
    }
    const onGeneratingQuestions = (nextRoom: Room) => {
      setRoom(nextRoom)
      setRoomCode(nextRoom.code)
      setPage('room')
      navigate(`/room/${nextRoom.code}`)
    }
    const onGameStarted = (nextRoom: Room) => {
      setRoom(nextRoom)
      setRoomCode(nextRoom.code)
      setPage('game')
      navigate(`/game/${nextRoom.code}`)
    }
    const onQuestionUpdated = (nextQuestionState: QuestionState) => {
      setQuestionState(nextQuestionState)
      setSelectedAnswerId('')
      setRoundResult(null)
    }
    const onRoundResult = (result: RoundResult) => setRoundResult(result)
    const onGameFinished = (nextRoom: Room) => {
      setRoom(nextRoom)
      setPage('game')
    }
    const onErrorMessage = (message: string) => setError(message)

    window.addEventListener('popstate', syncRoute)
    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('room_created', onRoomCreated)
    socket.on('room_updated', onRoomUpdated)
    socket.on('generating_questions', onGeneratingQuestions)
    socket.on('game_started', onGameStarted)
    socket.on('question_updated', onQuestionUpdated)
    socket.on('round_result', onRoundResult)
    socket.on('game_finished', onGameFinished)
    socket.on('error_message', onErrorMessage)
    socket.connect()

    return () => {
      window.removeEventListener('popstate', syncRoute)
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('room_created', onRoomCreated)
      socket.off('room_updated', onRoomUpdated)
      socket.off('generating_questions', onGeneratingQuestions)
      socket.off('game_started', onGameStarted)
      socket.off('question_updated', onQuestionUpdated)
      socket.off('round_result', onRoundResult)
      socket.off('game_finished', onGameFinished)
      socket.off('error_message', onErrorMessage)
    }
  }, [])

  const activeCode = room?.code ?? roomCode
  const joinUrl = activeCode ? makeJoinUrl(activeCode) : ''
  const activeQuestion = questionState?.question ?? room?.game?.questions[room.game.currentQuestionIndex]
  const scores = roundResult?.scores ?? questionState?.scores ?? room?.game
  const answeredRoles = questionState?.answeredRoles ?? []
  const hasAnswered = role ? answeredRoles.includes(role) || Boolean(selectedAnswerId && roundResult) : false
  const waitingForOther = Boolean(selectedAnswerId && !roundResult)
  const canStart = useMemo(
    () => role === 'parent' && Boolean(room?.isParentReady && room.isChildReady),
    [role, room],
  )

  const goTo = (nextPage: Page, path: string) => {
    setError('')
    setPage(nextPage)
    navigate(path)
    if (nextPage === 'join') setRoomCode(getCodeFromUrl())
  }

  const createRoom = () => {
    setError('')
    socket.emit('create_room', { nickname })
  }

  const joinRoom = () => {
    const normalizedCode = roomCode.trim().toUpperCase()
    setError('')
    setRoomCode(normalizedCode)
    setRole('child')
    socket.emit('join_room', { code: normalizedCode, nickname })
    setPage('room')
    navigate(`/room/${normalizedCode}`)
  }

  const startGame = () => {
    if (!activeCode) return
    setError('')
    socket.emit('start_game', { code: activeCode })
  }

  const submitAnswer = () => {
    if (!activeCode || !activeQuestion || !role || !selectedAnswerId) return
    socket.emit('submit_answer', {
      code: activeCode,
      role,
      questionId: activeQuestion.id,
      answerId: selectedAnswerId,
    })
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_18%_12%,rgba(45,212,191,0.24),transparent_28%),radial-gradient(circle_at_82%_20%,rgba(125,92,255,0.18),transparent_30%),linear-gradient(135deg,#080f1f_0%,#111827_52%,#171717_100%)] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-6 sm:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
          <button
            type="button"
            onClick={() => goTo('home', '/')}
            className="text-left text-sm font-semibold text-teal-200"
          >
            AI 亲子活动 MVP
          </button>
          <StatusPill connected={connected} />
        </header>

        {page === 'home' && (
          <section className="flex flex-1 items-center py-10">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-teal-200">
                tacit understanding · emotion · family insight
              </p>
              <h1 className="mt-5 text-4xl font-bold leading-tight sm:text-6xl">
                谁更懂谁：AI 亲子默契拔河
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
                一场关于默契、情绪与理解的亲子双人游戏
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => goTo('create', '/create')}
                  className="h-12 rounded bg-teal-400 px-6 font-semibold text-slate-950 transition hover:bg-teal-300"
                >
                  我是家长，创建房间
                </button>
                <button
                  type="button"
                  onClick={() => goTo('join', '/join')}
                  className="h-12 rounded border border-white/20 bg-white/10 px-6 font-semibold text-white transition hover:bg-white/15"
                >
                  我是孩子，加入房间
                </button>
              </div>
            </div>
          </section>
        )}

        {page === 'create' && (
          <FormPanel
            title="家长创建房间"
            description="输入家长昵称，服务端会生成 6 位大写字母数字房间码。"
          >
            <TextInput value={nickname} onChange={setNickname} placeholder="家长昵称" />
            <button
              type="button"
              onClick={createRoom}
              disabled={!connected}
              className="h-12 rounded bg-teal-400 px-5 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-500"
            >
              创建房间
            </button>
          </FormPanel>
        )}

        {page === 'join' && (
          <FormPanel title="孩子加入房间" description="输入昵称；如果扫码进入，房间码会自动填好。">
            <TextInput value={nickname} onChange={setNickname} placeholder="孩子昵称" />
            <TextInput value={roomCode} onChange={setRoomCode} placeholder="房间码" upperCase />
            <button
              type="button"
              onClick={joinRoom}
              disabled={!connected || roomCode.trim().length !== 6}
              className="h-12 rounded bg-teal-400 px-5 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-500"
            >
              加入房间
            </button>
          </FormPanel>
        )}

        {page === 'room' && (
          <section className="grid flex-1 items-center gap-4 py-8 lg:grid-cols-[1fr_340px]">
            <div className="rounded border border-white/10 bg-white/10 p-5 shadow-2xl shadow-black/20 backdrop-blur">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-teal-200">等待房间</p>
                  <h2 className="mt-2 font-mono text-5xl font-bold tracking-[0.18em]">
                    {activeCode || '------'}
                  </h2>
                </div>
                <div className="rounded border border-white/10 bg-slate-950/35 px-4 py-3 text-sm text-slate-200">
                  当前连接状态：{connected ? '已连接' : '未连接'}
                </div>
              </div>

              <div className="mt-8 grid gap-4 md:grid-cols-2">
                <PlayerCard title="家长是否已加入" player={room?.parent} />
                <PlayerCard title="孩子是否已加入" player={room?.child} />
              </div>

              <div className="mt-6 rounded border border-white/10 bg-slate-950/30 p-4 text-sm text-slate-300">
                房间状态：{room?.status ?? 'waiting'}
              </div>

              {room?.status === 'generating_questions' && (
                <div className="mt-4 rounded border border-teal-300/40 bg-teal-300/15 p-4 font-semibold text-teal-100">
                  AI 正在生成本局亲子题目……
                </div>
              )}

              {role === 'parent' && (
                <button
                  type="button"
                  onClick={startGame}
                  disabled={!canStart || room?.status === 'generating_questions'}
                  className="mt-6 h-12 rounded bg-teal-400 px-6 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-500 disabled:text-slate-300"
                >
                  开始游戏
                </button>
              )}
            </div>

            <QrPanel activeCode={activeCode} joinUrl={joinUrl} />
          </section>
        )}

        {page === 'game' && (
          <section className="flex flex-1 items-center py-8">
            <div className="w-full rounded border border-white/10 bg-white/10 p-5 shadow-2xl shadow-black/20 backdrop-blur">
              {room?.status === 'finished' ? (
                <FinishedView room={room} />
              ) : (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-teal-200">游戏进行中</p>
                      <h2 className="mt-2 text-3xl font-bold">{activeQuestion?.title ?? '读取题目中'}</h2>
                    </div>
                    <div className="rounded border border-white/10 bg-slate-950/35 px-4 py-3 text-sm text-slate-200">
                      当前题号：
                      {(questionState?.currentQuestionIndex ?? room?.game?.currentQuestionIndex ?? 0) + 1}/
                      {questionState?.totalQuestions ?? room?.game?.questions.length ?? 10}
                    </div>
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    <PlayerCard title="家长" player={room?.parent} />
                    <PlayerCard title="孩子" player={room?.child} />
                  </div>

                  <ScoreBar scores={scores} />

                  <div className="mt-6 rounded border border-white/10 bg-slate-950/30 p-5">
                    <p className="text-sm font-semibold text-teal-200">
                      {activeQuestion?.type === 'emotion' ? '情绪题' : '默契题'}
                    </p>
                    {activeQuestion?.scene && (
                      <p className="mt-3 rounded bg-white/10 p-3 text-sm leading-6 text-slate-300">
                        {activeQuestion.scene}
                      </p>
                    )}
                    <h3 className="mt-3 text-2xl font-bold leading-snug">
                      {activeQuestion?.question ?? '正在读取题目……'}
                    </h3>
                    <div className="mt-5 grid gap-3">
                      {(activeQuestion?.options ?? []).map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setSelectedAnswerId(option.id)}
                          disabled={hasAnswered || Boolean(roundResult)}
                          className={`rounded border px-4 py-3 text-left text-slate-100 transition ${
                            selectedAnswerId === option.id
                              ? 'border-teal-300 bg-teal-300/20'
                              : 'border-white/10 bg-white/10 hover:bg-white/15'
                          } disabled:cursor-not-allowed disabled:opacity-70`}
                        >
                          <span className="font-semibold">{option.id}. </span>
                          {option.text}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={submitAnswer}
                      disabled={!selectedAnswerId || hasAnswered || Boolean(roundResult)}
                      className="mt-5 h-12 rounded bg-teal-400 px-6 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-500 disabled:text-slate-300"
                    >
                      {waitingForOther ? '等待对方选择' : '提交答案'}
                    </button>
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    <AnswerWaitCard label="家长答题状态" answered={answeredRoles.includes('parent')} />
                    <AnswerWaitCard label="孩子答题状态" answered={answeredRoles.includes('child')} />
                  </div>

                  {roundResult && (
                    <div className="mt-6 rounded border border-teal-300/40 bg-teal-300/15 p-4">
                      <p className="text-lg font-bold text-teal-100">{roundResult.message}</p>
                      <p className="mt-2 text-sm text-slate-200">2 秒后自动进入下一题。</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>
        )}

        {error && (
          <div className="fixed bottom-4 left-1/2 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded border border-rose-300/40 bg-rose-950/90 px-4 py-3 text-sm text-rose-100 shadow-xl">
            {error}
          </div>
        )}
      </div>
    </main>
  )
}

function StatusPill({ connected }: { connected: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded border border-white/15 bg-white/10 px-3 py-2 text-sm text-slate-200">
      <span className={`h-2.5 w-2.5 rounded-full ${connected ? 'bg-teal-300' : 'bg-rose-400'}`} />
      <span>{connected ? 'Socket.IO 服务已连接' : '正在连接后端'}</span>
    </div>
  )
}

function FormPanel({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
      <p className="text-sm font-semibold text-teal-200">{title}</p>
      <h2 className="mt-3 text-3xl font-bold">{description}</h2>
      <div className="mt-6 flex flex-col gap-3">{children}</div>
    </section>
  )
}

function TextInput({
  value,
  onChange,
  placeholder,
  upperCase = false,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  upperCase?: boolean
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(upperCase ? event.target.value.toUpperCase() : event.target.value)}
      className="h-12 rounded border border-white/15 bg-white/10 px-4 text-base text-white outline-none placeholder:text-slate-400 focus:border-teal-300"
      placeholder={placeholder}
    />
  )
}

function QrPanel({ activeCode, joinUrl }: { activeCode: string; joinUrl: string }) {
  return (
    <aside className="rounded border border-white/10 bg-white/10 p-5 shadow-2xl shadow-black/20 backdrop-blur">
      <p className="text-sm font-semibold text-teal-200">微信扫码加入</p>
      {activeCode ? (
        <>
          {isLocalHost() && (
            <div className="mt-4 rounded border border-amber-300/70 bg-amber-300/15 p-3 text-sm leading-6 text-amber-100">
              当前是 localhost，手机微信扫码可能无法打开。请用电脑局域网 IP 访问本页面后再扫码。
            </div>
          )}
          <div className="mt-4 flex justify-center rounded bg-white p-4">
            <QRCodeSVG value={joinUrl} size={240} />
          </div>
          <p className="mt-3 break-all rounded border border-white/10 bg-slate-950/35 p-3 font-mono text-xs leading-5 text-slate-300">
            {joinUrl}
          </p>
        </>
      ) : (
        <p className="mt-4 text-sm leading-6 text-slate-300">创建房间后会显示二维码。</p>
      )}
    </aside>
  )
}

function PlayerCard({ title, player }: { title: string; player?: Player }) {
  return (
    <div className="rounded border border-white/10 bg-slate-950/30 p-4">
      <p className="text-sm text-slate-400">{title}</p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-xl font-semibold">{player?.nickname ?? '等待中'}</span>
        <span className={player?.connected ? 'text-teal-200' : 'text-slate-500'}>
          {player?.connected ? '已加入' : '未加入'}
        </span>
      </div>
    </div>
  )
}

function AnswerWaitCard({ label, answered }: { label: string; answered: boolean }) {
  return (
    <div className="rounded border border-white/10 bg-slate-950/30 p-4">
      <p className="text-sm text-slate-400">{label}</p>
      <p className={answered ? 'mt-2 font-semibold text-teal-200' : 'mt-2 font-semibold text-amber-100'}>
        {answered ? '已答题' : '等待答题'}
      </p>
    </div>
  )
}

function ScoreBar({ scores }: { scores?: Partial<Scores> }) {
  const ropePosition = Math.max(-100, Math.min(100, scores?.ropePosition ?? 0))
  return (
    <div className="mt-6 rounded border border-white/10 bg-slate-950/30 p-4">
      <div className="relative h-3 rounded-full bg-slate-700">
        <div className="absolute left-1/2 top-[-6px] h-6 w-px bg-white/50" />
        <div
          className="absolute top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-teal-300 shadow-lg shadow-teal-950/50 transition-all duration-700"
          style={{ left: `calc(50% + ${ropePosition / 2}%)` }}
        />
      </div>
      <div className="mt-4 grid gap-2 text-sm text-slate-300 sm:grid-cols-4">
        <span>默契 {scores?.tacitScore ?? 0}</span>
        <span>共情 {scores?.empathyScore ?? 0}</span>
        <span>压力 {scores?.pressureScore ?? 0}</span>
        <span>共识 {scores?.consensusScore ?? 0}</span>
      </div>
    </div>
  )
}

function FinishedView({ room }: { room: Room }) {
  const game = room.game
  return (
    <div>
      <p className="text-sm font-semibold text-teal-200">游戏结束</p>
      <h2 className="mt-2 text-3xl font-bold">已完成 10 题，进入报告阶段</h2>
      <ScoreBar scores={game} />
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded border border-white/10 bg-slate-950/30 p-4">
          <p className="font-semibold text-slate-100">发现的差异</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-300">
            {(game?.differences.length ? game.differences : ['本局暂未记录明显认知差异。']).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="rounded border border-white/10 bg-slate-950/30 p-4">
          <p className="font-semibold text-slate-100">情绪提醒</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-300">
            {(game?.emotionWarnings.length ? game.emotionWarnings : ['本局暂未触发高压力提醒。']).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

export default App
