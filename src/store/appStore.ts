import { create } from 'zustand'

import { CURRENCY_CODE, type CurrencyCode } from '../models/currency'

interface AppState {
  currency: CurrencyCode
}

export const useAppStore = create<AppState>(() => ({
  currency: CURRENCY_CODE,
}))

