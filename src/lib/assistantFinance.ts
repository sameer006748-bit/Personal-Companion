import type {
  AssistantActionDraft,
  AssistantActionProposal,
  AssistantResponse,
  AssistantToolFinanceContext,
} from '../models/assistant'
import type { PersonalFinanceData } from '../models/finance'
import type { PlanningState } from '../models/planning'
import type { FinanceState } from './financeCore'
import { getAccountBalance, getActiveAccounts } from './financeCore'
import {
  getAssistantAttentionItems,
  getMonthlyExpenses,
  getMonthlyIncome,
  getNetMonthlyPosition,
  getFinancialPosition,
  getOverdueTotal,
  getUpcomingCount,
  getOutstandingPlanningPayables,
  getOutstandingPlanningReceivables,
  getRecentTransactions,
  getRemainingCommitments,
  getSafeToSpend,
  getTotalAvailable,
} from './financeSelectors'
import {
  findCommitment,
  findPayable,
  findReceivable,
  getPayableRemainingAmount,
  getReceivableRemainingAmount,
} from './planningCore'

export type AssistantFinancialContext = AssistantToolFinanceContext

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

// This bounded snapshot is the only financial input available to the Edge
// Function's allow-listed tools. Values come from the same selectors used by the
// rest of the app; the model never calculates or mutates them.
export function buildAssistantFinancialContext(
  data: PersonalFinanceData,
  finance: FinanceState,
  planning: PlanningState,
): AssistantFinancialContext {
  const accountTypes = new Map(
    getActiveAccounts(finance).map((account) => [account.id, account.type]),
  )
  const accounts = data.accounts.map((account) => ({
    id: account.id,
    name: account.label,
    type: accountTypes.get(account.id) ?? 'other',
    balance: account.balance,
  }))
  const cashBalance = accounts
    .filter((account) => account.type === 'cash')
    .reduce((sum, account) => sum + account.balance, 0)

  return {
    currency: 'PKR',
    today: today(),
    accounts,
    summary: {
      totalBalance: getTotalAvailable(data),
      cashBalance,
      monthlyIncome: getMonthlyIncome(data),
      monthlyExpenses: getMonthlyExpenses(data),
      netMonthlyCashFlow: getNetMonthlyPosition(data),
      receivables: getOutstandingPlanningReceivables(data),
      payables: getOutstandingPlanningPayables(data),
      commitments: getRemainingCommitments(data),
      overdueItems: getAssistantAttentionItems(data).length,
      safeToSpend: getSafeToSpend(data),
      overdueTotal: getOverdueTotal(data),
      upcomingItems: getUpcomingCount(data),
    },
    financialPosition: getFinancialPosition(data),
    accountDistribution: accounts.map((account) => ({
      accountId: account.id,
      label: account.name,
      balance: account.balance,
      sharePercent: getTotalAvailable(data) === 0
        ? 0
        : Math.round((account.balance / getTotalAvailable(data)) * 10_000) / 100,
    })),
    recentTransactions: getRecentTransactions(data, 50).map((item) => ({
      id: item.id,
      title: item.title,
      amount: item.amount,
      date: item.date,
      direction: item.direction,
      accountId: item.accountId,
      ...(item.counterparty ? { counterparty: item.counterparty } : {}),
    })),
    receivables: data.planningReceivables
      .filter((item) => item.status !== 'received')
      .slice(0, 10)
      .map((item) => ({
        id: item.id,
        label: item.counterparty,
        amount: Math.max(0, item.originalAmount - item.receivedAmount),
        dueDate: item.dueDate,
        status: item.status,
      })),
    payables: data.planningPayables
      .filter((item) => item.status !== 'paid')
      .slice(0, 10)
      .map((item) => ({
        id: item.id,
        label: item.counterparty,
        amount: Math.max(0, item.originalAmount - item.paidAmount),
        dueDate: item.dueDate,
        status: item.status,
      })),
    commitments: data.planningCommitments
      .filter((item) => item.status !== 'paid')
      .slice(0, 10)
      .map((item) => ({
        id: item.id,
        label: item.label,
        amount: item.amount,
        dueDate: item.dueDate,
        status: item.status,
        frequency: item.frequency,
        ...(item.accountId ? { accountId: item.accountId } : {}),
      })),
    managedAccounts: finance.accounts.slice(0, 20).map((account) => ({
      id: account.id,
      name: account.name,
      type: account.type,
      openingBalance: account.openingBalance,
      balance: getAccountBalance(finance, account.id),
      isDefault: account.isDefault,
      isArchived: account.isArchived,
      ...(account.institutionName ? { institutionName: account.institutionName } : {}),
      ...(account.lastFourDigits ? { lastFourDigits: account.lastFourDigits } : {}),
    })),
    managedTransactions: finance.transactions.slice(-50).map((transaction) => ({
      id: transaction.id,
      type: transaction.type,
      amount: transaction.amount,
      date: transaction.date,
      title: transaction.title,
      categoryId: transaction.categoryId,
      accountId: transaction.accountId,
      ...(transaction.destinationAccountId ? { destinationAccountId: transaction.destinationAccountId } : {}),
      ...(transaction.personOrBusiness ? { personOrBusiness: transaction.personOrBusiness } : {}),
      ...(transaction.note ? { note: transaction.note } : {}),
    })),
    managedReceivables: planning.receivables.slice(-50).map((record) => ({
      id: record.id,
      counterparty: record.counterparty,
      originalAmount: record.originalAmount,
      receivedAmount: record.receivedAmount,
      dueDate: record.dueDate,
      ...(record.note ? { note: record.note } : {}),
      ...(record.accountId ? { accountId: record.accountId } : {}),
    })),
    managedPayables: planning.payables.slice(-50).map((record) => ({
      id: record.id,
      counterparty: record.counterparty,
      originalAmount: record.originalAmount,
      paidAmount: record.paidAmount,
      dueDate: record.dueDate,
      ...(record.note ? { note: record.note } : {}),
      ...(record.accountId ? { accountId: record.accountId } : {}),
    })),
    managedCommitments: planning.commitments.slice(-50).map((record) => ({
      id: record.id,
      label: record.label,
      category: record.category,
      amount: record.amount,
      frequency: record.frequency,
      dueDate: record.dueDate,
      ...(record.note ? { note: record.note } : {}),
      ...(record.accountId ? { accountId: record.accountId } : {}),
      isSettled: record.isSettled,
      isArchived: record.isArchived,
    })),
  }
}

