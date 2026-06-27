import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from 'recharts'
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

type Report = {
  summary: string
  endingType: '高共鸣结局' | '需要更多倾听' | '认知差异明显'
  radarScores: { name: string; value: number }[]
  differenceAnalysis: {
    question: string
    parentAnswer: string
    childAnswer: string
    analysis: string
  }[]
  emotionAnalysis: string
  suggestions: string[]
  familyChallenge: string
  source: 'ai' | 'rule'
}

type GameState = Scores & {
  currentQuestionIndex: number
  answers: Record<string, Partial<Record<PlayerRole, string>>>
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

type Page = 'home' | 'create' | 'join' | 'room' | 'game' | 'report'

const getInitialPage = (): Page => {
  if (window.location.pathname.startsWith('/create')) return 'create'
  if (window.location.pathname.startsWith('/join')) return 'join'
  if (window.location.pathname.startsWith('/room')) return 'room'
  if (window.location.pathname.startsWith('/game')) return 'game'
  if (window.location.pathname.startsWith('/report')) return 'report'
  return 'home'
}

const getCodeFromUrl = () => {
  const searchCode = new URLSearchParams(window.location.search).get('code')
  if (searchCode) return searchCode.trim().toUpperCase()

  const roomMatch = window.location.pathname.match(/^\/room\/([A-Z0-9]{6})/i)
  const gameMatch = window.location.pathname.match(/^\/game\/([A-Z0-9]{6})/i)
  const reportMatch = window.location.pathname.match(/^\/report\/([A-Z0-9]{6})/i)
  return (
    roomMatch?.[1]?.toUpperCase() ??
    gameMatch?.[1]?.toUpperCase() ??
    reportMatch?.[1]?.toUpperCase() ??
    ''
  )
}

const navigate = (path: string) => window.history.pushState(null, '', path)

const makeJoinUrl = (code: string) =>
  `${window.location.protocol}//${window.location.hostname}:5173/join?code=${code}`

const isLocalHost = () =>
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'

const resultCopy = (result: RoundResult | null) => {
  if (!result) return ''
  if (result.message.includes('默契') || result.isMatch) return '你们想到一起啦！'
  if (result.message.includes('压力')) return 'AI 小裁判：这句话可以更温柔哦'
  if (result.message.includes('接住')) return '表达被接住啦！'
  return '这里有一点小不同，可以聊聊哦！'
}

const endingDisplay = {
  高共鸣结局: '你们很会接住彼此',
  需要更多倾听: '有些想法值得再聊聊',
  认知差异明显: '你们发现了新的理解入口',
} satisfies Record<Report['endingType'], string>

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
      setPage('report')
      navigate(`/report/${nextRoom.code}`)
    }
    const onReportReady = (nextRoom: Room) => {
      setRoom(nextRoom)
      setRoomCode(nextRoom.code)
      setPage('report')
      navigate(`/report/${nextRoom.code}`)
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
    socket.on('report_ready', onReportReady)
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
      socket.off('report_ready', onReportReady)
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
    <main className="min-h-screen overflow-x-hidden bg-[#fff8ed] text-stone-800">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_15%_12%,rgba(255,183,77,0.36),transparent_28%),radial-gradient(circle_at_85%_18%,rgba(125,211,252,0.34),transparent_30%),radial-gradient(circle_at_40%_86%,rgba(134,239,172,0.28),transparent_26%),linear-gradient(135deg,#fffaf0_0%,#fff0d8_52%,#ffe6d6_100%)]" />
      <div className="pointer-events-none fixed inset-0 -z-10 opacity-70">
        <span className="confetti left-[8%] top-[14%] bg-orange-300" />
        <span className="confetti left-[78%] top-[12%] bg-sky-300 rotate-12" />
        <span className="confetti left-[16%] top-[78%] bg-emerald-300 -rotate-6" />
        <span className="confetti left-[86%] top-[70%] bg-pink-300 rotate-45" />
      </div>

      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-4 sm:px-6">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-[28px] border border-orange-100 bg-white/75 px-4 py-3 shadow-[0_18px_50px_rgba(251,146,60,0.16)] backdrop-blur">
          <button
            type="button"
            onClick={() => goTo('home', '/')}
            className="flex min-h-12 items-center gap-2 text-left font-black text-orange-600"
          >
            <span className="ai-referee-badge">AI</span>
            <span>亲子默契挑战赛</span>
          </button>
          <StatusPill connected={connected} />
        </header>

        {page === 'home' && (
          <HomePage goCreate={() => goTo('create', '/create')} goJoin={() => goTo('join', '/join')} />
        )}

        {page === 'create' && (
          <CreatePage
            nickname={nickname}
            setNickname={setNickname}
            connected={connected}
            createRoom={createRoom}
          />
        )}

        {page === 'join' && (
          <JoinPage
            nickname={nickname}
            setNickname={setNickname}
            roomCode={roomCode}
            setRoomCode={setRoomCode}
            connected={connected}
            joinRoom={joinRoom}
          />
        )}

        {page === 'room' && (
          <RoomPage
            activeCode={activeCode}
            connected={connected}
            room={room}
            role={role}
            canStart={canStart}
            joinUrl={joinUrl}
            startGame={startGame}
          />
        )}

        {page === 'game' && (
          <GamePage
            room={room}
            activeQuestion={activeQuestion}
            questionState={questionState}
            scores={scores}
            answeredRoles={answeredRoles}
            selectedAnswerId={selectedAnswerId}
            setSelectedAnswerId={setSelectedAnswerId}
            hasAnswered={hasAnswered}
            waitingForOther={waitingForOther}
            roundResult={roundResult}
            submitAnswer={submitAnswer}
          />
        )}

        {page === 'report' && <ReportView room={room} onRestart={() => goTo('home', '/')} />}

        {error && (
          <div className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-3xl border border-rose-200 bg-white px-5 py-4 text-sm font-semibold text-rose-700 shadow-2xl">
            {error}
          </div>
        )}
      </div>
    </main>
  )
}

