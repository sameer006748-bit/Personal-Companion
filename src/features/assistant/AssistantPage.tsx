import { useEffect, useMemo, useRef, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

import {
  AssistantComposer,
  AssistantIntro,
  AssistantMessageList,
  AssistantSuggestions,
} from './AssistantComponents'
import { generateAssistantResponse } from '../../lib/assistantEngine'
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

  function submitQuestion(question = draft) {
    const trimmedQuestion = question.trim()

    if (!trimmedQuestion) {
      return
    }

    const timestamp = Date.now()
    const response = generateAssistantResponse(trimmedQuestion, data)
    messageCount.current += 1

    setMessages((currentMessages) => [
      ...currentMessages,
      {
        id: `user-${timestamp}-${messageCount.current}`,
        role: 'user',
        text: trimmedQuestion,
        timestamp,
      },
      {
        id: `assistant-${timestamp}-${messageCount.current}`,
        role: 'assistant',
        text: response.text,
        timestamp,
        ...(response.insight ? { insight: response.insight } : {}),
        ...(response.followUps ? { followUps: response.followUps } : {}),
      },
    ])
    setDraft('')
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
      <AssistantSuggestions onSelect={submitQuestion} />
      <AssistantMessageList
        messages={messages}
        onFollowUp={submitQuestion}
        endRef={conversationEndRef}
      />
      <AssistantComposer value={draft} onChange={setDraft} onSubmit={() => submitQuestion()} />
    </div>
  )
}