function normalise(value: string): string {
  return value.toLocaleLowerCase().replaceAll(/[^a-z0-9\s]/g, ' ').replaceAll(/\s+/g, ' ').trim()
}

// Mutation language is intentionally broader than the small set of commands we
// can prepare locally. Its first job is routing safety: a request to add, edit,
// delete or move money must never be mistaken for a read just because it also
// names Cash or contains the word balance.
const ACTION_COMMAND_CUE =
  /\b(add|record|create|deposit|top\s*up|topup|jama|daal|dalo|dal do|karo|edit|update|delete|remove|move|transfer|send|bhej|withdraw|nikal)\b/u
const ACTION_OBJECT_CUE =
  /\b(account|balance|cash|bank|wallet|savings|transaction|expense|income|kharch|kharcha|paisa|paise|paisay|paisy|pkr|rupees?)\b/u

export function isAssistantActionCommand(question: string): boolean {
  const input = normalise(question)
  return ACTION_COMMAND_CUE.test(input) && ACTION_OBJECT_CUE.test(input)
}

function parseSinglePkrAmount(question: string): number | undefined {
  const amounts = [...question.matchAll(/(?:\bpkr\s*)?(\d{1,3}(?:,\d{3})+|\d+)/giu)]
    .map((match) => Number.parseInt((match[1] ?? '').replaceAll(',', ''), 10))
    .filter((amount) => Number.isSafeInteger(amount) && amount > 0)
  return amounts.length === 1 ? amounts[0] : undefined
}

function resolveLocalActionAccount(finance: FinanceState, question: string) {
  const matches = findAccountsMatchingQuestion(finance, question)
  if (matches.length === 1) return matches[0]
  if (matches.length > 1) return undefined
  const active = getActiveAccounts(finance)
  return active.find((account) => account.isDefault) ?? (active.length === 1 ? active[0] : undefined)
}

// MVP1 supports only unambiguous, single-account income and expense commands.
// The resulting draft still goes through createAssistantProposalFromDraft(), so
// account availability, amount bounds and expense balance checks remain local
// domain decisions and no write occurs before explicit confirmation.
export function parseDeterministicActionDraft(
  question: string,
  finance: FinanceState,
  effectiveDate: string,
): AssistantActionDraft | undefined {
  if (!isAssistantActionCommand(question)) return undefined
  const input = normalise(question)
  const amountPkr = parseSinglePkrAmount(question)
  if (!amountPkr) return undefined

  const isExpense = /\b(expense|expenses|kharch|kharcha)\b/u.test(input)
  const isIncome = /\bincome\b/u.test(input)
  const isDeposit = /\b(deposit|jama|daal|dalo|dal do|top\s*up|topup)\b/u.test(input)
  const isGenericAdd = /\badd\b/u.test(input) && /\b(cash|bank|wallet|savings|account)\b/u.test(input)
  if (!isExpense && !isIncome && !isDeposit && !isGenericAdd) return undefined

  const account = resolveLocalActionAccount(finance, question)
  if (!account) return undefined
  const actionType = isExpense ? 'add-expense' as const : 'add-income' as const
  return {
    actionType,
    amountPkr,
    description: isExpense ? 'Assistant expense' : 'Assistant income',
    effectiveDate,
    summary: isExpense ? 'Record an expense.' : 'Record income.',
    ...(actionType === 'add-expense'
      ? { sourceAccountId: account.id }
      : { targetAccountId: account.id }),
  }
}

// A very small canonical set: an account literally named after a type label is
// treated as declaring that type. Anything else is left alone.
const CANONICAL_TYPE_NAMES: Readonly<Record<string, string>> = {
  cash: 'cash',
  bank: 'bank',
  wallet: 'wallet',
  savings: 'savings',
}

function canonicalTypeFromName(name: string): string | undefined {
  return CANONICAL_TYPE_NAMES[normalise(name)]
}

// An account is inconsistent when its name is a canonical type label that
// contradicts its stored type, for example a `CASH` account stored as `bank`.
export function isAccountTypeConsistent(account: { name: string; type: string }): boolean {
  const canonical = canonicalTypeFromName(account.name)
  return canonical === undefined || canonical === account.type
}

export function findAccountsMatchingQuestion(
  finance: FinanceState,
  query: string,
): readonly { id: string; name: string }[] {
  const input = normalise(query)
  return getActiveAccounts(finance)
    .filter((account) => {
      const name = normalise(account.name)
      if (name.length > 1 && input.includes(name)) return true
      // A type-word match is only trustworthy when the stored type is not
      // contradicted by a canonical account name.
      return input.split(' ').includes(account.type) && isAccountTypeConsistent(account)
    })
    .map((account) => ({ id: account.id, name: account.name }))
}

// Roman Urdu asks "kitne"/"kitnay" as often as "kitna", and names the money
// itself ("paise", "paisy") rather than the word balance. Only recognising the
// English spellings is what sent an ordinary balance question to the model.
const BALANCE_QUESTION_CUE =
  /\b(balance|available|kitna|kitni|kitne|kitnay|how much|current|currently|total|batao|bata|bta|what is|whats|hai|hain|hein)\b/u