function HomePage({ goCreate, goJoin }: { goCreate: () => void; goJoin: () => void }) {
  return (
    <section className="grid flex-1 items-center gap-6 py-8 lg:grid-cols-[1.05fr_0.95fr]">
      <div className="relative">
        <div className="show-badge w-fit rotate-[-2deg]">家庭默契挑战赛 · 今日开场</div>
        <h1 className="gradient-title mt-5 text-5xl leading-none sm:text-7xl">
          谁更懂谁
          <span className="mt-2 block text-3xl sm:text-5xl">AI 亲子默契拔河</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg font-semibold leading-8 text-stone-600">
          扫码组队，一起完成一场关于理解的默契挑战。
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button type="button" onClick={goCreate} className="soft-button min-h-14 px-7 text-lg">
            我是家长｜创建挑战房
          </button>
          <button type="button" onClick={goJoin} className="kid-button min-h-14 px-7 text-lg">
            我是孩子｜扫码/输入房间码
          </button>
        </div>
      </div>

      <div className="warm-card relative p-5 sm:p-6">
        <AIReferee text="AI 小裁判已就位，准备记录你们的共鸣点！" />
        <RopeIllustration />
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <FeatureBadge color="orange" label="默契题" />
          <FeatureBadge color="blue" label="情绪题" />
          <FeatureBadge color="green" label="观察报告" />
        </div>
      </div>
    </section>
  )
}

function CreatePage({
  nickname,
  setNickname,
  connected,
  createRoom,
}: {
  nickname: string
  setNickname: (value: string) => void
  connected: boolean
  createRoom: () => void
}) {
  return (
    <section className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center py-8">
      <div className="warm-card host-panel p-5 sm:p-7">
        <AIReferee text="主持台提示：创建后把二维码给孩子扫一扫就能组队。" />
        <h1 className="mt-5 text-3xl font-black text-orange-600 sm:text-4xl">家长主持台</h1>
        <p className="mt-3 leading-7 text-stone-600">输入昵称，创建一间温暖又有挑战感的默契房。</p>
        <div className="mt-6 space-y-3">
          <TextInput value={nickname} onChange={setNickname} placeholder="家长昵称" />
          <button
            type="button"
            onClick={createRoom}
            disabled={!connected}
            className="soft-button min-h-14 w-full text-lg disabled:cursor-not-allowed disabled:opacity-60"
          >
            创建默契挑战房
          </button>
        </div>
      </div>
    </section>
  )
}

