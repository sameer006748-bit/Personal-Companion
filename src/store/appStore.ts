import { create } from 'zustand'

import { CURRENCY_CODE, type CurrencyCode } from '../models/currency'

export type Theme = 'light' | 'dark'

interface AppState {
  currency: CurrencyCode
  privacyMode: boolean
  theme: Theme
  togglePrivacyMode: () => void
  toggleTheme: () => void
}

const THEME_STORAGE_KEY = 'personal-companion-theme'

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') {
    return 'light'
  }

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)

  if (storedTheme === 'light' || storedTheme === 'dark') {
    return storedTheme
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme
}

const initialTheme = getInitialTheme()

export const useAppStore = create<AppState>((set, get) => ({
  currency: CURRENCY_CODE,
  privacyMode: false,
  theme: initialTheme,
  togglePrivacyMode: () => {
    set((state) => ({ privacyMode: !state.privacyMode }))
  },
  toggleTheme: () => {
    const nextTheme: Theme = get().theme === 'dark' ? 'light' : 'dark'
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
    applyTheme(nextTheme)
    set({ theme: nextTheme })
  },
}))

applyTheme(initialTheme)