const BALANCE_MONEY_CUE = /\b(balance|paisa|paise|paisay|paisy|money|cash|funds|rupay|rupees)\b/u
const BALANCE_NON_READ_CUE =
  /\b(should|chahiye|karun|karoon|karna|if|agar|would|could|advice|suggest|edit|update|delete|remove|move|transfer|send|bhej|withdraw|nikal)\b/u

function isAccountBalanceQuestion(input: string): boolean {
  if (isAssistantActionCommand(input) || BALANCE_NON_READ_CUE.test(input)) return false
  return BALANCE_MONEY_CUE.test(input) && BALANCE_QUESTION_CUE.test(input)
}

// A general balance question asks what is on hand without naming an account or
// an account type. It has to be separated from advice, because the same money
// words appear in "how much should I give my mother", which is a conversation
// the model owns. So a read needs a money noun and a quantity word, and any
// action or advice shape disqualifies it.
const GENERAL_BALANCE_MONEY = /\b(balance|paisa|paise|paisay|paisy|money|cash|funds|rupay|rupees)\b/u
const GENERAL_BALANCE_ASK =
  /\b(kitne|kitna|kitni|kitnay|how much|how many|current|currently|available|total|batao|bata|bta|what is|whats|hai|hain|hein)\b/u
const GENERAL_BALANCE_EXCLUDE =
  /\b(dena|dene|deni|doon|dun|dedo|dedun|give|bhej|bhejo|send|transfer|add|record|create|deposit|topup|edit|update|delete|remove|move|spend|kharch|kharcha|save|bacha|bachana|invest|budget|plan|should|chahiye|karun|karoon|karna|karo|udhaar|udhar|qarz|loan|maang|maangna|withdraw|nikal|nikalo|jama|daal|dalo|agar|if|would|could)\b/u

function isGeneralBalanceQuestion(input: string): boolean {
  if (GENERAL_BALANCE_EXCLUDE.test(input)) return false
  return GENERAL_BALANCE_MONEY.test(input) && GENERAL_BALANCE_ASK.test(input)
}

// The total across active accounts, reported from the account records
// themselves. Accounts whose stored type contradicts a canonical name are not
// silently folded into a total, and an empty record set says so rather than
// implying a zero balance is a real reading.
function generalBalanceAnswer(
  context: AssistantFinancialContext,
  language: 'english' | 'roman-urdu',
): AssistantResponse {
  const inconsistent = context.accounts.filter((account) => !isAccountTypeConsistent(account))
  if (inconsistent.length) {
    const label = inconsistent.map((account) => account.name).join(', ')
    return {
      intent: 'available-balance',
      text: language === 'roman-urdu'
        ? `${label} ka saved account type us ke naam se match nahi karta, is liye main total balance confirm nahi kar sakta. Profile ke Accounts section mein account type theek kar dein.`
        : `The saved account type for ${label} does not match its name, so I cannot confirm your total balance. Please correct the account type in Profile under Accounts.`,
    }
  }
  if (!context.accounts.length) {
    return {
      intent: 'available-balance',
      text: language === 'roman-urdu'
        ? 'Abhi aap ke records mein koi active account add nahi hai, is liye balance batane ke liye kuch mojood nahi.'
        : 'There is no active account in your records yet, so there is no balance to report.',
    }
  }
  const total = context.accounts.reduce((sum, account) => sum + account.balance, 0)
  return {
    intent: 'available-balance',
    text: language === 'roman-urdu'
      ? 'Yeh aap ke active accounts ka current recorded total hai.'
      : 'This is the current recorded total across your active accounts.',
    insight: {
      title: 'Total balance',
      metrics: [{ label: 'Total balance', amount: total }],
      rows: context.accounts.map((account) => ({ label: account.name, amount: account.balance })),
    },
  }
}

export function getAuthoritativeAccountBalanceAnswer(
  question: string,
  context: AssistantFinancialContext,
  language: 'english' | 'roman-urdu' = 'english',
): AssistantResponse | undefined {
  const input = normalise(question)
  if (!isAccountBalanceQuestion(input)) return undefined

  const requestedType = ['cash', 'bank', 'wallet', 'savings']
    .find((type) => input.split(' ').includes(type))
  const namedAccounts = context.accounts.filter((account) => {
    const label = normalise(account.name)
    return label.length > 1 && input.includes(label)
  })
  if (!requestedType && !namedAccounts.length) {
    // No account and no type named. A general balance read is still
    // authoritative and answered from the records; anything else is a
    // conversation and stays with the model.
    return isGeneralBalanceQuestion(input) ? generalBalanceAnswer(context, language) : undefined
  }

  const accounts = namedAccounts.length
    ? namedAccounts
    : context.accounts.filter((account) => account.type === requestedType)

  // Never answer with an account whose stored type contradicts a canonical
  // name. The configuration has to be corrected first.
  const inconsistent = accounts.filter((account) => !isAccountTypeConsistent(account))
  if (inconsistent.length) {
    const label = inconsistent.map((account) => account.name).join(', ')
    return {
      intent: 'available-balance',
      text: language === 'roman-urdu'
        ? `${label} ka saved account type us ke naam se match nahi karta, is liye main balance confirm nahi kar sakta. Profile ke Accounts section mein account type theek kar dein.`
        : `The saved account type for ${label} does not match its name, so I cannot confirm that balance. Please correct the account type in Profile under Accounts.`,
    }
  }

  if (!accounts.length) {
    const requestedLabel = requestedType ?? 'requested'
    const available = context.accounts.map((account) => account.name).join(', ')
    return {
      intent: 'available-balance',
      text: language === 'roman-urdu'
        ? `Aap ke current records mein ${requestedLabel} account add nahi hai.${available ? ` Available account: ${available}.` : ''}`
        : `The ${requestedLabel} account is not in your current records.${available ? ` Available account: ${available}.` : ''}`,
    }
  }

  const amount = accounts.reduce((sum, account) => sum + account.balance, 0)
  const label = accounts.map((account) => account.name).join(', ')
  return {
    intent: 'available-balance',
    text: language === 'roman-urdu'
      ? `${label} ka current recorded balance yeh hai.`
      : `This is the current recorded balance for ${label}.`,
    insight: { title: 'Account balance', metrics: [{ label, amount }] },
  }
}

