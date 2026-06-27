import { useEffect, useState } from 'react'
import { socket } from './lib/socket'

type Screen = 'home' | 'join'

const getJoinCodeFromPath = () => {
  const match = window.location.pathname.match(/^\/join\/(\d{6})/)
  return match?.[1] ?? ''
}

function App() {
  const initialCode = getJoinCodeFromPath()
  const [screen, setScreen] = useState<Screen>(initialCode ? 'join' : 'home')
  const [connected, setConnected] = useState(socket.connected)
  const [joinCode, setJoinCode] = useState(initialCode)

  useEffect(() => {
    const onConnect = () => setConnected(true)
    const onDisconnect = () => setConnected(false)

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.connect()

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
    }
  }, [])

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_20%_20%,rgba(20,184,166,0.28),transparent_32%),linear-gradient(135deg,#0f172a_0%,#111827_48%,#1f2937_100%)] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-6 sm:px-8">
        <header className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div className="text-sm font-semibold text-teal-200">AI 亲子活动 MVP</div>
          <div className="flex items-center gap-2 rounded border border-white/15 bg-white/10 px-3 py-2 text-sm text-slate-200">
            <span
              className={`h-2.5 w-2.5 rounded-full ${connected ? 'bg-teal-300' : 'bg-rose-400'}`}
            />
            <span>{connected ? 'Socket.IO 服务已连接' : '正在连接后端'}</span>
          </div>
        </header>

        {screen === 'home' && (
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
                  className="h-12 rounded bg-teal-400 px-6 font-semibold text-slate-950 transition hover:bg-teal-300"
                >
                  我是家长，创建房间
                </button>
                <button
                  type="button"
                  onClick={() => setScreen('join')}
                  className="h-12 rounded border border-white/20 bg-white/10 px-6 font-semibold text-white transition hover:bg-white/15"
                >
                  我是孩子，加入房间
                </button>
              </div>
            </div>
          </section>
        )}

        {screen === 'join' && (
          <section className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
            <p className="text-sm font-semibold text-teal-200">孩子端加入房间</p>
            <h2 className="mt-3 text-3xl font-bold">输入房间码</h2>
            <input
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value)}
              className="mt-6 h-12 rounded border border-white/15 bg-white/10 px-4 text-base text-white outline-none placeholder:text-slate-400 focus:border-teal-300"
              placeholder="6 位房间码"
            />
            <button
              type="button"
              onClick={() => setScreen('home')}
              className="mt-3 h-12 rounded border border-white/20 bg-white/10 px-5 font-semibold text-white transition hover:bg-white/15"
            >
              返回首页
            </button>
          </section>
        )}
      </div>
    </main>
  )
}

export default App