function JoinPage({
  nickname,
  setNickname,
  roomCode,
  setRoomCode,
  connected,
  joinRoom,
}: {
  nickname: string
  setNickname: (value: string) => void
  roomCode: string
  setRoomCode: (value: string) => void
  connected: boolean
  joinRoom: () => void
}) {
  return (
    <section className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-8">
      <div className="warm-card border-sky-200 p-5 sm:p-6">
        <div className="show-badge w-fit bg-sky-100 text-sky-700">孩子操作端</div>
        <h1 className="mt-4 text-3xl font-black text-sky-600">加入挑战！</h1>
        <p className="mt-2 text-base font-semibold text-stone-600">少填一点，马上开玩。</p>
        {roomCode && (
          <div className="mt-4 rounded-3xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center font-black text-emerald-700">
            房间码已准备好！
          </div>
        )}
        <div className="mt-5 space-y-3">
          <TextInput value={nickname} onChange={setNickname} placeholder="你的昵称" large />
          <TextInput value={roomCode} onChange={setRoomCode} placeholder="房间码" upperCase large />
          <button
            type="button"
            onClick={joinRoom}
            disabled={!connected || roomCode.trim().length !== 6}
            className="kid-button min-h-14 w-full text-xl disabled:cursor-not-allowed disabled:opacity-60"
          >
            加入挑战！
          </button>
        </div>
      </div>
    </section>
  )
}

function RoomPage({
  activeCode,
  connected,
  room,
  role,
  canStart,
  joinUrl,
  startGame,
}: {
  activeCode: string
  connected: boolean
  room: Room | null
  role: PlayerRole | null
  canStart: boolean
  joinUrl: string
  startGame: () => void
}) {
  const childReady = Boolean(room?.child?.connected)
  return (
    <section className="grid flex-1 items-center gap-5 py-6 lg:grid-cols-[1fr_360px]">
      <div className="warm-card host-panel p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="show-badge w-fit">主持台等待区</p>
            <h1 className="mt-4 text-3xl font-black text-orange-600">扫码入场，准备拔河</h1>
          </div>
          <div className="ticket-code">{activeCode || '------'}</div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <RoomStatus title="家长已就位" player={room?.parent} tone="orange" />
          <RoomStatus title="孩子入场" player={room?.child} tone="blue" />
          <div className="rounded-[28px] border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-bold text-emerald-700">AI 小裁判</p>
            <p className="mt-3 text-lg font-black text-emerald-800">
              {room?.status === 'generating_questions' ? '正在出题' : '准备中'}
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-[28px] border border-orange-100 bg-orange-50 p-4 text-center font-black text-orange-700">
          {room?.status === 'generating_questions'
            ? 'AI 正在生成本局亲子题目……'
            : childReady
              ? '组队成功，可以开始挑战啦！'
              : '等待孩子扫码入场……'}
        </div>

        {role === 'parent' && (
          <button
            type="button"
            onClick={startGame}
            disabled={!canStart || room?.status === 'generating_questions'}
            className="soft-button mt-6 min-h-14 w-full text-xl disabled:cursor-not-allowed disabled:opacity-60"
          >
            开始默契拔河！
          </button>
        )}
        <p className="mt-4 text-center text-sm font-semibold text-stone-500">
          当前连接状态：{connected ? '已连接' : '正在连接'}
        </p>
      </div>

      <RoomQRCode activeCode={activeCode} joinUrl={joinUrl} />
    </section>
  )
}

