import { useEffect, useMemo, useRef, useState } from 'react'
import { Eye, EyeOff, Trash2 } from 'lucide-react'

import {
  AssistantClearHistory,
  AssistantComposer,
  AssistantIntro,
  AssistantMessageList,
  AssistantSuggestions,
} from './AssistantComponents'
import { orchestrateAssistantTurn, shouldHideSuggestionPanel } from '../../lib/assistantOrchestrator'
import { getLatestStatusNote } from '../../lib/assistantHistory'
import type { AssistantInputMode, AssistantMessage } from '../../models/assistant'
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
  const [isThinking, setIsThinking] = useState(false)
  const [isConfirmingClear, setIsConfirmingClear] = useState(false)
  const [executingProposalId, setExecutingProposalId] = useState<string>()
  // isThinking is published asynchronously, so two taps in the same tick could
  // both read it as false. This ref closes that window and is the authority on
  // whether a turn is already running.
  const inFlight = useRef(false)
  const conversationEndRef = useRef<HTMLDivElement>(null)
  const settings = useAppStore((state) => state.settings)
  const finance = useAppStore((state) => state.finance)
  const planning = useAppStore((state) => state.planning)
  const privacyMode = useAppStore((state) => state.privacyMode)
  const togglePrivacyMode = useAppStore((state) => state.togglePrivacyMode)
  // The transcript lives in the store, so it survives this component unmounting
  // when the user navigates away, and is reloaded from storage on a fresh start.
  const assistantHistory = useAppStore((state) => state.assistantHistory)
  const appendAssistantMessages = useAppStore((state) => state.appendAssistantMessages)
  const clearAssistantHistory = useAppStore((state) => state.clearAssistantHistory)
  const replaceAssistantMessage = useAppStore((state) => state.replaceAssistantMessage)
  const executeAssistantProposal = useAppStore((state) => state.executeAssistantProposal)
  const executeAssistantBatch = useAppStore((state) => state.executeAssistantBatch)
  const assistantMemory = useAppStore((state) => state.assistantMemory)
  const saveAssistantMemoryProposal = useAppStore((state) => state.saveAssistantMemoryProposal)
  const forgetAssistantMemory = useAppStore((state) => state.forgetAssistantMemory)
  const messages = assistantHistory.messages
  const data = useMemo(() => getLocalPersonalFinanceData(settings, finance, planning), [settings, finance, planning])
  const showSuggestions = useMemo(() => settings.assistant.showSuggestions && !shouldHideSuggestionPanel(messages), [settings.assistant.showSuggestions, messages])
  // Derived rather than stored, so the status line for the last answer is still
  // correct after a reload instead of resetting to blank.
  const sourceNote = useMemo(() => getLatestStatusNote(messages), [messages])

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
      block: 'end',
    })
  }, [messages])

  async function submitQuestion(question = draft, inputMode: AssistantInputMode = 'text') {
    const trimmedQuestion = question.trim()

    if (!trimmedQuestion || inFlight.current) {
      return
    }

    inFlight.current = true
    const submitStartedAt = performance.now()
    const timestamp = Date.now()
    // The id pairs the question with its answer and is unique per turn, so a
    // replayed render can never append the same message twice. The answer is
    // derived from the same id, so a late or repeated turn collapses onto the
    // message that is already in the transcript.
    const turnId = `${timestamp}-${Math.random().toString(36).slice(2, 8)}`

    const userMessage: AssistantMessage = {
      id: `user-${turnId}`,
      role: 'user',
      text: trimmedQuestion,
      timestamp,
    }
    const userAppendStartedAt = performance.now()
    appendAssistantMessages([userMessage])
    const userAppendMs = Math.round(performance.now() - userAppendStartedAt)
    setDraft('')
    setIsThinking(true)

    try {
      const outcome = await orchestrateAssistantTurn({
        input: { text: trimmedQuestion, inputMode },
        messages,
        data,
        finance,
        planning,
        assistantMemory,
        settings,
        turnId,
      })

      if (outcome.replaceMessageId && outcome.replacementMessage) {
        replaceAssistantMessage(outcome.replaceMessageId, outcome.replacementMessage)
      }

      // Typed cancellation is represented entirely by the updated preview. It
      // must not append a second Assistant cancellation bubble.
      if (outcome.kind === 'replace') return

      if (outcome.forgetMemoryQuery) forgetAssistantMemory(outcome.forgetMemoryQuery)
      const assistantAppendStartedAt = performance.now()
      appendAssistantMessages([outcome.message])
      const messageAppendMs = userAppendMs + Math.round(performance.now() - assistantAppendStartedAt)
      if (import.meta.env.DEV) {
        console.info(JSON.stringify({ event: 'assistant-client-turn', stage: 'complete', resultCode: outcome.message.diagnostic?.code ?? 'ok', responseKind: outcome.message.diagnostic?.responseKind ?? 'accepted', roundCount: outcome.message.performance?.roundCount ?? 0, toolsExposed: outcome.message.performance?.toolsExposed ?? 0, toolsCalled: outcome.message.performance?.toolsCalled ?? 0, timingsMs: { ...outcome.message.performance?.timingsMs, messageAppend: messageAppendMs, total: Math.round(performance.now() - submitStartedAt) } }))
      }
    } finally {
      setIsThinking(false)
      inFlight.current = false
    }
  }

  function handleClearHistory() {
    clearAssistantHistory()
    setIsConfirmingClear(false)
  }

  function cancelProposal(message: AssistantMessage) {
    const batch = message.batch
    if (batch) {
      if (batch.status !== 'proposed') return
      replaceAssistantMessage(message.id, { ...message, text: 'Actions cancelled. Nothing changed.', batch: { ...batch, status: 'cancelled' }, statusNote: 'Action cancelled' })
      return
    }
    const proposal = message.proposal
    if (proposal?.status !== 'proposed') return
    replaceAssistantMessage(message.id, { ...message, text: 'Action cancelled. Nothing changed.', proposal: { ...proposal, status: 'cancelled' }, statusNote: 'Action cancelled' })
  }

  function confirmProposal(message: AssistantMessage) {
    const batch = message.batch
    // Confirm All is guarded by the same single in-flight lock as a single
    // action, so a second click while the first is running is ignored, and the
    // store's batch key makes a replayed confirmation a no-op regardless.
    if (batch) {
      if (batch.status !== 'proposed' || executingProposalId) return
      setExecutingProposalId(batch.batchId)
      const result = executeAssistantBatch({ ...batch, status: 'confirmed' })
      if (result.error) {
        replaceAssistantMessage(message.id, { ...message, text: result.error, batch: { ...batch, status: 'failed' }, statusNote: 'Actions were not recorded' })
      } else if (result.receipts?.length) {
        replaceAssistantMessage(message.id, { ...message, text: `${result.receipts.length} actions completed.`, batch: { ...batch, status: 'executed', receipts: result.receipts }, followUps: [], statusNote: 'Actions recorded locally' })
      }
      setExecutingProposalId(undefined)
      return
    }
    const proposal = message.proposal
    if (proposal?.status !== 'proposed' || executingProposalId) return
    setExecutingProposalId(proposal.proposalId)
    const result = executeAssistantProposal({ ...proposal, status: 'confirmed' })
    if (result.error) {
      replaceAssistantMessage(message.id, { ...message, text: result.error, proposal: { ...proposal, status: 'failed', validationErrors: [result.error] }, statusNote: 'Action was not recorded' })
    } else if (result.receipt) {
      replaceAssistantMessage(message.id, { ...message, text: 'Action completed.', proposal: { ...proposal, status: 'executed' }, receipt: result.receipt, followUps: [], statusNote: 'Action recorded locally' })
    }
    setExecutingProposalId(undefined)
  }

  function saveMemory(message: AssistantMessage) {
    const proposal = message.memoryProposal
    if (proposal?.status !== 'proposed') return
    saveAssistantMemoryProposal(proposal)
    replaceAssistantMessage(message.id, { ...message, text: 'Preference saved for future conversations.', memoryProposal: { ...proposal, status: 'saved' }, statusNote: 'Memory saved' })
  }

  function rejectMemory(message: AssistantMessage) {
    const proposal = message.memoryProposal
    if (proposal?.status !== 'proposed') return
    replaceAssistantMessage(message.id, { ...message, text: 'No problem — I will not save that.', memoryProposal: { ...proposal, status: 'rejected' }, statusNote: 'Memory not saved' })
  }

  return (
    <div className="assistant-page">
      <header className="assistant-page-header">
        <div>
          <p className="eyebrow">Personal Finance Assistant</p>
          <h1>Assistant</h1>
          <p>Ask about your money in plain language.</p>
        </div>
        <div className="assistant-header-controls">
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
          <button
            type="button"
            className="glass-control assistant-privacy-control"
            aria-label="Clear conversation"
            aria-expanded={isConfirmingClear}
            onClick={() => setIsConfirmingClear((current) => !current)}
          >
            <Trash2 aria-hidden="true" />
            <span>Clear</span>
          </button>
        </div>
      </header>

      {isConfirmingClear ? (
        <AssistantClearHistory
          onConfirm={handleClearHistory}
          onCancel={() => setIsConfirmingClear(false)}
        />
      ) : null}

      <AssistantIntro greeting={getGreeting()} name={data.profile.name} />
      {showSuggestions ? <AssistantSuggestions onSelect={(question) => void submitQuestion(question)} /> : null}
      <AssistantMessageList
        messages={messages}
        onFollowUp={(question) => void submitQuestion(question)}
        onConfirmProposal={confirmProposal}
        onCancelProposal={cancelProposal}
        onSaveMemory={saveMemory}
        onRejectMemory={rejectMemory}
        {...(executingProposalId ? { executingProposalId } : {})}
        isPending={isThinking}
        endRef={conversationEndRef}
      />
      <p className="assistant-source-note" role="status" aria-live="polite">
        {isThinking ? 'Thinking' : sourceNote}
      </p>
      <AssistantComposer
        value={draft}
        isBusy={isThinking}
        onChange={setDraft}
        onSubmit={() => void submitQuestion()}
      />
    </div>
  )
}
