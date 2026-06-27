export type PlayerRole = 'parent' | 'child'

export type RoomPhase = 'waiting' | 'playing' | 'report'

export type QuestionKind = 'tacit' | 'emotion'

export type Question = {
  id: string
  kind: QuestionKind
  prompt: string
  options: string[]
  targetRole?: PlayerRole
  saferOptionIndex?: number
  insight: string
}

export type Player = {
  id: string
  role: PlayerRole
  nickname: string
  connected: boolean
}

export type Answer = {
  questionId: string
  playerId: string
  role: PlayerRole
  optionIndex: number
  answeredAt: number
}

export type ReportRadar = {
  tacitUnderstanding: number
  emotionalExpression: number
  listening: number
  repairAbility: number
  sharedRoutine: number
}

export type FamilyReport = {
  title: string
  summary: string
  radar: ReportRadar
  strengths: string[]
  differences: string[]
  suggestions: string[]
  closing: string
  source: 'ai' | 'fallback'
}

export type RoomState = {
  code: string
  phase: RoomPhase
  joinUrl: string
  players: Player[]
  questions: Question[]
  currentQuestionIndex: number
  answers: Answer[]
  report?: FamilyReport
  createdAt: number
  updatedAt: number
}

export type PublicRoomState = Omit<RoomState, 'answers'> & {
  answerProgress: Record<string, string[]>
}

export type CreateRoomPayload = {
  nickname: string
}

export type JoinRoomPayload = {
  code: string
  nickname: string
}

export type SubmitAnswerPayload = {
  code: string
  questionId: string
  optionIndex: number
}

export type SocketAck<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string }
