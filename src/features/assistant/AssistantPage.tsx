import { useEffect, useMemo, useRef, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

import {
  AssistantComposer,
  AssistantIntro,
  AssistantMessageList,
  AssistantSuggestions,
} from './AssistantComponents'
import { ASSISTANT_FALLBACK_MESSAGES, askAssistant } from '../../lib/assistantClient'
import type { AssistantMessage } from '../../models/assistant'
import { getLocalPersonalFinanceData } from '../../mocks/finance'
import { useAppStore } from '../../store/appStore'

function getGreeting(): string {
  const hour = new Date().getHours()

  if (hour < 12) {
    return 'Good morning'
  }

  if (hour < 18) {
    return 'Good afternoon'
  }

  return 'Good evening'
}

export function AssistantPage() {
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<readonly AssistantMessage[]>(() => [
    {
      id: 'assistant-introduction',
      role: 'assistant',
      text: 'Ask me anything about your current financial position, recent activity, receivables, payables, or commitments.',
      timestamp: Date.now(),
    },
  ])
  const [isThinking, setIsThinking] = useState(false)
  const [sourceNote, setSourceNote] = useState('')
  const messageCount = useRef(0)
  const conversationEndRef = useRef<HTMLDivElement>(null)
  const settings = useAppStore((state) => state.settings)
  const finance = useAppStore((state) => state.finance)
  const planning = useAppStore((state) => state.planning)
  const privacyMode = useAppStore((state) => state.privacyMode)
  const togglePrivacyMode = useAppStore((state) => state.togglePrivacyMode)
  const data = useMemo(() => getLocalPersonalFinanceData(settings, finance, planning), [settings, finance, planning])

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
      block: 'end',
    })
  }, [messages])

  async function submitQuestion(question = draft) {
    const trimmedQuestion = question.trim()

    if (!trimmedQuestion || isThinking) {
      return
    }

    const timestamp = Date.now()
    messageCount.current += 1
    const turn = messageCount.current

    setMessages((currentMessages) => [
      ...currentMessages,
      {
        id: `user-${timestamp}-${turn}`,
        role: 'user',
        text: trimmedQuestion,
        timestamp,
      },
    ])
    setDraft('')
    setIsThinking(true)

    // askAssistant always resolves: if the model is unavailable, rate limited, or
    // returns anything off-contract, it returns the local deterministic answer.
    const outcome = await askAssistant(trimmedQuestion, data, settings.finance.currency)
    const { response } = outcome

    setMessages((currentMessages) => [
      ...currentMessages,
      {
        id: `assistant-${timestamp}-${turn}`,
        role: 'assistant',
        text: response.text,
        timestamp: Date.now(),
        ...(response.insight ? { insight: response.insight } : {}),
        ...(response.followUps ? { followUps: response.followUps } : {}),
      },
    ])
    setSourceNote(outcome.reason ? ASSISTANT_FALLBACK_MESSAGES[outcome.reason] : 'Answered with AI')
    setIsThinking(false)
  }

  return (
    <div className="assistant-page">
      <header className="assistant-page-header">
        <div>
          <p className="eyebrow">Personal Finance Assistant</p>
          <h1>Assistant</h1>
          <p>Ask about your money in plain language.</p>
        </div>
        <button
          type="button"
          className="glass-control assistant-privacy-control"
          aria-label={privacyMode ? 'Show amounts' : 'Hide amounts'}
          aria-pressed={privacyMode}
          onClick={togglePrivacyMode}
        >
          {privacyMode ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          <span>{privacyMode ? 'Private' : 'Visible'}</span>
        </button>
      </header>

      <AssistantIntro greeting={getGreeting()} name={data.profile.name} />
      <AssistantSuggestions onSelect={(question) => void submitQuestion(question)} />
      <AssistantMessageList
        messages={messages}
        onFollowUp={(question) => void submitQuestion(question)}
        endRef={conversationEndRef}
      />
      <p className="assistant-source-note" role="status" aria-live="polite">
        {isThinking ? 'Thinking' : sourceNote}
      </p>
      <AssistantComposer value={draft} onChange={setDraft} onSubmit={() => void submitQuestion()} />
    </div>
  )
}
