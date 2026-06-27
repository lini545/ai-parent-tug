export type QuestionOption = {
  id: string
  text: string
  empathy?: number
  pressure?: number
  solution?: number
  respect?: number
}

export type Question = {
  id: string
  type: 'tacit' | 'emotion'
  mode?: 'parent_guess_child' | 'child_guess_parent'
  title: string
  scene?: string
  question: string
  options: QuestionOption[]
  analysisHint?: string
}

const emotionOptions = (
  gentle: string,
  direct: string,
  pressure: string,
  avoidant: string,
): QuestionOption[] => [
  { id: 'A', text: gentle, empathy: 8, pressure: 2, solution: 7, respect: 8 },
  { id: 'B', text: direct, empathy: 5, pressure: 5, solution: 7, respect: 5 },
  { id: 'C', text: pressure, empathy: 2, pressure: 8, solution: 4, respect: 2 },
  { id: 'D', text: avoidant, empathy: 3, pressure: 4, solution: 2, respect: 4 },
]

export const mockQuestions: Question[] = [
  {
    id: 'tacit-1',
    type: 'tacit',
    mode: 'parent_guess_child',
    title: '提醒方式',
    question: '孩子最不喜欢家长哪种提醒方式？',
    options: [
      { id: 'A', text: '一直催促' },
      { id: 'B', text: '拿别人比较' },
      { id: 'C', text: '大声批评' },
      { id: 'D', text: '反复讲道理' },
    ],
    analysisHint: '观察家长是否了解孩子对提醒方式的真实感受。',
  },
  {
    id: 'tacit-2',
    type: 'tacit',
    mode: 'child_guess_parent',
    title: '家长担心',
    question: '家长最担心孩子哪件事？',
    options: [
      { id: 'A', text: '成绩下降' },
      { id: 'B', text: '沉迷手机' },
      { id: 'C', text: '不会交朋友' },
      { id: 'D', text: '没有自律能力' },
    ],
    analysisHint: '观察孩子是否理解家长担心背后的重点。',
  },
  {
    id: 'tacit-3',
    type: 'tacit',
    mode: 'parent_guess_child',
    title: '困难时刻',
    question: '孩子遇到困难时，最希望家长先做什么？',
    options: [
      { id: 'A', text: '立刻帮我解决' },
      { id: 'B', text: '先听我说完' },
      { id: 'C', text: '告诉我应该怎么做' },
      { id: 'D', text: '让我自己安静一会儿' },
    ],
    analysisHint: '帮助双方看见支持方式是否对齐。',
  },
  {
    id: 'tacit-4',
    type: 'tacit',
    mode: 'child_guess_parent',
    title: '期待习惯',
    question: '家长最希望孩子养成哪种习惯？',
    options: [
      { id: 'A', text: '自觉学习' },
      { id: 'B', text: '主动沟通' },
      { id: 'C', text: '管理时间' },
      { id: 'D', text: '遇事不逃避' },
    ],
    analysisHint: '比较双方对成长重点的排序。',
  },
  {
    id: 'tacit-5',
    type: 'tacit',
    mode: 'parent_guess_child',
    title: '害怕的话',
    question: '孩子最害怕听到哪句话？',
    options: [
      { id: 'A', text: '你怎么又这样？' },
      { id: 'B', text: '你看看别人家孩子' },
      { id: 'C', text: '我都是为了你好' },
      { id: 'D', text: '这有什么难的？' },
    ],
    analysisHint: '识别容易引发防御感的表达。',
  },
  {
    id: 'emotion-1',
    type: 'emotion',
    title: '作业拖延',
    scene: '孩子写作业拖了很久，家长已经有点着急。',
    question: '家长怎么说更合适？',
    options: emotionOptions(
      '我有点着急了，我们先一起看第一步做什么。',
      '现在开始写，先把最容易的一题完成。',
      '你怎么总是拖到这么晚？',
      '算了，你自己看着办。',
    ),
  },
  {
    id: 'emotion-2',
    type: 'emotion',
    title: '考试失落',
    scene: '孩子考试没考好，情绪很低落。',
    question: '家长怎么说更合适？',
    options: emotionOptions(
      '我看到你很难过，我们先看看哪一部分最可惜。',
      '这次先总结错题，下次把分数拉回来。',
      '早就提醒你了，现在知道后悔了吧？',
      '别哭了，考都考完了。',
    ),
  },
  {
    id: 'emotion-3',
    type: 'emotion',
    title: '手机冲突',
    scene: '孩子一直玩手机，不愿意放下。',
    question: '家长怎么说更合适？',
    options: emotionOptions(
      '我知道你还想玩，我们约一个结束时间再切回正事。',
      '再玩五分钟，然后必须放下。',
      '你再这样手机就没收。',
      '你爱玩就玩吧，我不管了。',
    ),
  },
  {
    id: 'emotion-4',
    type: 'emotion',
    title: '不想学了',
    scene: '孩子说“我不想学了”。',
    question: '家长怎么说更合适？',
    options: emotionOptions(
      '听起来你真的很累，我们先说说最卡住的地方。',
      '不想学也要学，先把今天任务做完。',
      '你现在放弃，以后怎么办？',
      '那就别学了。',
    ),
  },
  {
    id: 'emotion-5',
    type: 'emotion',
    title: '顶嘴时刻',
    scene: '孩子和家长顶嘴。',
    question: '家长怎么说更合适？',
    options: emotionOptions(
      '我先停一下，我们都缓一缓，再把真正想说的讲清楚。',
      '你可以不同意，但要好好说。',
      '你这是什么态度？',
      '行，我不跟你说了。',
    ),
  },
]
