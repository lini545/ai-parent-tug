import { useEffect, useMemo, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from 'recharts'
import { getServerOrigin, socket } from './lib/socket'
import type {
  PlayerRole,
  PublicRoomState,
  Question,
  SocketAck,
} from './shared/types'

type Screen = 'home' | 'join' | 'room'
type BusyAction = 'create' | 'join' | 'start' | 'answer' | null

const getJoinCodeFromPath = () => {
  const match = window.location.pathname.match(/^\/join\/(\d{6})/)
  return match?.[1] ?? ''
}

const callSocket = <T,>(event: string, payload: unknown) =>
  new Promise<SocketAck<T>>((resolve) => {
    socket.emit(event, payload, (response: SocketAck<T>) => resolve(response))
  })

const roleLabel: Record<PlayerRole, string> = {
  parent: '家长',
  child: '孩子',
}

const kindLabel: Record<Question['kind'], string> = {
  tacit: '默契题',
  emotion: '情绪题',
}

function App() {
  const initialCode = getJoinCodeFromPath()
  const [screen, setScreen] = useState<Screen>(initialCode ? 'join' : 'home')
  const [room, setRoom] = useState<PublicRoomState | null>(null)
  const [nickname, setNickname] = useState('')
  const [joinCode, setJoinCode] = useState(initialCode)
  const [selectedOption, setSelectedOption] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  const [connected, setConnected] = useState(socket.connected)
  const [busyAction, setBusyAction] = useState<BusyAction>(null)

  useEffect(() => {
    const onConnect = () => setConnected(true)
    const onDisconnect = () => setConnected(false)
    const onRoomState = (nextRoom: PublicRoomState) => {
      setRoom(nextRoom)
      setScreen('room')
      setSelectedOption(null)
      setBusyAction(null)
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('room:state', onRoomState)
    socket.connect()

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('room:state', onRoomState)
    }
  }, [])

  const me = useMemo(
    () => room?.players.find((player) => player.id === socket.id),
    [room],
  )
  const currentQuestion = room?.questions[room.currentQuestionIndex]
  const progress = currentQuestion ? room?.answerProgress[currentQuestion.id] ?? [] : []
  const hasAnswered = me ? progress.includes(me.role) : false
  const canStart = room?.players.some((player) => player.role === 'child') ?? false

  const createRoom = async () => {
    setMessage('')
    setBusyAction('create')
    const response = await callSocket<PublicRoomState>('room:create', {
      nickname: nickname || '家长',
    })

    setBusyAction(null)
    if (response.ok) {
      setRoom(response.data)
      setScreen('room')
      window.history.replaceState(null, '', '/')
    } else {
      setMessage(response.error)
    }
  }

  const joinRoom = async () => {
    setMessage('')
    setBusyAction('join')
    const response = await callSocket<PublicRoomState>('room:join', {
      code: joinCode,
      nickname: nickname || '孩子',
    })

    setBusyAction(null)
    if (response.ok) {
      setRoom(response.data)
      setScreen('room')
      window.history.replaceState(null, '', `/join/${joinCode}`)
    } else {
      setMessage(response.error)
    }
  }

  const startGame = async () => {
    if (!room) {
      return
    }

    setMessage('')
    setBusyAction('start')
    const response = await callSocket<PublicRoomState>('game:start', room.code)
    if (!response.ok) {
      setBusyAction(null)
      setMessage(response.error)
    }
  }

  const submitAnswer = async () => {
    if (!room || !currentQuestion || selectedOption === null) {
      return
    }

    setMessage('')
    setBusyAction('answer')
    const response = await callSocket<PublicRoomState>('answer:submit', {
      code: room.code,
      questionId: currentQuestion.id,
      optionIndex: selectedOption,
    })

    if (!response.ok) {
      setBusyAction(null)
      setMessage(response.error)
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f4ef] text-stone-950">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-4 sm:px-6">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-300 pb-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
              AI 亲子活动 H5
            </p>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
              谁更懂谁：AI 亲子默契拔河
            </h1>
          </div>
          <div className="flex items-center gap-2 rounded border border-stone-300 bg-white px-3 py-2 text-sm">
            <span
              className={`h-2.5 w-2.5 rounded-full ${connected ? 'bg-teal-600' : 'bg-red-500'}`}
            />
            <span>{connected ? '联机服务已连接' : '正在连接服务'}</span>
          </div>
        </header>

        {screen === 'home' && (
          <section className="grid flex-1 items-center gap-6 py-8 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <p className="text-sm font-semibold text-teal-700">家长端创建房间</p>
              <h2 className="mt-3 max-w-2xl text-4xl font-bold leading-tight sm:text-5xl">
                一台电脑开房间，一部手机扫码加入。
              </h2>
              <p className="mt-5 max-w-2xl text-base leading-7 text-stone-700">
                房间链接会使用当前电脑的局域网 IP，适合在同一 Wi-Fi 下用微信扫码演示。
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:max-w-md">
                <input
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  className="h-12 rounded border border-stone-300 bg-white px-4 text-base outline-none focus:border-teal-700"
                  placeholder="家长昵称"
                />
                <button
                  type="button"
                  onClick={createRoom}
                  disabled={!connected || busyAction !== null}
                  className="h-12 rounded bg-teal-700 px-5 font-semibold text-white disabled:cursor-not-allowed disabled:bg-stone-400"
                >
                  {busyAction === 'create' ? '创建中' : '创建房间'}
                </button>
              </div>
            </div>
            <div className="rounded border border-stone-300 bg-white p-5">
              <p className="text-sm font-semibold text-stone-900">本机服务地址</p>
              <p className="mt-2 break-all rounded bg-stone-100 p-3 font-mono text-sm text-stone-700">
                {getServerOrigin()}
              </p>
              <p className="mt-4 text-sm leading-6 text-stone-600">
                手机需要和电脑在同一个局域网。二维码不能使用 localhost。
              </p>
            </div>
          </section>
        )}

        {screen === 'join' && (
          <section className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-8">
            <p className="text-sm font-semibold text-teal-700">孩子端加入房间</p>
            <h2 className="mt-3 text-3xl font-bold">输入昵称后加入</h2>
            <div className="mt-6 flex flex-col gap-3">
              <input
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value)}
                className="h-12 rounded border border-stone-300 bg-white px-4 text-base outline-none focus:border-teal-700"
                placeholder="房间码"
              />
              <input
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                className="h-12 rounded border border-stone-300 bg-white px-4 text-base outline-none focus:border-teal-700"
                placeholder="孩子昵称"
              />
              <button
                type="button"
                onClick={joinRoom}
                disabled={!connected || joinCode.length !== 6 || busyAction !== null}
                className="h-12 rounded bg-teal-700 px-5 font-semibold text-white disabled:cursor-not-allowed disabled:bg-stone-400"
              >
                {busyAction === 'join' ? '加入中' : '加入房间'}
              </button>
            </div>
          </section>
        )}

        {screen === 'room' && room && (
          <section className="grid flex-1 gap-4 py-4 lg:grid-cols-[320px_1fr]">
            <aside className="space-y-4">
              <div className="rounded border border-stone-300 bg-white p-4">
                <p className="text-sm font-semibold text-stone-600">房间码</p>
                <p className="mt-1 font-mono text-4xl font-bold text-teal-800">{room.code}</p>
                <div className="mt-4 flex justify-center rounded border border-stone-200 p-3">
                  <QRCodeSVG value={room.joinUrl} size={220} />
                </div>
                <p className="mt-3 break-all text-xs leading-5 text-stone-600">{room.joinUrl}</p>
              </div>

              <div className="rounded border border-stone-300 bg-white p-4">
                <p className="text-sm font-semibold text-stone-600">玩家</p>
                <div className="mt-3 space-y-2">
                  {(['parent', 'child'] as PlayerRole[]).map((role) => {
                    const player = room.players.find((item) => item.role === role)
                    return (
                      <div
                        key={role}
                        className="flex items-center justify-between rounded border border-stone-200 px-3 py-2"
                      >
                        <span className="font-semibold">{roleLabel[role]}</span>
                        <span className={player?.connected ? 'text-teal-700' : 'text-stone-400'}>
                          {player ? player.nickname : '等待中'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </aside>

            <div className="rounded border border-stone-300 bg-white p-5">
              {room.phase === 'waiting' && (
                <div className="flex h-full min-h-[420px] flex-col justify-center">
                  <p className="text-sm font-semibold text-teal-700">等待孩子扫码加入</p>
                  <h2 className="mt-3 text-3xl font-bold">两端连接后即可开始拔河</h2>
                  <p className="mt-4 max-w-xl text-base leading-7 text-stone-700">
                    微信扫一扫左侧二维码，孩子端会自动带上房间码。
                  </p>
                  {me?.role === 'parent' && (
                    <button
                      type="button"
                      onClick={startGame}
                      disabled={!canStart || busyAction !== null}
                      className="mt-6 h-12 w-full max-w-xs rounded bg-teal-700 px-5 font-semibold text-white disabled:cursor-not-allowed disabled:bg-stone-400"
                    >
                      {busyAction === 'start' ? 'AI 出题中' : '开始游戏'}
                    </button>
                  )}
                </div>
              )}

              {room.phase === 'playing' && currentQuestion && (
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-teal-700">
                        {kindLabel[currentQuestion.kind]} · {room.currentQuestionIndex + 1}/
                        {room.questions.length}
                      </p>
                      <h2 className="mt-2 text-2xl font-bold leading-snug">
                        {currentQuestion.prompt}
                      </h2>
                    </div>
                    <div className="rounded border border-stone-300 px-3 py-2 text-sm text-stone-700">
                      已答：{progress.length}/2
                    </div>
                  </div>

                  <div className="mt-6 grid gap-3">
                    {currentQuestion.options.map((option, index) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setSelectedOption(index)}
                        disabled={hasAnswered || busyAction !== null}
                        className={`min-h-14 rounded border px-4 py-3 text-left font-medium ${
                          selectedOption === index
                            ? 'border-teal-700 bg-teal-50 text-teal-950'
                            : 'border-stone-300 bg-white text-stone-800'
                        } disabled:cursor-not-allowed disabled:opacity-70`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>

                  <div className="mt-6 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={submitAnswer}
                      disabled={selectedOption === null || hasAnswered || busyAction !== null}
                      className="h-12 rounded bg-teal-700 px-6 font-semibold text-white disabled:cursor-not-allowed disabled:bg-stone-400"
                    >
                      {busyAction === 'answer' && room.currentQuestionIndex === room.questions.length - 1
                        ? '生成报告中'
                        : busyAction === 'answer'
                          ? '提交中'
                          : '提交答案'}
                    </button>
                    {hasAnswered && (
                      <span className="text-sm text-stone-600">已提交，等待另一端作答。</span>
                    )}
                  </div>

                  <p className="mt-6 rounded bg-stone-100 p-3 text-sm leading-6 text-stone-700">
                    {currentQuestion.insight}
                  </p>
                </div>
              )}

              {room.phase === 'report' && room.report && (
                <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
                  <div>
                    <p className="text-sm font-semibold text-teal-700">
                      {room.report.source === 'ai' ? 'AI 生成报告' : '规则模板报告'}
                    </p>
                    <h2 className="mt-2 text-3xl font-bold">{room.report.title}</h2>
                    <p className="mt-4 leading-7 text-stone-700">{room.report.summary}</p>

                    <div className="mt-5 grid gap-4 sm:grid-cols-3">
                      <ReportList title="亮点" items={room.report.strengths} />
                      <ReportList title="差异" items={room.report.differences} />
                      <ReportList title="建议" items={room.report.suggestions} />
                    </div>
                    <p className="mt-5 rounded bg-teal-50 p-4 font-semibold text-teal-950">
                      {room.report.closing}
                    </p>
                  </div>
                  <div className="h-[320px] rounded border border-stone-200 p-3">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart
                        data={[
                          { name: '默契', value: room.report.radar.tacitUnderstanding },
                          { name: '表达', value: room.report.radar.emotionalExpression },
                          { name: '倾听', value: room.report.radar.listening },
                          { name: '修复', value: room.report.radar.repairAbility },
                          { name: '陪伴', value: room.report.radar.sharedRoutine },
                        ]}
                      >
                        <PolarGrid />
                        <PolarAngleAxis dataKey="name" />
                        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                        <Radar
                          dataKey="value"
                          stroke="#0f766e"
                          fill="#0f766e"
                          fillOpacity={0.28}
                        />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {message && (
          <div className="fixed bottom-4 left-1/2 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow">
            {message}
          </div>
        )}
      </div>
    </main>
  )
}

function ReportList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded border border-stone-200 p-3">
      <p className="font-semibold text-stone-900">{title}</p>
      <ul className="mt-2 space-y-2 text-sm leading-6 text-stone-700">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

export default App
