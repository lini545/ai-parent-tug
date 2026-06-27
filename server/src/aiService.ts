import dotenv from 'dotenv'
import OpenAI from 'openai'
import { z } from 'zod'
import { mockQuestions, type Question } from './mockQuestions.ts'

dotenv.config({ path: '.env.local' })

export type QuestionSettings = {
  gameTitle: string
  target: string
  totalQuestions: number
  tacitCount: number
  emotionCount: number
  ageRange: string
  style: string
}

const optionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  empathy: z.number().min(0).max(10).optional(),
  pressure: z.number().min(0).max(10).optional(),
  solution: z.number().min(0).max(10).optional(),
  respect: z.number().min(0).max(10).optional(),
})

const questionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['tacit', 'emotion']),
  mode: z.enum(['parent_guess_child', 'child_guess_parent']).optional(),
  title: z.string().min(1),
  scene: z.string().optional(),
  question: z.string().min(1),
  options: z.array(optionSchema).length(4),
  analysisHint: z.string().optional(),
})

const questionsSchema = z
  .array(questionSchema)
  .length(10)
  .superRefine((questions, ctx) => {
    const tacit = questions.filter((question) => question.type === 'tacit')
    const emotion = questions.filter((question) => question.type === 'emotion')

    if (tacit.length !== 5 || emotion.length !== 5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '必须正好包含 5 道默契题和 5 道情绪题',
      })
    }

    for (const question of emotion) {
      for (const option of question.options) {
        if (
          option.empathy === undefined ||
          option.pressure === undefined ||
          option.solution === undefined ||
          option.respect === undefined
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: '情绪题每个选项必须包含 empathy、pressure、solution、respect',
          })
        }
      }
    }
  })

const parseJson = (content: string) => {
  const normalized = content.trim().replace(/^```json\s*/i, '').replace(/```$/i, '')
  return JSON.parse(normalized)
}

export async function generateQuestions(settings: QuestionSettings): Promise<Question[]> {
  if (process.env.USE_AI === 'false' || !process.env.OPENAI_API_KEY) {
    console.log('Question source: mock')
    return mockQuestions
  }

  try {
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: Number(process.env.AI_TIMEOUT_MS ?? 15000),
    })

    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            '你是亲子活动游戏的温和出题助手。',
            '只输出 JSON，不输出 Markdown。',
            '题目必须真实、温和、适合活动展示。',
            '禁止攻击、羞辱、恐吓、心理诊断、医疗诊断或给家庭成员贴标签。',
          ].join('\n'),
        },
        {
          role: 'user',
          content: [
            `游戏名：${settings.gameTitle}`,
            `目标场景：${settings.target}`,
            `题量：${settings.totalQuestions}，其中 tacit ${settings.tacitCount} 道，emotion ${settings.emotionCount} 道。`,
            `年龄段：${settings.ageRange}`,
            `风格：${settings.style}`,
            '返回 JSON：{"questions":[Question...]}',
            'Question 字段：id,type,mode,title,scene,question,options,analysisHint。',
            'type 为 tacit 或 emotion。',
            'tacit 题 mode 必须是 parent_guess_child 或 child_guess_parent。',
            'emotion 题每个 option 必须有 empathy, pressure, solution, respect，分数 0-10。',
            '每题正好 4 个选项，选项 id 使用 A/B/C/D。',
          ].join('\n'),
        },
      ],
    })

    const content = completion.choices[0]?.message?.content
    if (!content) {
      throw new Error('AI 返回内容为空')
    }

    const data = parseJson(content)
    const questions = questionsSchema.parse(data.questions)
    console.log('Question source: ai')
    return questions
  } catch (error) {
    console.warn('Question source: mock. AI question generation failed.')
    return mockQuestions
  }
}