// Emergency-only exact answers. This is not part of the normal message path;
// it preserves authoritative local facts when the provider is unavailable.
export function getDeterministicFinancialAnswer(
  question: string,
  context: AssistantFinancialContext,
): AssistantResponse | undefined {
  const input = normalise(question)
  if (isAssistantActionCommand(input)) return undefined
  if (/\b(should|chahiye|advice|suggest|recommend|reduce|improve|plan|budget|if|agar|would|could)\b/u.test(input)) return undefined
  const accountAnswer = getAuthoritativeAccountBalanceAnswer(question, context)
  if (accountAnswer) return accountAnswer

  const metric = (title: string, amount: number, text: string): AssistantResponse => ({
    intent: 'available-balance',
    text,
    insight: { title, metrics: [{ label: title, amount }] },
  })
  const wantsRecordList = /\b(who|which|list|show|kaun|kon|kisi|aur|else)\b/u.test(input)
  const mentionsReceivables = /\b(receivable|receivables|owed to me|owe me|lene|lenay)\b/u.test(input)
  const mentionsPayables = /\b(payable|payables|owe|owed by me|dene|denay)\b/u.test(input)
  if (wantsRecordList && (mentionsReceivables || mentionsPayables)) {
    const records = [
      ...(mentionsReceivables ? context.receivables.map((item) => ({ ...item, detail: 'Receivable' })) : []),
      ...(mentionsPayables ? context.payables.map((item) => ({ ...item, detail: 'Payable' })) : []),
    ]
    return {
      intent: mentionsReceivables && !mentionsPayables ? 'receivables' : 'payables',
      text: records.length ? 'These are the current outstanding records.' : 'There are no matching outstanding records.',
      ...(records.length ? { insight: { title: 'Outstanding records', rows: records.slice(0, 10).map((item) => ({ label: item.label, detail: item.detail, amount: item.amount })) } } : {}),
    }
  }
  if (/\b(total|overall)\b/u.test(input) && /\b(balance|available)\b/u.test(input)) {
    return metric('Total balance', context.summary.totalBalance, 'This is your current total across active accounts.')
  }
  if (/\b(safe|safely)\b/u.test(input) && /\b(spend|spending)\b/u.test(input)) {
    return metric('Safe to spend', context.summary.safeToSpend, 'This is the locally calculated amount currently safe to spend.')
  }
  if (/\b(receivable|receive|lene|lenay)\b/u.test(input)) {
    return metric('Receivables', context.summary.receivables, 'This is the outstanding amount in your receivables.')
  }
  if (/\b(payable|owe|dene|denay)\b/u.test(input)) {
    return metric('Payables', context.summary.payables, 'This is the outstanding amount in your payables.')
  }
  if (/\b(income|earned|received)\b/u.test(input)) {
    return metric('Monthly income', context.summary.monthlyIncome, 'This is your recorded income for the current reporting month.')
  }
  if (/\b(expense|expenses|spent|spending)\b/u.test(input)) {
    return metric('Monthly expenses', context.summary.monthlyExpenses, 'This is your recorded expense total for the current reporting month.')
  }
  if (/\b(commitment|commitments)\b/u.test(input)) {
    return metric('Remaining commitments', context.summary.commitments, 'This is the remaining amount in your known commitments.')
  }
  if (/\b(overdue)\b/u.test(input)) {
    return metric('Overdue total', context.summary.overdueTotal, 'This is the current total of overdue planning items.')
  }
  if (/\b(financial position|money looking|position)\b/u.test(input)) {
    return {
      intent: 'financial-position',
      text: `Your locally calculated financial position is ${context.financialPosition.toLocaleLowerCase()}.`,
      insight: {
        title: 'Financial position',
        metrics: [
          { label: 'Total balance', amount: context.summary.totalBalance },
          { label: 'Safe to spend', amount: context.summary.safeToSpend },
        ],
      },
    }
  }
  return undefined
}

// A batch child supplies its own stable id derived from the turn, so a replayed
// or restored batch keeps the same child ids and idempotency keys and cannot be
// executed twice under new identities.
function proposalBase(draft: AssistantActionDraft, now: number, idSeed?: string) {
  const proposalId = idSeed ?? `assistant-action-${now}-${Math.random().toString(36).slice(2, 8)}`
  return {
    proposalId,
    amountPkr: draft.amountPkr,
    description: draft.description.trim().slice(0, 120),
    effectiveDate: draft.effectiveDate,
    createdAt: now,
    status: 'proposed' as const,
    idempotencyKey: proposalId,
  }
}

// The counterparty is free text supplied by the model, so it is bounded and
// stripped of control characters before it can reach a stored record.
function normaliseCounterparty(value: string | undefined): string | undefined {
  const name = value?.replaceAll(/[\p{C}]/gu, ' ').replaceAll(/\s+/gu, ' ').trim().slice(0, 60)
  return name?.length ? name : undefined
}

function accountName(finance: FinanceState, id: string | undefined): string | undefined {
  return id
    ? getActiveAccounts(finance).find((account) => account.id === id)?.name
    : undefined
}

