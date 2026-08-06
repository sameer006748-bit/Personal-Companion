import { format } from 'date-fns'
import { ArrowUp, MessageCircleMore, SendHorizontal, Sparkles } from 'lucide-react'
import type { FormEvent, KeyboardEvent, RefObject } from 'react'

import type {
  AssistantActionBatch,
  AssistantActionProposal,
  AssistantActionReceipt,
  AssistantInsight,
  AssistantMessage,
} from '../../models/assistant'
import { PrivateAmount } from '../../shared/ui/PrivateAmount'

const assistantSuggestions = [
  'How is my money looking right now?',
  'Help me plan this month.',
  'What needs my attention?',
] as const

interface AssistantIntroProps {
  greeting: string
  name: string
}

export function AssistantIntro({ greeting, name }: AssistantIntroProps) {
  return (
    <section className="assistant-intro glass-hero" aria-labelledby="assistant-intro-title">
      <div className="assistant-intro-icon" aria-hidden="true">
        <Sparkles />
      </div>
      <div>
        <p className="assistant-status">Using your current financial overview</p>
        <h2 id="assistant-intro-title">
          {greeting}, {name}.
        </h2>
        <p>
          Talk naturally about money, plans, decisions, or anything weighing on you.
        </p>
      </div>
    </section>
  )
}

interface AssistantSuggestionsProps {
  onSelect: (question: string) => void
}

