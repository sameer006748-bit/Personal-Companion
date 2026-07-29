import { formatCurrency } from '../../lib/formatCurrency'
import { useAppStore } from '../../store/appStore'

interface PrivateAmountProps {
  amount: number
  className?: string
  sign?: string
}

export function PrivateAmount({
  amount,
  className = '',
  sign,
}: PrivateAmountProps) {
  const privacyMode = useAppStore((state) => state.privacyMode)
  const formattedAmount = `${sign ?? ''}${formatCurrency(amount)}`

  return (
    <span
      className={['private-amount', className].join(' ')}
      data-private={privacyMode}
      aria-label={privacyMode ? 'Amount hidden' : formattedAmount}
    >
      {privacyMode ? 'PKR \u2022\u2022\u2022\u2022\u2022\u2022' : formattedAmount}
    </span>
  )
}