export function createAssistantProposalFromDraft(
  draft: AssistantActionDraft,
  finance: FinanceState,
  planning: PlanningState,
  now = Date.now(),
  idSeed?: string,
): { proposal?: AssistantActionProposal; error?: string } {
  const permitsZero = draft.actionType === 'create-account' || draft.actionType === 'update-account' || draft.actionType === 'update-preference'
  if (!Number.isSafeInteger(draft.amountPkr) || draft.amountPkr < (permitsZero ? 0 : 1) || draft.amountPkr > 100_000_000) {
    return { error: 'The proposed PKR amount is invalid.' }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(draft.effectiveDate)) {
    return { error: 'The proposed date is invalid.' }
  }
  const base = proposalBase(draft, now, idSeed)
  const amount = draft.amountPkr.toLocaleString('en-PK')
  let proposal: AssistantActionProposal

  if (draft.actionType === 'add-income') {
    const target = accountName(finance, draft.targetAccountId)
    if (!target || !draft.targetAccountId) return { error: 'The requested income account is not available.' }
    proposal = { ...base, actionType: 'add-income', targetAccountId: draft.targetAccountId, summary: `Record PKR ${amount} as income in ${target}.` }
  } else if (draft.actionType === 'add-expense') {
    const source = accountName(finance, draft.sourceAccountId)
    if (!source || !draft.sourceAccountId) return { error: 'The requested expense account is not available.' }
    proposal = { ...base, actionType: 'add-expense', sourceAccountId: draft.sourceAccountId, summary: `Record a PKR ${amount} expense from ${source}.` }
  } else if (draft.actionType === 'transfer') {
    const source = accountName(finance, draft.sourceAccountId)
    const target = accountName(finance, draft.targetAccountId)
    if (!source || !target || !draft.sourceAccountId || !draft.targetAccountId) return { error: 'Both transfer accounts must be active.' }
    proposal = { ...base, actionType: 'transfer', sourceAccountId: draft.sourceAccountId, targetAccountId: draft.targetAccountId, summary: `Transfer PKR ${amount} from ${source} to ${target}.` }
  } else if (draft.actionType === 'account-adjustment') {
    const target = accountName(finance, draft.targetAccountId)
    if (!target || !draft.targetAccountId) return { error: 'The requested adjustment account is not available.' }
    proposal = { ...base, actionType: 'account-adjustment', targetAccountId: draft.targetAccountId, summary: `Add PKR ${amount} to ${target} as an account adjustment.` }
  } else if (draft.actionType === 'receive-receivable') {
    const target = accountName(finance, draft.targetAccountId)
    const record = draft.recordId ? findReceivable(planning, draft.recordId) : undefined
    if (!target || !draft.targetAccountId || !record) return { error: 'The receivable or destination account is no longer available.' }
    proposal = { ...base, actionType: 'receive-receivable', targetAccountId: draft.targetAccountId, recordId: record.id, summary: `Receive PKR ${amount} from ${record.counterparty} into ${target}.` }
  } else if (draft.actionType === 'pay-payable') {
    const source = accountName(finance, draft.sourceAccountId)
    const record = draft.recordId ? findPayable(planning, draft.recordId) : undefined
    if (!source || !draft.sourceAccountId || !record) return { error: 'The payable or source account is no longer available.' }
    proposal = { ...base, actionType: 'pay-payable', sourceAccountId: draft.sourceAccountId, recordId: record.id, summary: `Pay PKR ${amount} to ${record.counterparty} from ${source}.` }
  } else if (draft.actionType === 'settle-commitment') {
    // Marking a commitment paid advances a recurring due date or settles a
    // one-time one. The domain moves no money, so no account is resolved and no
    // balance is checked; the amount is taken from the record rather than the
    // model, so a wrong figure cannot reach the preview.
    const record = draft.recordId ? findCommitment(planning, draft.recordId) : undefined
    if (!record) return { error: 'That commitment is no longer available.' }
    if (record.isArchived) return { error: 'Restore this commitment before marking it paid.' }
    if (record.isSettled) return { error: 'This commitment is already marked paid.' }
    proposal = {
      ...base,
      amountPkr: record.amount,
      actionType: 'settle-commitment',
      recordId: record.id,
      summary: `Mark the ${record.frequency} ${record.label} commitment of PKR ${record.amount.toLocaleString('en-PK')} as paid.`,
    }
  } else if (draft.actionType === 'add-receivable' || draft.actionType === 'add-payable') {
    // A new planning record moves no money, so there is no account to resolve
    // and no balance to check. The counterparty is the one thing that must be
    // present, and it is taken from the draft rather than invented here.
    const counterparty = normaliseCounterparty(draft.counterparty)
    if (!counterparty) return { error: 'The person or party for this record is missing.' }
    proposal = draft.actionType === 'add-receivable'
      ? { ...base, actionType: 'add-receivable', counterparty, summary: `Record that ${counterparty} owes you PKR ${amount}, due ${draft.effectiveDate}.` }
      : { ...base, actionType: 'add-payable', counterparty, summary: `Record that you owe ${counterparty} PKR ${amount}, due ${draft.effectiveDate}.` }
  } else if (draft.actionType === 'add-commitment') {
    const frequency = draft.commitmentFrequency
    if (!frequency) return { error: 'The commitment frequency is missing.' }
    proposal = { ...base, actionType: 'add-commitment', commitmentFrequency: frequency, summary: `Add a ${frequency} PKR ${amount} commitment due ${draft.effectiveDate}.` }
  } else if (draft.actionType === 'create-account' || draft.actionType === 'update-account') {
    const accountTypes = new Set(['cash', 'bank', 'wallet', 'savings', 'other'])
    const accountNameValue = normaliseCounterparty(draft.accountName)
    if (!accountNameValue || !draft.accountType || !accountTypes.has(draft.accountType)) return { error: 'The account name or type is invalid.' }
    const openingBalance = draft.openingBalance ?? draft.amountPkr
    if (!Number.isSafeInteger(openingBalance) || openingBalance < 0 || openingBalance > 100_000_000) return { error: 'The opening balance is invalid.' }
    const fields = {
      accountName: accountNameValue,
      accountType: draft.accountType,
      openingBalance,
      ...(draft.institutionName?.trim() ? { institutionName: draft.institutionName.trim().slice(0, 80) } : {}),
      ...(draft.lastFourDigits?.trim() ? { lastFourDigits: draft.lastFourDigits.trim() } : {}),
      ...(draft.makeDefault === undefined ? {} : { makeDefault: draft.makeDefault }),
    }
    if (draft.actionType === 'create-account') {
      proposal = { ...base, amountPkr: openingBalance, actionType: 'create-account', ...fields, summary: `Create ${accountNameValue} as a ${draft.accountType} account with an opening balance of PKR ${openingBalance.toLocaleString('en-PK')}.` }
    } else {
      const existing = draft.targetAccountId ? finance.accounts.find((account) => account.id === draft.targetAccountId) : undefined
      if (!existing || !draft.targetAccountId) return { error: 'The account to update is no longer available.' }
      proposal = { ...base, amountPkr: openingBalance, actionType: 'update-account', targetAccountId: existing.id, ...fields, summary: `Update ${existing.name} to ${accountNameValue} with a PKR ${openingBalance.toLocaleString('en-PK')} opening balance.` }
    }
  } else if (draft.actionType === 'archive-account' || draft.actionType === 'restore-account' || draft.actionType === 'set-default-account') {
    const account = draft.targetAccountId ? finance.accounts.find((item) => item.id === draft.targetAccountId) : undefined
    if (!account || !draft.targetAccountId) return { error: 'The requested account is no longer available.' }
    const verb = draft.actionType === 'archive-account' ? 'Archive' : draft.actionType === 'restore-account' ? 'Restore' : 'Make'
    const suffix = draft.actionType === 'set-default-account' ? ' the default account' : ''
    proposal = { ...base, amountPkr: getAccountBalance(finance, account.id), actionType: draft.actionType, targetAccountId: account.id, summary: `${verb} ${account.name}${suffix}.` }
  } else if (draft.actionType === 'update-transaction' || draft.actionType === 'delete-transaction') {
    const transaction = draft.recordId ? finance.transactions.find((item) => item.id === draft.recordId) : undefined
    if (!transaction || !draft.recordId) return { error: 'The transaction is no longer available.' }
    if (draft.actionType === 'delete-transaction') {
      proposal = { ...base, amountPkr: transaction.amount, effectiveDate: transaction.date, description: transaction.title, actionType: 'delete-transaction', recordId: transaction.id, summary: `Delete the PKR ${transaction.amount.toLocaleString('en-PK')} ${transaction.title} transaction dated ${transaction.date}.` }
    } else {
      const transactionTypes = new Set(['income', 'expense', 'transfer'])
      const transactionType = draft.transactionType
      if (!transactionType || !transactionTypes.has(transactionType) || !draft.sourceAccountId || !draft.categoryId) return { error: 'The transaction update is incomplete.' }
      const source = accountName(finance, draft.sourceAccountId)
      const destination = draft.targetAccountId ? accountName(finance, draft.targetAccountId) : undefined
      if (!source || (transactionType === 'transfer' && !destination)) return { error: 'The transaction account is no longer active.' }
      proposal = {
        ...base,
        actionType: 'update-transaction',
        recordId: transaction.id,
        transactionType,
        categoryId: draft.categoryId,
        sourceAccountId: draft.sourceAccountId,
        ...(draft.targetAccountId ? { targetAccountId: draft.targetAccountId } : {}),
        ...(draft.personOrBusiness?.trim() ? { personOrBusiness: draft.personOrBusiness.trim().slice(0, 80) } : {}),
        ...(draft.note?.trim() ? { note: draft.note.trim().slice(0, 240) } : {}),
        summary: `Update ${transaction.title} to a PKR ${draft.amountPkr.toLocaleString('en-PK')} ${transactionType} from ${source}${destination ? ` to ${destination}` : ''}.`,
      }
    }
  } else if (draft.actionType === 'update-receivable' || draft.actionType === 'update-payable') {
    const receiving = draft.actionType === 'update-receivable'
    const record = draft.recordId
      ? receiving ? findReceivable(planning, draft.recordId) : findPayable(planning, draft.recordId)
      : undefined
    const counterparty = normaliseCounterparty(draft.counterparty)
    if (!record || !draft.recordId || !counterparty) return { error: 'The planning record update is incomplete.' }
    const settledAmount = draft.settledAmount ?? (receiving ? 'receivedAmount' in record ? record.receivedAmount : 0 : 'paidAmount' in record ? record.paidAmount : 0)
    proposal = {
      ...base,
      actionType: draft.actionType,
      recordId: record.id,
      counterparty,
      settledAmount,
      ...(draft.targetAccountId ? { targetAccountId: draft.targetAccountId } : {}),
      ...(draft.note?.trim() ? { note: draft.note.trim().slice(0, 240) } : {}),
      summary: `Update the ${receiving ? 'receivable from' : 'payable to'} ${record.counterparty} to PKR ${draft.amountPkr.toLocaleString('en-PK')}, due ${draft.effectiveDate}.`,
    }
  } else if (draft.actionType === 'delete-receivable' || draft.actionType === 'delete-payable') {
    const receiving = draft.actionType === 'delete-receivable'
    const record = draft.recordId
      ? receiving ? findReceivable(planning, draft.recordId) : findPayable(planning, draft.recordId)
      : undefined
    if (!record || !draft.recordId) return { error: 'The planning record is no longer available.' }
    proposal = { ...base, amountPkr: record.originalAmount, effectiveDate: record.dueDate, description: record.counterparty, actionType: draft.actionType, recordId: record.id, summary: `Delete the ${receiving ? 'receivable from' : 'payable to'} ${record.counterparty} for PKR ${record.originalAmount.toLocaleString('en-PK')}.` }
  } else if (draft.actionType === 'update-commitment') {
    const record = draft.recordId ? findCommitment(planning, draft.recordId) : undefined
    if (!record || !draft.commitmentFrequency || !draft.categoryId) return { error: 'The commitment update is incomplete.' }
    proposal = {
      ...base,
      actionType: 'update-commitment',
      recordId: record.id,
      commitmentFrequency: draft.commitmentFrequency,
      categoryId: draft.categoryId,
      ...(draft.targetAccountId ? { targetAccountId: draft.targetAccountId } : {}),
      ...(draft.note?.trim() ? { note: draft.note.trim().slice(0, 240) } : {}),
      summary: `Update ${record.label} to PKR ${draft.amountPkr.toLocaleString('en-PK')} ${draft.commitmentFrequency}, due ${draft.effectiveDate}.`,
    }
  } else if (draft.actionType === 'archive-commitment' || draft.actionType === 'restore-commitment' || draft.actionType === 'delete-commitment') {
    const record = draft.recordId ? findCommitment(planning, draft.recordId) : undefined
    if (!record || !draft.recordId) return { error: 'The commitment is no longer available.' }
    const verb = draft.actionType === 'archive-commitment' ? 'Archive' : draft.actionType === 'restore-commitment' ? 'Restore' : 'Delete'
    proposal = { ...base, amountPkr: record.amount, effectiveDate: record.dueDate, description: record.label, actionType: draft.actionType, recordId: record.id, summary: `${verb} the ${record.label} commitment.` }
  } else if (draft.actionType === 'update-preference') {
    if (!draft.preferenceKey || (typeof draft.preferenceValue !== 'string' && typeof draft.preferenceValue !== 'boolean')) return { error: 'The preference update is incomplete.' }
    proposal = { ...base, amountPkr: 0, actionType: 'update-preference', preferenceKey: draft.preferenceKey, preferenceValue: draft.preferenceValue, summary: `Set ${draft.preferenceKey.replaceAll('-', ' ')} to ${String(draft.preferenceValue)}.` }
  } else {
    return { error: 'This action type is not supported.' }
  }

  const errors = validateAssistantProposal(proposal, finance, planning)
  return errors.length ? { error: errors[0] ?? 'The proposal is invalid.' } : { proposal }
}

