import { CURRENCY_CODE } from '../models/currency'

const pkrFormatter = new Intl.NumberFormat('en-PK', {
  style: 'currency',
  currency: CURRENCY_CODE,
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

export function formatCurrency(amount: number): string {
  return pkrFormatter.format(amount)
}

