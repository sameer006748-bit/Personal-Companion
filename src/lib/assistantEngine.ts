import type {
  AssistantFollowUp,
  AssistantIntent,
  AssistantResponse,
} from '../models/assistant'
import type { PersonalFinanceData } from '../models/finance'
import {
  getAssistantAttentionItems,
  getFinancialPosition,
  getLargestExpenseDrivers,
  getMonthlyExpenses,
  getMonthlyIncome,
  getNetMonthlyPosition,
  getNetOutstandingPosition,
  getOutstandingPayableItems,
  getOutstandingPlanningPayables,
  getOutstandingPlanningReceivables,
  getOutstandingReceivableItems,
  getSafeToSpend,
  getTotalAvailable,
} from './financeSelectors'

const followUps = {
  expenses: [
    'Show my biggest expenses',
    'Who still owes me money?',
    'Can I safely spend PKR 20,000?',
  ],
  receivables: [
    'What is overdue?',
    'Show my payables',
    'Summarize my financial position',
  ],
  position: [
    'What payments need attention?',
    'What happened with my money this month?',
  ],
  attention: [
    'Who still owes me money?',
    'Can I safely spend PKR 20,000?',
  ],
} as const

function makeFollowUps(labels: readonly string[]): readonly AssistantFollowUp[] {
  return labels.map((label) => ({
    id: label.toLocaleLowerCase().replaceAll(/[^a-z0-9]+/g, '-'),
    label,
  }))
}

function normaliseQuestion(question: string): string {
  return question.toLocaleLowerCase().replaceAll(/\s+/g, ' ').trim()
}

export function classifyAssistantIntent(question: string): AssistantIntent {
  const input = normaliseQuestion(question)

  if (/financial position|overall position|how am i doing/.test(input)) {
    return 'financial-position'
  }

  if (/what needs attention|overdue|urgent payments|focus next/.test(input)) {
    return 'attention-items'
  }

  if (/who still owes me|money to receive|receivables|outstanding income/.test(input)) {
    return 'receivables'
  }

  if (/who do i need to pay|payables|money to pay|outstanding payments/.test(input)) {
    return 'payables'
  }

  if (/why were expenses high|biggest expenses|where did i spend|spending breakdown/.test(input)) {
    return 'expense-explanation'
  }

  if (/how much money do i have|available balance|current balance|cash available/.test(input)) {
    return 'available-balance'
  }

  if (/can i spend|safe to spend|afford|spend pkr|spend rs/.test(input)) {
    return 'safe-to-spend'
  }

  if (/what happened this month|summarize this month|monthly summary|money this month/.test(input)) {
    return 'monthly-summary'
  }

  return 'unknown'
}

export function extractPkrAmount(question: string): number | undefined {
  const match = /(?:pkr|rs\.?|₨)?\s*(\d[\d,\s]*)/i.exec(question)

  if (!match) {
    return undefined
  }

  const amount = Number.parseInt(match[1]!.replaceAll(/[\s,]/g, ''), 10)
  return Number.isFinite(amount) && amount > 0 ? amount : undefined
}

function createMonthlySummary(data: PersonalFinanceData): AssistantResponse {
  const moneyIn = getMonthlyIncome(data)
  const moneyOut = getMonthlyExpenses(data)
  const netPosition = getNetMonthlyPosition(data)

  return {
    intent: 'monthly-summary',
    text: 'This month, incoming money is ahead of recorded spending. Your current net position remains positive.',
    insight: {
      title: 'This month at a glance',
      metrics: [
        { label: 'Money In', amount: moneyIn, tone: 'positive' },
        { label: 'Money Out', amount: moneyOut, sign: '−', tone: 'negative' },
        { label: 'Net Position', amount: netPosition, sign: '+', tone: 'positive' },
      ],
    },
    followUps: makeFollowUps(followUps.expenses),
  }
}

function createSafeToSpendResponse(
  data: PersonalFinanceData,
  question: string,
): AssistantResponse {
  const safeToSpend = getSafeToSpend(data)
  const requestedAmount = extractPkrAmount(question)

  if (!requestedAmount) {
    return {
      intent: 'safe-to-spend',
      text: 'Based on the current recorded balances and commitments, this is the amount currently available to spend with care.',
      insight: {
        title: 'Current spending room',
        metrics: [{ label: 'Safe to Spend', amount: safeToSpend, tone: 'positive' }],
      },
      followUps: makeFollowUps(followUps.position),
    }
  }

  const remaining = safeToSpend - requestedAmount
  const isWithinRange = remaining >= 0

  return {
    intent: 'safe-to-spend',
    text: isWithinRange
      ? 'Based on the current recorded balances and commitments, this planned spend is within your current spending room.'
      : 'Based on the current recorded balances and commitments, this planned spend is above your current spending room.',
    insight: {
      title: isWithinRange ? 'Spending check' : 'Spending room exceeded',
      metrics: [
        { label: 'Current Safe to Spend', amount: safeToSpend, tone: 'positive' },
        { label: 'Planned Spend', amount: requestedAmount, sign: '−', tone: 'negative' },
        {
          label: isWithinRange ? 'Remaining Safe Amount' : 'Amount Above Safe Range',
          amount: Math.abs(remaining),
          tone: isWithinRange ? 'positive' : 'attention',
        },
      ],
    },
    followUps: makeFollowUps(followUps.position),
  }
}

