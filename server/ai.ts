import dotenv from 'dotenv'
import OpenAI from 'openai'
import { z } from 'zod'
import { fallbackQuestions } from './mockData.ts'
import type { Answer, FamilyReport, Question, RoomState } from '../src/shared/types.ts'

dotenv.config({ path: '.env.local' })

const questionSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['tacit', 'emotion']),
  prompt: z.string().min(8).max(80),
  options: z.array(z.string().min(1).max(40)).length(4),
  targetRole: z.enum(['parent', 'child']).optional(),
  saferOptionIndex: z.number().int().min(0).max(3).optional(),
  insight: z.string().min(8).max(120),
})

const questionsSchema = z.object({
  questions: z.array(questionSchema).length(10).refine(
    (questions) =>
      questions.filter((question) => question.kind === 'tacit').length === 5 &&
      questions.filter((question) => question.kind === 'emotion').length === 5,
    '必须生成 5 道默契题和 5 道情绪题',
  ),
})

const reportSchema = z.object({
  title: z.string().min(4).max(40),
  summary: z.string().min(20).max(240),
  radar: z.object({
    tacitUnderstanding: z.number().int().min(0).max(100),
    emotionalExpression: z.number().int().min(0).max(100),
    listening: z.number().int().min(0).max(100),
    repairAbility: z.number().int().min(0).max(100),
    sharedRoutine: z.number().int().min(0).max(100),
  }),
  strengths: z.array(z.string().min(8).max(80)).min(2).max(4),
  differences: z.array(z.string().min(8).max(90)).min(2).max(4),
  suggestions: z.array(z.string().min(8).max(100)).min(3).max(5),
  closing: z.string().min(8).max(60),
})

const useAi = () => process.env.USE_AI !== 'false' && Boolean(process.env.OPENAI_API_KEY)

const getClient = () =>
  new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: Number(process.env.AI_TIMEOUT_MS ?? 15000),
  })

const parseJson = (content: string) => {
  const trimmed = content.trim().replace(/^```json\s*/i, '').replace(/```$/i, '')
  return JSON.parse(trimmed)
}

const callJson = async (system: string, user: string) => {
  const client = getClient()
  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  })

  const content = completion.choices[0]?.message?.content
  if (!content) {
    throw new Error('AI 返回内容为空')
  }

  return parseJson(content)
}

export const generateQuestions = async (): Promise<Question[]> => {
  if (!useAi()) {
    return fallbackQuestions
  }

  try {
    const data = await callJson(
      [
        '你是亲子活动游戏的温和出题助手。',
        '只输出 JSON，不输出 Markdown。',
        '题目必须适合亲子活动现场，温和、具体、低风险。',
        '禁止攻击、羞辱、恐吓、医疗诊断、心理诊断、人格评价或诱导冲突。',
      ].join('\n'),
      [
        '生成 10 道中文亲子双人联机 H5 游戏题。',
        'JSON 格式：{"questions":[...]}',
        '每题字段：id, kind, prompt, options, insight。',
        'kind 只能是 tacit 或 emotion。',
        '必须包含 5 道 tacit 默契题和 5 道 emotion 情绪题。',
        'tacit 题额外包含 targetRole，值为 parent 或 child，表示猜谁的偏好。',
        'emotion 题额外包含 saferOptionIndex，表示 4 个选项里更适合沟通的一项。',
        '每题必须正好 4 个选项。',
      ].join('\n'),
    )
    const parsed = questionsSchema.parse(data)
    return parsed.questions
  } catch {
    return fallbackQuestions
  }
}

const answerText = (question: Question, answer: Answer) =>
  question.options[answer.optionIndex] ?? `选项 ${answer.optionIndex + 1}`

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)))

export const buildFallbackReport = (room: RoomState): FamilyReport => {
  const tacitQuestions = room.questions.filter((question) => question.kind === 'tacit')
  const emotionQuestions = room.questions.filter((question) => question.kind === 'emotion')
  const sameTacit = tacitQuestions.filter((question) => {
    const answers = room.answers.filter((answer) => answer.questionId === question.id)
    return answers.length >= 2 && answers[0]?.optionIndex === answers[1]?.optionIndex
  }).length
  const emotionSafe = emotionQuestions.reduce((score, question) => {
    const answers = room.answers.filter((answer) => answer.questionId === question.id)
    return (
      score +
      answers.filter((answer) => answer.optionIndex === question.saferOptionIndex).length
    )
  }, 0)

  const tacitScore = clamp(52 + (sameTacit / Math.max(tacitQuestions.length, 1)) * 40)
  const emotionScore = clamp(50 + (emotionSafe / Math.max(emotionQuestions.length * 2, 1)) * 42)
  const listening = clamp((tacitScore + emotionScore) / 2 - 4)
  const repair = clamp(emotionScore - 6)

  return {
    title: '你们的亲子默契正在变得更清楚',
    summary:
      '这次游戏显示，你们已经能看见彼此的一部分习惯和期待，也有一些地方需要通过更具体的表达来校准。',
    radar: {
      tacitUnderstanding: tacitScore,
      emotionalExpression: emotionScore,
      listening,
      repairAbility: repair,
      sharedRoutine: clamp((tacitScore + 74) / 2),
    },
    strengths: [
      '愿意一起完成题目，本身就是很好的沟通开端。',
      sameTacit >= 3
        ? '你们在多个默契题上选择接近，说明日常观察已经有积累。'
        : '你们发现了不少不同答案，这些差异正好可以成为聊天入口。',
    ],
    differences: [
      '对“帮助”和“提醒”的感受可能不完全一样。',
      '遇到压力时，双方对先解决问题还是先安顿情绪的顺序可能不同。',
    ],
    suggestions: [
      '每天留 5 分钟只问一件事：今天哪一刻最需要被理解？',
      '提醒前先说明目的：我想帮你把事情变轻一点，而不是催你。',
      '争执后用一句“我刚才真正想说的是……”做关系修复。',
    ],
    closing: '默契不是一次猜中，而是一次次愿意靠近。',
    source: 'fallback',
  }
}

export const generateReport = async (room: RoomState): Promise<FamilyReport> => {
  if (!useAi()) {
    return buildFallbackReport(room)
  }

  try {
    const answerRows = room.answers.map((answer) => {
      const question = room.questions.find((item) => item.id === answer.questionId)
      return {
        role: answer.role,
        questionKind: question?.kind,
        prompt: question?.prompt,
        selected: question ? answerText(question, answer) : '',
        saferOption:
          question?.saferOptionIndex === undefined ? undefined : question.options[question.saferOptionIndex],
      }
    })

    const data = await callJson(
      [
        '你是亲子活动报告助手。',
        '只输出 JSON，不输出 Markdown。',
        '报告必须温和、具体、可执行。',
        '不能批判家长或孩子，不能做心理疾病判断，不能使用羞辱、威胁或诊断性语言。',
      ].join('\n'),
      [
        '根据本局真实答题数据生成亲子默契报告。',
        'JSON 字段：title, summary, radar, strengths, differences, suggestions, closing。',
        'radar 包含 0-100 整数：tacitUnderstanding, emotionalExpression, listening, repairAbility, sharedRoutine。',
        'strengths 2-4 条，differences 2-4 条，suggestions 3-5 条。',
        `答题数据：${JSON.stringify(answerRows)}`,
      ].join('\n'),
    )
    const parsed = reportSchema.parse(data)
    return { ...parsed, source: 'ai' }
  } catch {
    return buildFallbackReport(room)
  }
}