export function AssistantSuggestions({ onSelect }: AssistantSuggestionsProps) {
  return (
    <section className="assistant-suggestions" aria-labelledby="assistant-suggestions-title">
      <p id="assistant-suggestions-title" className="assistant-section-label">
        Suggested questions
      </p>
      <div className="assistant-suggestion-list">
        {assistantSuggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className="glass-control assistant-suggestion"
            onClick={() => onSelect(suggestion)}
          >
            {suggestion}
            <ArrowUp aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  )
}

function AssistantInsightView({ insight }: { insight: AssistantInsight }) {
  return (
    <section className="assistant-insight" aria-label={insight.title}>
      <p>{insight.title}</p>
      {insight.metrics ? (
        <div className="assistant-insight-metrics">
          {insight.metrics.map((metric) => (
            <div key={metric.label} className={`assistant-metric tone-${metric.tone ?? 'default'}`}>
              <span>{metric.label}</span>
              <PrivateAmount
                amount={metric.amount}
                {...(metric.sign ? { sign: metric.sign } : {})}
              />
            </div>
          ))}
        </div>
      ) : null}
      {insight.rows ? (
        <div className="assistant-insight-rows">
          {insight.rows.map((row) => (
            <div key={row.label} className={`assistant-insight-row tone-${row.tone ?? 'default'}`}>
              <div>
                <strong>{row.label}</strong>
                {row.detail ? <span>{row.detail}</span> : null}
              </div>
              {typeof row.amount === 'number' ? <PrivateAmount amount={row.amount} /> : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function proposalTitle(actionType: AssistantActionProposal['actionType']): string {
  return {
    'add-income': 'Record income', 'add-expense': 'Record expense', transfer: 'Review transfer',
    'account-adjustment': 'Review account adjustment', 'receive-receivable': 'Mark receivable received',
    'pay-payable': 'Mark payable paid', 'add-commitment': 'Add commitment',
    'add-receivable': 'Record money owed to you', 'add-payable': 'Record money you owe',
    'settle-commitment': 'Mark commitment paid',
    'create-account': 'Create account', 'update-account': 'Update account',
    'archive-account': 'Archive account', 'restore-account': 'Restore account',
    'set-default-account': 'Set default account', 'update-transaction': 'Update transaction',
    'delete-transaction': 'Delete transaction', 'update-receivable': 'Update receivable',
    'delete-receivable': 'Delete receivable', 'update-payable': 'Update payable',
    'delete-payable': 'Delete payable', 'update-commitment': 'Update commitment',
    'archive-commitment': 'Archive commitment', 'restore-commitment': 'Restore commitment',
    'delete-commitment': 'Delete commitment', 'update-preference': 'Update preference',
  }[actionType]
}

function AssistantActionPreview({ proposal, isExecuting, onConfirm, onCancel }: {
  proposal: AssistantActionProposal
  isExecuting: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const isPending = proposal.status === 'proposed'
  const kicker = isPending ? 'Review before recording' : proposal.status === 'cancelled' ? 'Cancelled' : proposal.status === 'superseded' ? 'Replaced' : 'Could not complete'
  const stateText = proposal.status === 'cancelled'
    ? 'Nothing changed.'
    : proposal.status === 'superseded'
      ? 'A newer preview replaced this one.'
      : proposal.status === 'failed'
        ? 'Nothing was recorded. Review current records and prepare a new preview.'
        : 'This preview is no longer active.'
  return (
    <section className={`assistant-action-preview glass-elevated is-${proposal.status}`} aria-label={proposalTitle(proposal.actionType)}>
      <p className="assistant-action-kicker">{kicker}</p>
      <h3>{proposalTitle(proposal.actionType)}</h3>
      {proposal.actionType !== 'update-preference' ? <PrivateAmount amount={proposal.amountPkr} /> : null}
      <p>{proposal.summary}</p>
      {isPending ? <p className="assistant-action-note">Nothing will change until you confirm.</p> : null}
      {isPending ? <div className="assistant-action-buttons">
        <button type="button" className="assistant-action-confirm" disabled={isExecuting} onClick={onConfirm}>Confirm and record</button>
        <button type="button" className="glass-control" disabled={isExecuting} onClick={onCancel}>Cancel</button>
      </div> : <p className="assistant-action-state">{stateText}</p>}
    </section>
  )
}

function AssistantReceipt({ amount, affectedLabel, resultingAmount, completedAt }: { amount: number; affectedLabel: string; resultingAmount?: number; completedAt: number }) {
  return <section className="assistant-action-receipt" aria-label="Action completed">
    <strong>Action completed</strong>
    <PrivateAmount amount={amount} />
    <span>{affectedLabel}</span>
    {typeof resultingAmount === 'number' ? <span>Updated amount: <PrivateAmount amount={resultingAmount} /></span> : null}
    <span>{format(completedAt, 'h:mm a')} · Recorded by Assistant after confirmation</span>
  </section>
}

// A compound request is previewed as one card carrying every child, so nothing
// the user asked for can be missing from what they are confirming. Confirm All
// is the only control: the children are executed together or not at all, so
// there is deliberately no per-child confirm button.
function AssistantActionBatchPreview({ batch, isExecuting, onConfirm, onCancel }: {
  batch: AssistantActionBatch
  isExecuting: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const isPending = batch.status === 'proposed'
  const kicker = isPending
    ? `Review ${batch.actionCount} actions before recording`
    : batch.status === 'cancelled' ? 'Cancelled' : batch.status === 'superseded' ? 'Replaced' : 'Could not complete'
  const stateText = batch.status === 'cancelled'
    ? 'Nothing changed.'
    : batch.status === 'superseded'
      ? 'A newer preview replaced this one.'
      : batch.status === 'failed'
        ? 'Nothing was recorded. Review current records and prepare a new preview.'
        : 'This preview is no longer active.'
  return (
    <section className={`assistant-action-preview glass-elevated is-${batch.status}`} aria-label={`Review ${batch.actionCount} actions`}>
      <p className="assistant-action-kicker">{kicker}</p>
      <h3>{batch.actionCount} actions</h3>
      <ol className="assistant-action-batch-list">
        {batch.proposals.map((child) => (
          <li key={child.proposalId} className="assistant-action-batch-item">
            <strong>{proposalTitle(child.actionType)}</strong>
            <PrivateAmount amount={child.amountPkr} />
            <span>{child.summary}</span>
          </li>
        ))}
      </ol>
      {isPending ? <p className="assistant-action-note">Nothing will change until you confirm all of them.</p> : null}
      {isPending ? <div className="assistant-action-buttons">
        <button type="button" className="assistant-action-confirm" disabled={isExecuting} onClick={onConfirm}>Confirm all and record</button>
        <button type="button" className="glass-control" disabled={isExecuting} onClick={onCancel}>Cancel</button>
      </div> : <p className="assistant-action-state">{stateText}</p>}
    </section>
  )
}

// One receipt for the whole batch, listing every child. The preview is not
// rendered alongside it, so a completed batch shows exactly one card.
function AssistantBatchReceipt({ receipts }: { receipts: readonly AssistantActionReceipt[] }) {
  const first = receipts[0]
  return <section className="assistant-action-receipt" aria-label="Actions completed">
    <strong>{receipts.length} actions completed</strong>
    <ul className="assistant-action-batch-list">
      {receipts.map((receipt) => (
        <li key={receipt.proposalId} className="assistant-action-batch-item">
          <PrivateAmount amount={receipt.amountPkr} />
          <span>{receipt.affectedLabel}</span>
          {typeof receipt.resultingAmount === 'number' ? <span>Updated amount: <PrivateAmount amount={receipt.resultingAmount} /></span> : null}
        </li>
      ))}
    </ul>
    {first ? <span>{format(first.completedAt, 'h:mm a')} · Recorded by Assistant after confirmation</span> : null}
  </section>
}

function AssistantMemoryPreview({ proposal, onSave, onReject }: { proposal: NonNullable<AssistantMessage['memoryProposal']>; onSave: () => void; onReject: () => void }) {
  return <section className="assistant-memory-preview glass-elevated" aria-label="Memory confirmation">
    <p className="assistant-action-kicker">Remember for future conversations?</p>
    <strong>{proposal.displayLabel}</strong>
    <span>{proposal.reason}</span>
    {proposal.status === 'proposed' ? <div className="assistant-action-buttons"><button type="button" className="assistant-action-confirm" onClick={onSave}>Save memory</button><button type="button" className="glass-control" onClick={onReject}>Not now</button></div> : <span>{proposal.status === 'saved' ? 'Saved.' : 'Not saved.'}</span>}
  </section>
}

interface AssistantMessageListProps {
  messages: readonly AssistantMessage[]
  onFollowUp: (question: string) => void
  onConfirmProposal: (message: AssistantMessage) => void
  onCancelProposal: (message: AssistantMessage) => void
  onSaveMemory: (message: AssistantMessage) => void
  onRejectMemory: (message: AssistantMessage) => void
  executingProposalId?: string
  isPending?: boolean
  endRef: RefObject<HTMLDivElement | null>
}

export function AssistantMessageList({
  messages,
  onFollowUp,
  onConfirmProposal,
  onCancelProposal,
  onSaveMemory,
  onRejectMemory,
  executingProposalId,
  isPending = false,
  endRef,
}: AssistantMessageListProps) {
  return (
    <section className="assistant-conversation" aria-label="Assistant conversation" aria-live="polite">
      {messages.map((message) => (
        <article key={message.id} className={`assistant-message is-${message.role}`}>
          <div className="assistant-message-heading">
            <span>{message.role === 'assistant' ? 'Personal Companion' : 'You'}</span>
            <time dateTime={new Date(message.timestamp).toISOString()}>
              {format(message.timestamp, 'h:mm a')}
            </time>
          </div>
          <p>{message.text}</p>
          {message.proposal && message.proposal.status !== 'executed' ? <AssistantActionPreview proposal={message.proposal} isExecuting={executingProposalId === message.proposal.proposalId} onConfirm={() => onConfirmProposal(message)} onCancel={() => onCancelProposal(message)} /> : null}
          {message.batch && message.batch.status !== 'executed' ? <AssistantActionBatchPreview batch={message.batch} isExecuting={executingProposalId === message.batch.batchId} onConfirm={() => onConfirmProposal(message)} onCancel={() => onCancelProposal(message)} /> : null}
          {message.batch?.receipts?.length ? <AssistantBatchReceipt receipts={message.batch.receipts} /> : null}
          {message.receipt ? <AssistantReceipt amount={message.receipt.amountPkr} affectedLabel={message.receipt.affectedLabel} completedAt={message.receipt.completedAt} {...(message.receipt.resultingAmount === undefined ? {} : { resultingAmount: message.receipt.resultingAmount })} /> : null}
          {message.memoryProposal ? <AssistantMemoryPreview proposal={message.memoryProposal} onSave={() => onSaveMemory(message)} onReject={() => onRejectMemory(message)} /> : null}
          {message.insight ? <AssistantInsightView insight={message.insight} /> : null}
          {message.followUps?.length ? (
            <div className="assistant-follow-ups" aria-label="Suggested follow-up questions">
              {message.followUps.map((followUp) => (
                <button
                  key={followUp.id}
                  type="button"
                  className="glass-control"
                  onClick={() => onFollowUp(followUp.label)}
                >
                  {followUp.label}
                </button>
              ))}
            </div>
          ) : null}
        </article>
      ))}
      {isPending ? <article className="assistant-message is-assistant is-pending" aria-label="Assistant is thinking"><div className="assistant-message-heading"><span>Personal Companion</span></div><p>Thinking…</p></article> : null}
      <div ref={endRef} />
    </section>
  )
}

interface AssistantClearHistoryProps {
  onConfirm: () => void
  onCancel: () => void
}

// Deliberately an inline panel rather than a modal: it confirms explicitly
// without seizing focus from the page or animating over the conversation, and it
// states exactly what is and is not removed so the action cannot be mistaken for
// deleting financial data.
export function AssistantClearHistory({ onConfirm, onCancel }: AssistantClearHistoryProps) {
  return (
    <section className="assistant-clear-confirm glass-elevated" aria-label="Clear conversation">
      <p>Clear this conversation?</p>
      <p>
        This removes the Assistant messages on this device only. Your accounts,
        transactions, planning records, cloud backup, and sign-in are not affected.
      </p>
      <div className="assistant-clear-actions">
        <button type="button" className="assistant-clear-confirm-action" onClick={onConfirm}>
          Clear conversation
        </button>
        <button type="button" className="glass-control" onClick={onCancel}>
          Keep conversation
        </button>
      </div>
    </section>
  )
}

interface AssistantComposerProps {
  value: string
  isBusy: boolean
  onChange: (value: string) => void
  onSubmit: () => void
}

export function AssistantComposer({
  value,
  isBusy,
  onChange,
  onSubmit,
}: AssistantComposerProps) {
  // Blocked while a turn is running as well as while empty, so a second tap
  // cannot queue a duplicate question behind the one being answered.
  const isDisabled = isBusy || value.trim().length === 0

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isDisabled) return
    onSubmit()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (isDisabled) return
      onSubmit()
    }
  }

  return (
    <form className="assistant-composer glass-elevated" onSubmit={handleSubmit}>
      <MessageCircleMore aria-hidden="true" />
      <label className="sr-only" htmlFor="assistant-question">
        Ask the Personal Finance Assistant about your money
      </label>
      <textarea
        id="assistant-question"
        rows={1}
        value={value}
        placeholder="Ask about your money"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      <button
        type="submit"
        className="assistant-send"
        aria-label="Send question"
        disabled={isDisabled}
      >
        <SendHorizontal aria-hidden="true" />
      </button>
    </form>
  )
}