function GamePage({
  room,
  activeQuestion,
  questionState,
  scores,
  answeredRoles,
  selectedAnswerId,
  setSelectedAnswerId,
  hasAnswered,
  waitingForOther,
  roundResult,
  submitAnswer,
}: {
  room: Room | null
  activeQuestion?: Question
  questionState: QuestionState | null
  scores?: Partial<Scores>
  answeredRoles: PlayerRole[]
  selectedAnswerId: string
  setSelectedAnswerId: (value: string) => void
  hasAnswered: boolean
  waitingForOther: boolean
  roundResult: RoundResult | null
  submitAnswer: () => void
}) {
  if (room?.status === 'finished') {
    return <ReportLoadingCard />
  }

  return (
    <section className="flex flex-1 items-center py-5">
      <div className="w-full space-y-4">
        <RopeArena scores={scores} parent={room?.parent} child={room?.child} />

        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <QuestionCard
            question={activeQuestion}
            current={(questionState?.currentQuestionIndex ?? room?.game?.currentQuestionIndex ?? 0) + 1}
            total={questionState?.totalQuestions ?? room?.game?.questions.length ?? 10}
            selectedAnswerId={selectedAnswerId}
            setSelectedAnswerId={setSelectedAnswerId}
            hasAnswered={hasAnswered}
            roundResult={roundResult}
            waitingForOther={waitingForOther}
            submitAnswer={submitAnswer}
          />

          <div className="space-y-4">
            <PlayerPanel title="家长侧" player={room?.parent} answered={answeredRoles.includes('parent')} tone="orange" />
            <PlayerPanel title="孩子侧" player={room?.child} answered={answeredRoles.includes('child')} tone="blue" />
            <AIReferee text={roundResult ? resultCopy(roundResult) : 'AI 小裁判正在观察你们的理解点。'} />
          </div>
        </div>

        {roundResult && <ResultToast result={roundResult} />}
      </div>
    </section>
  )
}

function ReportView({ room, onRestart }: { room: Room | null; onRestart: () => void }) {
  const game = room?.game
  const report = game?.report

  if (!report || !game) return <ReportLoadingCard />

  return (
    <section className="flex flex-1 items-center py-6">
      <div className="w-full space-y-5">
        <div className="warm-card p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="show-badge w-fit">亲子默契观察报告</p>
              <h1 className="mt-4 text-3xl font-black text-orange-600 sm:text-5xl">
                {endingDisplay[report.endingType]}
              </h1>
              <p className="mt-4 max-w-3xl leading-8 text-stone-600">{report.summary}</p>
            </div>
            <button type="button" onClick={onRestart} className="soft-button min-h-12 px-6">
              重新开始
            </button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <MetricCard label="默契值" value={game.tacitScore} tone="orange" />
          <MetricCard label="共情值" value={game.empathyScore} tone="green" />
          <MetricCard label="压力温度" value={game.pressureScore} tone="pink" />
          <MetricCard label="沟通共识度" value={game.consensusScore} tone="blue" />
        </div>

        <div className="grid gap-5 lg:grid-cols-[370px_1fr]">
          <RadarReport report={report} />
          <div className="space-y-4">
            <ReportBlock title="小小差异">
              <div className="space-y-3">
                {report.differenceAnalysis.map((item) => (
                  <div key={`${item.question}-${item.parentAnswer}`} className="rounded-[24px] bg-orange-50 p-4">
                    <p className="font-black text-stone-800">{item.question}</p>
                    <p className="mt-2 text-sm font-semibold text-stone-600">家长：{item.parentAnswer}</p>
                    <p className="text-sm font-semibold text-stone-600">孩子：{item.childAnswer}</p>
                    <p className="mt-2 leading-7 text-stone-600">{item.analysis}</p>
                  </div>
                ))}
              </div>
            </ReportBlock>

            <ReportBlock title="沟通提醒">
              <p className="leading-8 text-stone-600">{report.emotionAnalysis}</p>
            </ReportBlock>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <ReportBlock title="默契亮点与建议">
            <ul className="space-y-3">
              {report.suggestions.map((suggestion) => (
                <li key={suggestion} className="rounded-2xl bg-emerald-50 px-4 py-3 font-semibold text-emerald-800">
                  {suggestion}
                </li>
              ))}
            </ul>
          </ReportBlock>
          <ReportBlock title="今晚挑战">
            <p className="rounded-[24px] bg-sky-50 p-5 text-xl font-black leading-9 text-sky-800">
              {report.familyChallenge}
            </p>
          </ReportBlock>
        </div>
      </div>
    </section>
  )
}