function createReceivablesResponse(data: PersonalFinanceData): AssistantResponse {
  const items = getOutstandingReceivableItems(data)

  return {
    intent: 'receivables',
    text: 'You have outstanding money to receive across current client and personal items. Nova Studio needs the earliest follow-up.',
    insight: {
      title: 'Outstanding receivables',
      rows: [
        ...items.map((item) => ({
          label: item.counterparty,
          detail: item.status === 'overdue' ? 'Overdue' : item.status === 'pending' ? 'Pending' : 'Remaining',
          amount: item.remainingAmount,
          tone: item.status === 'overdue' ? ('attention' as const) : ('default' as const),
        })),
        {
          label: 'Total outstanding',
          amount: getOutstandingPlanningReceivables(data),
          tone: 'positive',
        },
      ],
    },
    followUps: makeFollowUps(followUps.receivables),
  }
}

function createPayablesResponse(data: PersonalFinanceData): AssistantResponse {
  const items = getOutstandingPayableItems(data)

  return {
    intent: 'payables',
    text: 'These are the outstanding payments in your current financial picture. PrintPoint is the only overdue payable.',
    insight: {
      title: 'Outstanding payables',
      rows: [
        ...items.map((item) => ({
          label: item.counterparty,
          detail: item.status === 'overdue' ? 'Overdue' : 'Pending',
          amount: item.remainingAmount,
          tone: item.status === 'overdue' ? ('attention' as const) : ('default' as const),
        })),
        {
          label: 'Total outstanding',
          amount: getOutstandingPlanningPayables(data),
          tone: 'negative',
        },
      ],
    },
    followUps: makeFollowUps(followUps.attention),
  }
}

function createAttentionResponse(data: PersonalFinanceData): AssistantResponse {
  const items = getAssistantAttentionItems(data)

  return {
    intent: 'attention-items',
    text: 'Start with the overdue invoice, then clear the delayed payable and scheduled commitments in this order.',
    insight: {
      title: 'Needs attention',
      rows: items.map((item) => ({
        label: item.title,
        detail: item.type === 'receivable' ? 'Overdue receivable' : item.type === 'payable' ? 'Overdue payable' : 'Overdue commitment',
        amount: item.amount,
        tone: 'attention',
      })),
    },
    followUps: makeFollowUps(followUps.attention),
  }
}

function createExpenseResponse(data: PersonalFinanceData): AssistantResponse {
  const drivers = getLargestExpenseDrivers(data)

  return {
    intent: 'expense-explanation',
    text: 'Housing was the main expense driver this month. Groceries and shopping were the next largest areas of recorded spending.',
    insight: {
      title: 'Largest spending drivers',
      rows: drivers.map((driver) => ({
        label: driver.label,
        detail: 'This month',
        amount: driver.amount,
      })),
    },
    followUps: makeFollowUps(followUps.receivables),
  }
}

function createAvailableBalanceResponse(data: PersonalFinanceData): AssistantResponse {
  return {
    intent: 'available-balance',
    text: 'Your available balance is spread across cash, bank, and wallet accounts.',
    insight: {
      title: 'Available balance',
      rows: [
        ...data.accounts.map((account) => ({
          label: account.label,
          detail: account.isDefault ? 'Primary account' : 'Available',
          amount: account.balance,
        })),
        { label: 'Total available', amount: getTotalAvailable(data), tone: 'positive' },
      ],
    },
    followUps: makeFollowUps(followUps.position),
  }
}

function createFinancialPositionResponse(data: PersonalFinanceData): AssistantResponse {
  return {
    intent: 'financial-position',
    text: 'Your financial position is comfortable. Current available balance and positive monthly cash flow are covering recorded commitments.',
    insight: {
      title: 'Financial position',
      metrics: [
        { label: 'Available Balance', amount: getTotalAvailable(data), tone: 'positive' },
        { label: 'Safe to Spend', amount: getSafeToSpend(data), tone: 'positive' },
        { label: 'Monthly Net Position', amount: getNetMonthlyPosition(data), sign: '+', tone: 'positive' },
        { label: 'Receivables', amount: getOutstandingPlanningReceivables(data) },
        { label: 'Payables', amount: getOutstandingPlanningPayables(data), sign: '−', tone: 'negative' },
        { label: 'Net Outstanding Position', amount: getNetOutstandingPosition(data), sign: '+', tone: 'positive' },
      ],
      rows: [{ label: 'Status', detail: getFinancialPosition(data) }],
    },
    followUps: makeFollowUps(followUps.position),
  }
}

function createUnknownResponse(): AssistantResponse {
  return {
    intent: 'unknown',
    text: 'I can currently help with balances, monthly cash flow, recent spending, receivables, payables, commitments, and safe-to-spend questions.',
    followUps: makeFollowUps([
      'What happened with my money this month?',
      'Who still owes me money?',
      'Summarize my financial position.',
    ]),
  }
}

export function generateAssistantResponse(
  question: string,
  data: PersonalFinanceData,
): AssistantResponse {
  switch (classifyAssistantIntent(question)) {
    case 'monthly-summary':
      return createMonthlySummary(data)
    case 'safe-to-spend':
      return createSafeToSpendResponse(data, question)
    case 'receivables':
      return createReceivablesResponse(data)
    case 'payables':
      return createPayablesResponse(data)
    case 'attention-items':
      return createAttentionResponse(data)
    case 'expense-explanation':
      return createExpenseResponse(data)
    case 'available-balance':
      return createAvailableBalanceResponse(data)
    case 'financial-position':
      return createFinancialPositionResponse(data)
    case 'unknown':
      return createUnknownResponse()
  }
}
