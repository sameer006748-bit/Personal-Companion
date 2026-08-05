import { useState } from 'react'

import { X } from 'lucide-react'

import { getActiveAccounts } from '../../lib/financeCore'
import { getCategoryLabel, type FinanceTransaction } from '../../models/finance'
import { PrivateAmount } from '../../shared/ui/PrivateAmount'
import { useAppStore } from '../../store/appStore'
import { TransactionDialog } from './TransactionDialog'

export function TransactionDetailDialog({ transaction, onClose }: { transaction: FinanceTransaction; onClose: () => void }) {
  const finance = useAppStore((state) => state.finance)
  const deleteTransaction = useAppStore((state) => state.deleteFinanceTransaction)
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const local = finance.transactions.find((item) => item.id === transaction.id)
  const accounts = new Map(getActiveAccounts(finance).map((item) => [item.id, item.name]))
  if (editing && local) return <TransactionDialog transaction={local} onClose={onClose} />
  return (
    <div
      className="finance-dialog-backdrop"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
    >
      <section className="finance-dialog glass-surface" role="dialog" aria-modal="true" aria-labelledby="transaction-detail-title">
        <header>
          <div><p className="eyebrow">{local ? 'Local transaction' : 'Recorded history'}</p><h2 id="transaction-detail-title">{transaction.title}</h2></div>
          <button type="button" className="glass-control finance-dialog-close" onClick={onClose} aria-label="Close">
            <X aria-hidden="true" />
          </button>
        </header>
        <dl className="finance-detail-list">
          <div><dt>Type</dt><dd>{transaction.direction}</dd></div>
          <div><dt>Amount</dt><dd><PrivateAmount amount={transaction.amount} /></dd></div>
          <div><dt>Account</dt><dd>{accounts.get(transaction.accountId) ?? 'Archived account'}</dd></div>
          {transaction.destinationAccountId ? <div><dt>To account</dt><dd>{accounts.get(transaction.destinationAccountId) ?? 'Archived account'}</dd></div> : null}
          <div><dt>Category</dt><dd>{getCategoryLabel(transaction.category)}</dd></div>
          <div><dt>Date</dt><dd>{transaction.date}</dd></div>
          {transaction.counterparty ? <div><dt>Person or business</dt><dd>{transaction.counterparty}</dd></div> : null}
          {transaction.note ? <div><dt>Note</dt><dd>{transaction.note}</dd></div> : null}
          <div><dt>Status</dt><dd>{transaction.status}</dd></div>
        </dl>
        {local ? (
          <div className="finance-detail-actions">
            {confirming ? (
              <>
                <span>Delete this local transaction and reverse its balance effect?</span>
                <button className="is-destructive" type="button" onClick={() => { deleteTransaction(local.id); onClose() }}>Delete transaction</button>
                <button type="button" onClick={() => setConfirming(false)}>Cancel</button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => setEditing(true)}>Edit</button>
                <button className="is-destructive" type="button" onClick={() => setConfirming(true)}>Delete</button>
              </>
            )}
          </div>
        ) : (
          <p className="finance-readonly-note">Recorded history is read-only.</p>
        )}
      </section>
    </div>
  )
}