function StatusPill({ connected }: { connected: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-orange-100 bg-orange-50 px-3 py-2 text-sm font-bold text-orange-700">
      <span className={`h-2.5 w-2.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-rose-400'}`} />
      <span>{connected ? '联机已就位' : '正在连线'}</span>
    </div>
  )
}

function TextInput({
  value,
  onChange,
  placeholder,
  upperCase = false,
  large = false,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  upperCase?: boolean
  large?: boolean
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(upperCase ? event.target.value.toUpperCase() : event.target.value)}
      className={`w-full rounded-[24px] border-2 border-orange-100 bg-white px-5 font-bold text-stone-800 shadow-inner outline-none placeholder:text-stone-400 focus:border-orange-300 ${
        large ? 'h-16 text-xl' : 'h-14 text-base'
      }`}
      placeholder={placeholder}
    />
  )
}

function AIReferee({ text }: { text: string }) {
  return (
    <div className="rounded-[28px] border border-sky-100 bg-sky-50 p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="ai-referee-badge">AI</div>
        <div>
          <p className="text-sm font-black text-sky-700">AI 小裁判</p>
          <p className="mt-1 text-sm font-semibold leading-6 text-sky-800">{text}</p>
        </div>
      </div>
    </div>
  )
}

function RopeIllustration() {
  return (
    <div className="mt-5 rounded-[32px] bg-gradient-to-r from-orange-50 via-white to-sky-50 p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="rounded-full bg-orange-200 px-4 py-2 font-black text-orange-700">家长队</div>
        <div className="relative h-6 flex-1 rounded-full bg-[repeating-linear-gradient(45deg,#b45309_0_10px,#92400e_10px_20px)] shadow-inner">
          <div className="absolute left-1/2 top-[-18px] -translate-x-1/2 rounded-full bg-pink-400 px-3 py-1 text-xs font-black text-white">
            理解点
          </div>
        </div>
        <div className="rounded-full bg-sky-200 px-4 py-2 font-black text-sky-700">孩子队</div>
      </div>
    </div>
  )
}

function FeatureBadge({ label, color }: { label: string; color: 'orange' | 'blue' | 'green' }) {
  const colorClass = {
    orange: 'bg-orange-100 text-orange-700 border-orange-200',
    blue: 'bg-sky-100 text-sky-700 border-sky-200',
    green: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  }[color]
  return <div className={`rounded-full border px-4 py-3 text-center font-black ${colorClass}`}>{label}</div>
}

function RoomStatus({
  title,
  player,
  tone,
}: {
  title: string
  player?: Player
  tone: 'orange' | 'blue'
}) {
  const color = tone === 'orange' ? 'text-orange-700 bg-orange-50 border-orange-200' : 'text-sky-700 bg-sky-50 border-sky-200'
  return (
    <div className={`rounded-[28px] border p-4 ${color}`}>
      <p className="text-sm font-bold">{title}</p>
      <p className="mt-3 text-lg font-black">{player?.nickname ?? '等待中'}</p>
      <p className="mt-1 text-sm font-semibold">{player?.connected ? '已就位' : '未加入'}</p>
    </div>
  )
}

