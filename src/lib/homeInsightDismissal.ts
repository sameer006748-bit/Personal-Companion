// Local-only dismissal for the conditional Home insight. The insight key is
// derived from the records that produced it, so dismissing hides that exact
// insight and a materially different one reappears on its own. Storage failures
// (private mode, quota) degrade to "nothing dismissed" rather than throwing.
const DISMISSED_INSIGHT_KEY = 'personal-companion-dismissed-home-insight'

export function readDismissedInsightKey(): string | undefined {
  try {
    return window.localStorage.getItem(DISMISSED_INSIGHT_KEY) ?? undefined
  } catch {
    return undefined
  }
}

export function writeDismissedInsightKey(key: string): void {
  try {
    window.localStorage.setItem(DISMISSED_INSIGHT_KEY, key)
  } catch {
    // Dismissal is a comfort feature; losing it must never break Home.
  }
}
