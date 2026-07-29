export type AssistantRole = 'user' | 'assistant'

export type AssistantIntent =
  | 'monthly-summary'
  | 'safe-to-spend'
  | 'receivables'
  | 'payables'
  | 'attention-items'
  | 'expense-explanation'
  | 'available-balance'
  | 'financial-position'
  | 'unknown'

export type AssistantInsightTone = 'default' | 'positive' | 'negative' | 'attention'

export interface AssistantMetric {
  label: string
  amount: number
  sign?: string
  tone?: AssistantInsightTone
}

export interface AssistantInsightRow {
  label: string
  detail?: string
  amount?: number
  tone?: AssistantInsightTone
}

export interface AssistantInsight {
  title: string
  metrics?: readonly AssistantMetric[]
  rows?: readonly AssistantInsightRow[]
}

export interface AssistantFollowUp {
  id: string
  label: string
}

export interface AssistantMessage {
  id: string
  role: AssistantRole
  text: string
  timestamp: number
  insight?: AssistantInsight
  followUps?: readonly AssistantFollowUp[]
}

export interface AssistantResponse {
  intent: AssistantIntent
  text: string
  insight?: AssistantInsight
  followUps?: readonly AssistantFollowUp[]
}