function RoomQRCode({ activeCode, joinUrl }: { activeCode: string; joinUrl: string }) {
  return (
    <aside className="warm-card p-5">
      <p className="show-badge w-fit bg-sky-100 text-sky-700">扫码入场牌</p>
      <h2 className="mt-4 text-2xl font-black text-orange-600">孩子用微信扫一扫加入</h2>
      {activeCode ? (
        <>
          {isLocalHost() && (
            <div className="mt-4 rounded-[24px] border-2 border-amber-300 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-800">
              当前是 localhost，手机微信扫码可能无法打开。请用电脑局域网 IP 访问本页面后再扫码。
            </div>
          )}
          <div className="mt-5 flex justify-center rounded-[28px] bg-white p-4 shadow-inner">
            <QRCodeSVG value={joinUrl} size={236} />
          </div>
          <p className="mt-3 break-all rounded-2xl bg-stone-50 p-3 font-mono text-xs leading-5 text-stone-500">
            {joinUrl}
          </p>
        </>
      ) : (
        <p className="mt-4 font-semibold text-stone-500">创建房间后会显示二维码。</p>
      )}
    </aside>
  )
}

function RopeArena({
  scores,
  parent,
  child,
}: {
  scores?: Partial<Scores>
  parent?: Player
  child?: Player
}) {
  const ropePosition = Math.max(-100, Math.min(100, scores?.ropePosition ?? 0))
  return (
    <div className="warm-card p-4 sm:p-5">
      <div className="grid items-center gap-3 sm:grid-cols-[120px_1fr_120px]">
        <PlayerMini label="家长队" name={parent?.nickname ?? '家长'} tone="orange" />
        <div className="relative h-16 rounded-full bg-orange-50 px-4 py-5">
          <div className="h-5 rounded-full bg-[repeating-linear-gradient(45deg,#b45309_0_10px,#92400e_10px_20px)] shadow-inner" />
          <div className="absolute left-1/2 top-1 -translate-x-1/2 rounded-full bg-white px-3 py-1 text-xs font-black text-orange-600 shadow">
            理解点
          </div>
          <div
            className="absolute top-[18px] h-9 w-9 -translate-y-1/2 rounded-full border-4 border-white bg-pink-400 shadow-lg transition-all duration-700"
            style={{ left: `calc(50% + ${ropePosition / 2}% - 18px)` }}
          />
        </div>
        <PlayerMini label="孩子队" name={child?.nickname ?? '孩子'} tone="blue" />
      </div>
      <div className="mt-4 grid gap-2 text-sm font-black text-stone-600 sm:grid-cols-4">
        <span>默契值 {scores?.tacitScore ?? 0}</span>
        <span>共情值 {scores?.empathyScore ?? 0}</span>
        <span>压力温度 {scores?.pressureScore ?? 0}</span>
        <span>共识进度 {scores?.consensusScore ?? 0}</span>
      </div>
    </div>
  )
}

function PlayerMini({ label, name, tone }: { label: string; name: string; tone: 'orange' | 'blue' }) {
  return (
    <div
      className={`rounded-[24px] p-3 text-center font-black ${
        tone === 'orange' ? 'bg-orange-100 text-orange-700' : 'bg-sky-100 text-sky-700'
      }`}
    >
      <p className="text-xs">{label}</p>
      <p className="mt-1 truncate text-base">{name}</p>
    </div>
  )
}

