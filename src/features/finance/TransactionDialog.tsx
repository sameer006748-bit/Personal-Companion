import { useState } from 'react'
import { format } from 'date-fns'
import { X } from 'lucide-react'

import { getActiveAccounts } from '../../lib/financeCore'
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  type AccountId,
  type TransactionType,
} from '../../models/finance'
import { useAppStore } from '../../store/appStore'
import type { LocalTransaction } from '../../models/finance'

interface TransactionDialogProps {
  onClose: () => void
  transaction?: LocalTransaction
}

export function TransactionDialog({ onClose, transaction }: TransactionDialogProps) {
  const finance = useAppStore((state) => state.finance)
  const createTransaction = useAppStore((state) => state.createFinanceTransaction)
  const accounts = getActiveAccounts(finance)
  const defaultAccount = accounts.find((account) => account.isDefault) ?? accounts[0]
  const [type, setType] = useState<TransactionType>(transaction?.type ?? 'expense')
  const [amount, setAmount] = useState(String(transaction?.amount ?? ''))
  const [accountId, setAccountId] = useState<AccountId>(transaction?.accountId ?? defaultAccount?.id ?? '')
  const [destinationAccountId, setDestinationAccountId] = useState<AccountId>(transaction?.destinationAccountId ?? '')
  const [categoryId, setCategoryId] = useState(transaction?.categoryId ?? 'groceries')
  const [title, setTitle] = useState(transaction?.title ?? '')
  const [personOrBusiness, setPersonOrBusiness] = useState(transaction?.personOrBusiness ?? '')
  const [note, setNote] = useState(transaction?.note ?? '')
  const [date, setDate] = useState(transaction?.date ?? format(new Date(), 'yyyy-MM-dd'))
  const updateTransaction = useAppStore((state) => state.updateFinanceTransaction)
  const [error, setError] = useState('')

  const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES

  function handleTypeChange(nextType: TransactionType) {
    setType(nextType)
    if (nextType === 'income') setCategoryId(INCOME_CATEGORIES[0]?.id ?? 'client-payment')
    if (nextType === 'expense') setCategoryId(EXPENSE_CATEGORIES[0]?.id ?? 'groceries')
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const numericAmount = Number(amount)
    const input = {
      type,
      amount: numericAmount,
      date,
      title: type === 'transfer' ? 'Account transfer' : title,
      categoryId: type === 'transfer' ? 'account-transfer' : categoryId,
      accountId,
      ...(type === 'transfer' ? { destinationAccountId } : {}),
      ...(personOrBusiness.trim() ? { personOrBusiness } : {}),
      ...(note.trim() ? { note } : {}),
    }
    const message = transaction ? updateTransaction(transaction.id, input) : createTransaction(input)
    if (message) {
      setError(message)
      return
    }
    onClose()
  }

  return (
    <div
      className="finance-dialog-backdrop"
      role="presentation"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
    >
      <section className="finance-dialog glass-surface" role="dialog" aria-modal="true" aria-labelledby="transaction-dialog-title">
        <header>
          <div><p className="eyebrow">Local transaction</p><h2 id="transaction-dialog-title">{transaction ? 'Edit transaction' : 'Add transaction'}</h2></div>
          <button type="button" className="glass-control finance-dialog-close" aria-label="Close" onClick={onClose}><X aria-hidden="true" /></button>
        </header>
        <form onSubmit={handleSubmit}>
          <div className="finance-mode-group" role="radiogroup" aria-label="Transaction type">
            {(['income', 'expense', 'transfer'] as const).map((option) => <button key={option} type="button" role="radio" aria-checked={type === option} className={type === option ? 'is-selected' : ''} onClick={() => handleTypeChange(option)}>{option}</button>)}
          </div>
          <label>Amount<input required type="number" min="1" step="1" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
          <label>{type === 'transfer' ? 'From account' : 'Account'}<select value={accountId} onChange={(event) => setAccountId(event.target.value)}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
          {type === 'transfer' ? <label>To account<select value={destinationAccountId} onChange={(event) => setDestinationAccountId(event.target.value)}><option value="">Choose account</option>{accounts.filter((account) => account.id !== accountId).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label> : <><label>Category<select value={categoryId} onChange={(event) => setCategoryId(event.target.value as typeof categoryId)}>{categories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}</select></label><label>Title<input required value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>Person or business <span>Optional</span><input value={personOrBusiness} onChange={(event) => setPersonOrBusiness(event.target.value)} /></label></>}
          <label>Date<input required type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <label>Note <span>Optional</span><textarea value={note} onChange={(event) => setNote(event.target.value)} /></label>
          {error ? <p className="finance-dialog-error" role="alert">{error}</p> : null}
          <button className="finance-dialog-save" type="submit">{transaction ? 'Save changes' : 'Save transaction'}</button>
        </form>
      </section>
    </div>
  )
}
