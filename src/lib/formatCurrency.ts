import { CURRENCY_CODE } from '../models/currency'

const pkrFormatter = new Intl.NumberFormat('en-PK', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

export function formatCurrency(amount: number): string {
  return `${CURRENCY_CODE} ${pkrFormatter.format(amount)}`
}