function QuestionCard({
  question,
  current,
  total,
  selectedAnswerId,
  setSelectedAnswerId,
  hasAnswered,
  roundResult,
  waitingForOther,
  submitAnswer,
}: {
  question?: Question
  current: number
  total: number
  selectedAnswerId: string
  setSelectedAnswerId: (value: string) => void
  hasAnswered: boolean
  roundResult: RoundResult | null
  waitingForOther: boolean
  submitAnswer: () => void
}) {
  return (
    <div className="warm-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="show-badge w-fit">{question?.type === 'emotion' ? '情绪表达关' : '默契猜猜关'}</p>
        <span className="rounded-full bg-sky-100 px-4 py-2 text-sm font-black text-sky-700">
          第 {current}/{total} 题
        </span>
      </div>
      <h2 className="mt-4 text-2xl font-black leading-snug text-stone-800 sm:text-3xl">
        {question?.question ?? '正在读取题目……'}
      </h2>
      {question?.scene && (
        <p className="mt-3 rounded-[24px] bg-sky-50 p-4 font-semibold leading-7 text-sky-800">{question.scene}</p>
      )}
      <div className="mt-5 grid gap-3">
        {(question?.options ?? []).map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setSelectedAnswerId(option.id)}
            disabled={hasAnswered || Boolean(roundResult)}
            className={`min-h-14 rounded-[24px] border-2 px-5 py-4 text-left text-base font-black transition ${
              selectedAnswerId === option.id
                ? 'border-orange-400 bg-orange-100 text-orange-800 shadow-md'
                : 'border-orange-100 bg-white text-stone-700 hover:border-orange-200 hover:bg-orange-50'
            } disabled:cursor-not-allowed disabled:opacity-70`}
          >
            <span className="mr-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-orange-400 text-white">
              {option.id}
            </span>
            {option.text}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={submitAnswer}
        disabled={!selectedAnswerId || hasAnswered || Boolean(roundResult)}
        className="soft-button mt-5 min-h-14 w-full text-lg disabled:cursor-not-allowed disabled:opacity-60"
      >
        {waitingForOther ? '等待对方选择' : '提交答案'}
      </button>
    </div>
  )
}

function PlayerPanel({
  title,
  player,
  answered,
  tone,
}: {
  title: string
  player?: Player
  answered: boolean
  tone: 'orange' | 'blue'
}) {
  const color = tone === 'orange' ? 'bg-orange-50 text-orange-700' : 'bg-sky-50 text-sky-700'
  return (
    <div className={`rounded-[28px] border border-white bg-white p-4 shadow-sm ${color}`}>
      <p className="text-sm font-black">{title}</p>
      <p className="mt-2 truncate text-xl font-black">{player?.nickname ?? '等待中'}</p>
      <p className="mt-2 rounded-full bg-white px-3 py-2 text-center text-sm font-black">
        {answered ? '已选择' : '等待选择'}
      </p>
    </div>
  )
}

function ResultToast({ result }: { result: RoundResult }) {
  return (
    <div className="rounded-[30px] border-2 border-emerald-200 bg-emerald-50 p-5 text-center shadow-lg">
      <p className="text-2xl font-black text-emerald-700">{resultCopy(result)}</p>
      <p className="mt-2 text-sm font-semibold text-emerald-700">AI 小裁判记下啦，马上进入下一关。</p>
    </div>
  )
}

function ReportLoadingCard() {
  return (
    <section className="flex flex-1 items-center py-8">
      <div className="warm-card w-full p-6">
        <AIReferee text="正在整理本局亲子默契报告。如果 AI 忙不过来，规则报告会马上接上。" />
        <h2 className="mt-5 text-3xl font-black text-orange-600">报告生成中……</h2>
      </div>
    </section>
  )
}

function MetricCard({ label, value, tone }: { label: string; value: number; tone: 'orange' | 'blue' | 'green' | 'pink' }) {
  const colors = {
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
    blue: 'bg-sky-50 text-sky-700 border-sky-200',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    pink: 'bg-pink-50 text-pink-700 border-pink-200',
  }
  return (
    <div className={`rounded-[28px] border p-4 shadow-sm ${colors[tone]}`}>
      <p className="text-sm font-black">{label}</p>
      <p className="mt-2 text-4xl font-black">{value}</p>
    </div>
  )
}

function RadarReport({ report }: { report: Report }) {
  return (
    <div className="warm-card h-[360px] p-4">
      <p className="show-badge w-fit">六维默契雷达</p>
      <ResponsiveContainer width="100%" height="88%">
        <RadarChart data={report.radarScores}>
          <PolarGrid stroke="#fed7aa" />
          <PolarAngleAxis dataKey="name" tick={{ fill: '#92400e', fontSize: 12, fontWeight: 700 }} />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          <Radar dataKey="value" stroke="#fb923c" fill="#fb923c" fillOpacity={0.32} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}

function ReportBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="warm-card p-5">
      <h3 className="text-xl font-black text-orange-600">{title}</h3>
      <div className="mt-3">{children}</div>
    </div>
  )
}

export default App
