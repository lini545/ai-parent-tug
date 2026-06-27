import type { Question } from './mockQuestions.js'

export type PlayerRole = 'parent' | 'child'

export type Report = {
  summary: string
  endingType: '高共鸣结局' | '需要更多倾听' | '认知差异明显'
  radarScores: {
    name: string
    value: number
  }[]
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

export type ReportGameState = {
  parentNickname: string
  childNickname: string
  tacitScore: number
  empathyScore: number
  pressureScore: number
  consensusScore: number
  ropePosition: number
  differences: string[]
  emotionWarnings: string[]
  questions: Question[]
  answers: Record<string, Partial<Record<PlayerRole, string>>>
}

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)))

export const getEndingType = (tacitScore: number, consensusScore: number): Report['endingType'] => {
  if (tacitScore >= 75 && consensusScore >= 70) {
    return '高共鸣结局'
  }

  if (tacitScore >= 45) {
    return '需要更多倾听'
  }

  return '认知差异明显'
}

const optionText = (question: Question, answerId?: string) =>
  question.options.find((option) => option.id === answerId)?.text ?? '未选择'

export function generateRuleBasedReport(gameState: ReportGameState): Report {
  const endingType = getEndingType(gameState.tacitScore, gameState.consensusScore)
  const differenceAnalysis = gameState.questions
    .map((question) => {
      const answers = gameState.answers[question.id]
      if (!answers?.parent || !answers.child || answers.parent === answers.child) {
        return null
      }

      return {
        question: question.question,
        parentAnswer: optionText(question, answers.parent),
        childAnswer: optionText(question, answers.child),
        analysis:
          question.type === 'emotion'
            ? '这道题显示双方对更舒服的表达方式有不同期待，可以先讨论哪句话更容易被听见。'
            : '这道题显示双方对彼此偏好有不同判断，适合当作一次轻松的了解入口。',
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))

  const pressureControl = clamp(100 - gameState.pressureScore * 2)
  const emotionalSafety = clamp((gameState.empathyScore * 2 + pressureControl) / 3)

  return {
    summary:
      differenceAnalysis.length > 0
        ? `${gameState.parentNickname} 和 ${gameState.childNickname} 已经完成了一次很具体的默契校准。本局里有一些答案没有完全一致，这不是问题，而是很好的聊天线索。`
        : `${gameState.parentNickname} 和 ${gameState.childNickname} 在本局中表现出不错的同步感。即使没有明显差异，也可以继续把这种互相确认变成日常习惯。`,
    endingType,
    radarScores: [
      { name: '默契理解', value: clamp(gameState.tacitScore) },
      { name: '情绪共情', value: clamp(gameState.empathyScore * 2) },
      { name: '表达安全感', value: emotionalSafety },
      { name: '规则共识', value: clamp(gameState.consensusScore) },
      { name: '压力控制', value: pressureControl },
      { name: '共同解决', value: clamp((gameState.consensusScore + gameState.empathyScore * 2) / 2) },
    ],
    differenceAnalysis:
      differenceAnalysis.length > 0
        ? differenceAnalysis
        : [
            {
              question: '本局整体观察',
              parentAnswer: '双方多处选择接近',
              childAnswer: '双方多处选择接近',
              analysis: '本局没有明显认知差异，可以把这种同步感延伸到每天一个小问题的沟通中。',
            },
          ],
    emotionAnalysis:
      gameState.emotionWarnings.length > 0
        ? `本局出现了 ${gameState.emotionWarnings.length} 次高压力表达提醒。建议把“立刻纠正”先换成“先确认感受，再讨论下一步”。`
        : '本局没有触发明显高压力表达提醒，说明双方在冲突场景中已经具备一定的缓冲空间。',
    suggestions: [
      '每天用 5 分钟互问一个具体问题：今天哪一刻你最希望我理解你？',
      '发生提醒或冲突前，先说明自己的目的：我想帮你把事情变轻一点。',
      '遇到不同答案时，不急着判断谁对谁错，先请对方讲一个真实例子。',
    ],
    familyChallenge: '今晚睡前各说一句“今天我更懂你的一点是……”，并认真听完对方的答案。',
    source: 'rule',
  }
}
