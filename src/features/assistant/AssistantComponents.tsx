import { format } from 'date-fns'
import { ArrowUp, MessageCircleMore, SendHorizontal, Sparkles } from 'lucide-react'
import type { FormEvent, KeyboardEvent, RefObject } from 'react'

import type {
  AssistantInsight,
  AssistantMessage,
} from '../../models/assistant'
import { PrivateAmount } from '../../shared/ui/PrivateAmount'

const assistantSuggestions = [
  'What happened with my money this month?',
  'Can I safely spend PKR 20,000?',
  'Who still owes me money?',
  'What payments need attention?',
  'Why were my expenses high?',
  'Summarize my financial position.',
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
          I can help explain your balances, spending, commitments, receivables,
          and upcoming payments.
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

interface AssistantMessageListProps {
  messages: readonly AssistantMessage[]
  onFollowUp: (question: string) => void
  endRef: RefObject<HTMLDivElement | null>
}

export function AssistantMessageList({
  messages,
  onFollowUp,
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
      <div ref={endRef} />
    </section>
  )
}

interface AssistantComposerProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
}

export function AssistantComposer({
  value,
  onChange,
  onSubmit,
}: AssistantComposerProps) {
  const isDisabled = value.trim().length === 0

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
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
