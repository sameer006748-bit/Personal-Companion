import type { AssistantPersonalizationProfile } from '../models/assistant'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function splitSentences(value: string): string[] {
  return value.match(/[^.!?]+[.!?]?/gu)?.map((item) => item.trim()).filter(Boolean) ?? []
}

export function personaliseAssistantText(value: string, profile: AssistantPersonalizationProfile): string {
  let text = value
    .replace(/```/gu, '')
    .replace(/^\s{0,3}#{1,6}\s*/gmu, '')
    .replace(/^\s{0,3}>\s?/gmu, '')
    .replace(/^\s*[-*+]\s+/gmu, '')
    .replace(/\*\*|__|`/gu, '')
    .replace(/\*([^*\n]+)\*/gu, '$1')
    .replace(/_([^_\n]+)_/gu, '$1')
    .replaceAll(/\s+/gu, ' ')
    .trim()

  const asked = splitSentences(text)
  if (asked.filter((sentence) => sentence.endsWith('?')).length > 1) {
    let seenQuestion = false
    text = asked.filter((sentence) => {
      if (!sentence.endsWith('?')) return true
      if (seenQuestion) return false
      seenQuestion = true
      return true
    }).join(' ')
  }

  if (profile.responseLength === 'short') {
    const sentences = splitSentences(text)
    if (sentences.length > 4) text = sentences.slice(0, 4).join(' ')
    if (text.length > 420) {
      const clipped = text.slice(0, 420)
      text = `${clipped.slice(0, Math.max(0, clipped.lastIndexOf(' '))).trimEnd()}…`
    }
  }

  const name = profile.preferredName?.trim()
  if (name) {
    const matcher = new RegExp(`\\b${escapeRegExp(name)}\\b`, 'giu')
    let seen = false
    text = text.replace(matcher, (match) => {
      if (!seen) {
        seen = true
        return match
      }
      return ''
    }).replaceAll(/\s{2,}/gu, ' ').replace(/\s+([,.!?])/gu, '$1').trim()
  }

  return text
}