export function validateAssistantProposal(
  proposal: AssistantActionProposal,
  finance: FinanceState,
  planning: PlanningState,
): readonly string[] {
  const errors: string[] = []
  const permitsZero = proposal.actionType === 'create-account' || proposal.actionType === 'update-account' || proposal.actionType === 'update-preference'
  if (!Number.isSafeInteger(proposal.amountPkr) || proposal.amountPkr < (permitsZero ? 0 : 1) || proposal.amountPkr > 100_000_000) errors.push(`Use a whole PKR amount from ${permitsZero ? '0' : '1'} to 100,000,000.`)
  if (proposal.status !== 'proposed' && proposal.status !== 'confirmed') errors.push('This proposal is no longer pending.')
  const active = new Set(getActiveAccounts(finance).map((account) => account.id))
  if (proposal.targetAccountId && !active.has(proposal.targetAccountId)) errors.push('The target account is no longer active.')
  if (proposal.sourceAccountId && !active.has(proposal.sourceAccountId)) errors.push('The source account is no longer active.')
  if (proposal.actionType === 'transfer') {
    if (proposal.sourceAccountId === proposal.targetAccountId) errors.push('Choose different accounts for a transfer.')
    if (getAccountBalance(finance, proposal.sourceAccountId) < proposal.amountPkr) errors.push('The source account does not have enough available balance.')
  }
  if ((proposal.actionType === 'add-expense' || proposal.actionType === 'pay-payable') && getAccountBalance(finance, proposal.sourceAccountId) < proposal.amountPkr) errors.push('The source account does not have enough available balance.')
  if (proposal.actionType === 'receive-receivable') {
    const record = findReceivable(planning, proposal.recordId)
    if (!record) errors.push('This receivable no longer exists.')
    else if (proposal.amountPkr > getReceivableRemainingAmount(record)) errors.push('The amount is more than the receivable still outstanding.')
  }
  if (proposal.actionType === 'pay-payable') {
    const record = findPayable(planning, proposal.recordId)
    if (!record) errors.push('This payable no longer exists.')
    else if (proposal.amountPkr > getPayableRemainingAmount(record)) errors.push('The amount is more than the payable still outstanding.')
  }
  if (proposal.actionType === 'add-commitment' && !/^\d{4}-\d{2}-\d{2}$/u.test(proposal.effectiveDate)) errors.push('The commitment needs a valid due date.')
  if (proposal.actionType === 'add-receivable' || proposal.actionType === 'add-payable') {
    if (!proposal.counterparty.trim()) errors.push('This record needs the name of the other person.')
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(proposal.effectiveDate)) errors.push('This record needs a valid due date.')
  }
  if (proposal.actionType === 'settle-commitment') {
    const record = findCommitment(planning, proposal.recordId)
    if (!record) errors.push('This commitment no longer exists.')
    else {
      if (record.isArchived) errors.push('Restore this commitment before marking it paid.')
      if (record.isSettled) errors.push('This commitment is already marked paid.')
      if (proposal.amountPkr !== record.amount) errors.push('The commitment amount changed. Prepare a new preview.')
    }
  }
  if (proposal.actionType === 'create-account' || proposal.actionType === 'update-account') {
    if (!proposal.accountName.trim()) errors.push('Enter an account name.')
    if (!new Set(['cash', 'bank', 'wallet', 'savings', 'other']).has(proposal.accountType)) errors.push('Choose a supported account type.')
    if (!Number.isSafeInteger(proposal.openingBalance) || proposal.openingBalance < 0 || proposal.openingBalance > 100_000_000) errors.push('Use a valid opening balance.')
    if (proposal.lastFourDigits && !/^\d{4}$/u.test(proposal.lastFourDigits)) errors.push('Last four digits must contain exactly four numbers.')
    const existingId = proposal.actionType === 'update-account' ? proposal.targetAccountId : undefined
    if (proposal.actionType === 'update-account' && !finance.accounts.some((account) => account.id === proposal.targetAccountId)) errors.push('This account no longer exists.')
    if (finance.accounts.some((account) => !account.isArchived && account.id !== existingId && normalise(account.name) === normalise(proposal.accountName))) errors.push('An active account already uses this name.')
  }
  if (proposal.actionType === 'archive-account' || proposal.actionType === 'restore-account' || proposal.actionType === 'set-default-account') {
    const account = finance.accounts.find((item) => item.id === proposal.targetAccountId)
    if (!account) errors.push('This account no longer exists.')
    else if (proposal.actionType === 'archive-account') {
      if (account.isArchived) errors.push('This account is already archived.')
      if (account.isDefault) errors.push('Set another active account as default before archiving this one.')
    } else if (proposal.actionType === 'restore-account') {
      if (!account.isArchived) errors.push('This account is already active.')
      if (finance.accounts.some((item) => !item.isArchived && item.id !== account.id && normalise(item.name) === normalise(account.name))) errors.push('An active account already uses this name.')
    } else if (account.isArchived) errors.push('Choose an active account as the default.')
  }
  if (proposal.actionType === 'update-transaction') {
    if (!finance.transactions.some((transaction) => transaction.id === proposal.recordId)) errors.push('This transaction no longer exists.')
    if (!active.has(proposal.sourceAccountId)) errors.push('The transaction source account is no longer active.')
    if (proposal.transactionType === 'transfer') {
      if (!proposal.targetAccountId || !active.has(proposal.targetAccountId)) errors.push('The transfer destination account is no longer active.')
      if (proposal.targetAccountId === proposal.sourceAccountId) errors.push('Choose different accounts for a transfer.')
    }
  }
  if (proposal.actionType === 'delete-transaction' && !finance.transactions.some((transaction) => transaction.id === proposal.recordId)) errors.push('This transaction no longer exists.')
  if (proposal.actionType === 'update-receivable' || proposal.actionType === 'update-payable') {
    const receiving = proposal.actionType === 'update-receivable'
    const record = receiving ? findReceivable(planning, proposal.recordId) : findPayable(planning, proposal.recordId)
    if (!record) errors.push('This planning record no longer exists.')
    if (!proposal.counterparty.trim()) errors.push('This planning record needs a counterparty.')
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(proposal.effectiveDate)) errors.push('This planning record needs a valid due date.')
    if (!Number.isSafeInteger(proposal.settledAmount) || (proposal.settledAmount ?? -1) < 0 || (proposal.settledAmount ?? 0) > proposal.amountPkr) errors.push('The settled amount must be between zero and the original amount.')
  }
  if (proposal.actionType === 'delete-receivable' && !findReceivable(planning, proposal.recordId)) errors.push('This receivable no longer exists.')
  if (proposal.actionType === 'delete-payable' && !findPayable(planning, proposal.recordId)) errors.push('This payable no longer exists.')
  if (proposal.actionType === 'update-commitment') {
    const record = findCommitment(planning, proposal.recordId)
    if (!record) errors.push('This commitment no longer exists.')
    else if (record.isArchived) errors.push('Restore this commitment before updating it.')
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(proposal.effectiveDate)) errors.push('This commitment needs a valid due date.')
  }
  if (proposal.actionType === 'archive-commitment' || proposal.actionType === 'restore-commitment' || proposal.actionType === 'delete-commitment') {
    const record = findCommitment(planning, proposal.recordId)
    if (!record) errors.push('This commitment no longer exists.')
    else if (proposal.actionType === 'archive-commitment' && record.isArchived) errors.push('This commitment is already archived.')
    else if (proposal.actionType === 'restore-commitment' && !record.isArchived) errors.push('This commitment is already active.')
  }
  if (proposal.actionType === 'update-preference') {
    const allowed: Readonly<Record<NonNullable<AssistantActionDraft['preferenceKey']>, readonly (string | boolean)[] | 'text'>> = {
      'profile-name': 'text',
      'income-type': ['variable', 'fixed', 'mixed'],
      'financial-position-style': ['simple', 'detailed'],
      'hide-balances-on-launch': [true, false],
      'assistant-response-style': ['concise', 'balanced', 'detailed'],
      'assistant-calculations': [true, false],
      'assistant-suggestions': [true, false],
      'theme-preference': ['system', 'light', 'dark'],
      'privacy-mode': [true, false],
      'personalization-enabled': [true, false],
    }
    const choices = allowed[proposal.preferenceKey]
    if (choices === 'text') {
      if (typeof proposal.preferenceValue !== 'string' || !proposal.preferenceValue.trim() || proposal.preferenceValue.length > 80) errors.push('The profile name is invalid.')
    } else if (!choices.includes(proposal.preferenceValue)) errors.push('The preference value is invalid.')
  }
  return errors
}
