import { useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { X } from 'lucide-react'

import { getActiveAccounts } from '../../lib/financeCore'
import type { PlanningItemType } from '../../lib/financeSelectors'
import { getPlanningStatusLabel } from '../../lib/financeSelectors'
import {
  findCommitment,
  findPayable,
  findReceivable,
  getCommitmentStatus,
  getNextDueDate,
  getPayableRemainingAmount,
  getPayableStatus,
  getReceivableRemainingAmount,
  getReceivableStatus,
} from '../../lib/planningCore'
import {
  EXPENSE_CATEGORIES,
  getCategoryLabel,
  type AccountId,
  type TransactionCategory,
} from '../../models/finance'
import {
  PLANNING_FREQUENCIES,
  PLANNING_FREQUENCY_LABELS,
  type PlanningFrequency,
} from '../../models/planning'
import { PrivateAmount } from '../../shared/ui/PrivateAmount'
import { useAppStore } from '../../store/appStore'

const itemTypeLabels: Record<PlanningItemType, string> = {
  receivable: 'Receivable',
  payable: 'Payable',
  commitment: 'Commitment',
}

function todayValue(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

function toWholeAmount(value: string): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : Number.NaN
}

interface DialogShellProps {
  title: string
  eyebrow: string
  labelledBy: string
  onClose: () => void
  children: React.ReactNode
}

function DialogShell({
  title,
  eyebrow,
  labelledBy,
  onClose,
  children,
}: DialogShellProps) {
  return (
    <div
      className="finance-dialog-backdrop"
      role="presentation"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
    >
      <section
        className="finance-dialog glass-surface"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
      >
        <header>
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h2 id={labelledBy}>{title}</h2>
          </div>
          <button
            type="button"
            className="glass-control finance-dialog-close"
            aria-label="Close"
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </button>
        </header>
        {children}
      </section>
    </div>
  )
}

export interface PlanningFormTarget {
  type: PlanningItemType
  id?: string
}

interface PlanningItemFormProps {
  target: PlanningFormTarget
  onClose: () => void
}

export function PlanningItemForm({ target, onClose }: PlanningItemFormProps) {
  const finance = useAppStore((state) => state.finance)
  const planning = useAppStore((state) => state.planning)
  const createReceivable = useAppStore((state) => state.createReceivable)
  const updateReceivable = useAppStore((state) => state.updateReceivable)
  const createPayable = useAppStore((state) => state.createPayable)
  const updatePayable = useAppStore((state) => state.updatePayable)
  const createCommitment = useAppStore((state) => state.createCommitment)
  const updateCommitment = useAppStore((state) => state.updateCommitment)

  const accounts = getActiveAccounts(finance)
  const editingId = target.id
  const existingReceivable =
    target.type === 'receivable' && editingId
      ? findReceivable(planning, editingId)
      : undefined
  const existingPayable =
    target.type === 'payable' && editingId
      ? findPayable(planning, editingId)
      : undefined
  const existingCommitment =
    target.type === 'commitment' && editingId
      ? findCommitment(planning, editingId)
      : undefined

  const [type, setType] = useState<PlanningItemType>(target.type)
  const [counterparty, setCounterparty] = useState(
    existingReceivable?.counterparty ?? existingPayable?.counterparty ?? '',
  )
  const [label, setLabel] = useState(existingCommitment?.label ?? '')
  const [amount, setAmount] = useState(
    String(
      existingReceivable?.originalAmount ??
        existingPayable?.originalAmount ??
        existingCommitment?.amount ??
        '',
    ),
  )
  const [settledAmount, setSettledAmount] = useState(
    String(existingReceivable?.receivedAmount ?? existingPayable?.paidAmount ?? ''),
  )
  const [dueDate, setDueDate] = useState(
    existingReceivable?.dueDate ??
      existingPayable?.dueDate ??
      existingCommitment?.dueDate ??
      todayValue(),
  )
  const [category, setCategory] = useState<TransactionCategory>(
    existingCommitment?.category ?? 'rent',
  )
  const [frequency, setFrequency] = useState<PlanningFrequency>(
    existingCommitment?.frequency ?? 'monthly',
  )
  const [accountId, setAccountId] = useState<AccountId>(
    existingReceivable?.accountId ??
      existingPayable?.accountId ??
      existingCommitment?.accountId ??
      '',
  )
  const [note, setNote] = useState(
    existingReceivable?.note ?? existingPayable?.note ?? existingCommitment?.note ?? '',
  )
  const [error, setError] = useState('')

  const isEditing = editingId !== undefined
  const settledFieldLabel =
    type === 'receivable' ? 'Already received' : 'Already paid'

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const numericAmount = toWholeAmount(amount)
    const numericSettled = settledAmount.trim() ? toWholeAmount(settledAmount) : 0
    const shared = {
      dueDate,
      ...(note.trim() ? { note } : {}),
      ...(accountId ? { accountId } : {}),
    }

    let message: string | undefined

    if (type === 'receivable') {
      const input = {
        counterparty,
        originalAmount: numericAmount,
        receivedAmount: numericSettled,
        ...shared,
      }
      message =
        isEditing && editingId
          ? updateReceivable(editingId, input)
          : createReceivable(input)
    } else if (type === 'payable') {
      const input = {
        counterparty,
        originalAmount: numericAmount,
        paidAmount: numericSettled,
        ...shared,
      }
      message =
        isEditing && editingId ? updatePayable(editingId, input) : createPayable(input)
    } else {
      const input = {
        label,
        category,
        amount: numericAmount,
        frequency,
        ...shared,
      }
      message =
        isEditing && editingId
          ? updateCommitment(editingId, input)
          : createCommitment(input)
    }

    if (message) {
      setError(message)
      return
    }

    onClose()
  }

  return (
    <DialogShell
      eyebrow="Planning"
      title={isEditing ? `Edit ${itemTypeLabels[type].toLocaleLowerCase()}` : 'Add item'}
      labelledBy="planning-form-title"
      onClose={onClose}
    >
      <form onSubmit={handleSubmit}>
        {isEditing ? null : (
          <div className="finance-mode-group" role="radiogroup" aria-label="Item type">
            {(['receivable', 'payable', 'commitment'] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={type === option}
                className={type === option ? 'is-selected' : ''}
                onClick={() => {
                  setType(option)
                  setError('')
                }}
              >
                {itemTypeLabels[option]}
              </button>
            ))}
          </div>
        )}

        {type === 'commitment' ? (
          <label>
            Commitment name
            <input
              required
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
          </label>
        ) : (
          <label>
            {type === 'receivable' ? 'Who owes you' : 'Who you need to pay'}
            <input
              required
              value={counterparty}
              onChange={(event) => setCounterparty(event.target.value)}
            />
          </label>
        )}

        <label>
          {type === 'commitment' ? 'Amount' : 'Total amount'}
          <input
            required
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={amount}
            onChange={(event) => {
              const raw = event.target.value
              if (raw === '' || /^\d+$/.test(raw)) {
                setAmount(raw)
              }
            }}
          />
        </label>

        {type === 'commitment' ? (
          <>
            <label>
              Category
              <select
                value={category}
                onChange={(event) =>
                  setCategory(event.target.value as TransactionCategory)
                }
              >
                {EXPENSE_CATEGORIES.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Repeats
              <select
                value={frequency}
                onChange={(event) =>
                  setFrequency(event.target.value as PlanningFrequency)
                }
              >
                {PLANNING_FREQUENCIES.map((option) => (
                  <option key={option} value={option}>
                    {PLANNING_FREQUENCY_LABELS[option]}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <label>
            {settledFieldLabel} <span>Optional</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={settledAmount}
              onChange={(event) => {
                const raw = event.target.value
                if (raw === '' || /^\d+$/.test(raw)) {
                  setSettledAmount(raw)
                }
              }}
            />
          </label>
        )}

        <label>
          {type === 'commitment' ? 'Next due date' : 'Due date'}
          <input
            required
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </label>

        <label>
          {type === 'receivable' ? 'Expected into account' : 'Linked account'}{' '}
          <span>Optional</span>
          <select
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
          >
            <option value="">No account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Note <span>Optional</span>
          <textarea value={note} onChange={(event) => setNote(event.target.value)} />
        </label>

        {error ? (
          <p className="finance-dialog-error" role="alert">
            {error}
          </p>
        ) : null}

        <button className="finance-dialog-save" type="submit">
          {isEditing ? 'Save changes' : `Save ${itemTypeLabels[type].toLocaleLowerCase()}`}
        </button>
      </form>
    </DialogShell>
  )
}

interface PlanningItemDetailProps {
  type: PlanningItemType
  id: string
  onClose: () => void
  onEdit: (target: PlanningFormTarget) => void
}

export function PlanningItemDetail({
  type,
  id,
  onClose,
  onEdit,
}: PlanningItemDetailProps) {
  const planning = useAppStore((state) => state.planning)
  const finance = useAppStore((state) => state.finance)
  const recordReceivableReceiptIntoAccount = useAppStore(
    (state) => state.recordReceivableReceiptIntoAccount,
  )
  const markReceivableReceivedIntoAccount = useAppStore(
    (state) => state.markReceivableReceivedIntoAccount,
  )
  const deleteReceivable = useAppStore((state) => state.deleteReceivable)
  const recordPayablePaymentFromAccount = useAppStore(
    (state) => state.recordPayablePaymentFromAccount,
  )
  const markPayablePaidFromAccount = useAppStore(
    (state) => state.markPayablePaidFromAccount,
  )
  const deletePayable = useAppStore((state) => state.deletePayable)
  const markCommitmentPaid = useAppStore((state) => state.markCommitmentPaid)
  const archiveCommitment = useAppStore((state) => state.archiveCommitment)
  const restoreCommitment = useAppStore((state) => state.restoreCommitment)
  const deleteCommitment = useAppStore((state) => state.deleteCommitment)

  const accounts = getActiveAccounts(finance)
  const defaultAccountId = accounts.find((a) => a.isDefault)?.id ?? accounts[0]?.id ?? ''

  const [isProcessing, setIsProcessing] = useState(false)
  const processingRef = useRef(false)
  const [partialAmount, setPartialAmount] = useState('')
  const [receiptAccountId, setReceiptAccountId] = useState<AccountId>(defaultAccountId)
  const [paymentAccountId, setPaymentAccountId] = useState<AccountId>(defaultAccountId)
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
  const [error, setError] = useState('')

  const today = todayValue()
  const receivable = type === 'receivable' ? findReceivable(planning, id) : undefined
  const payable = type === 'payable' ? findPayable(planning, id) : undefined
  const commitment = type === 'commitment' ? findCommitment(planning, id) : undefined
  const record = receivable ?? payable ?? commitment

  if (!record) {
    return (
      <DialogShell
        eyebrow="Planning"
        title="Item unavailable"
        labelledBy="planning-detail-title"
        onClose={onClose}
      >
        <p className="planning-detail-note">This item is no longer available.</p>
      </DialogShell>
    )
  }

  const accountId = record.accountId
  const accountLabel = accountId
    ? finance.accounts.find((account) => account.id === accountId)?.name
    : undefined

  const hasFinancialHistory =
    (receivable?.receivedAmount ?? 0) > 0 ||
    (payable?.paidAmount ?? 0) > 0

  function run(action: () => string | undefined, closeAfter = false): void {
    if (processingRef.current) return
    processingRef.current = true
    setIsProcessing(true)
    const message = action()
    if (message) {
      setError(message)
    } else {
      setError('')
      setPartialAmount('')
      if (closeAfter) onClose()
    }

    // Keep the ref lock until React has rendered disabled confirmation
    // buttons. This blocks repeat clicks and Enter activation before paint.
    window.requestAnimationFrame(() => {
      processingRef.current = false
      setIsProcessing(false)
    })
  }

  function handlePartialReceipt(): void {
    if (!receivable || !record) return
    const numeric = toWholeAmount(partialAmount)
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setError('Enter a whole PKR amount greater than zero.')
      return
    }
    if (!receiptAccountId) {
      setError('Choose an active account to receive into.')
      return
    }
    run(() => recordReceivableReceiptIntoAccount(record.id, numeric, receiptAccountId))
  }

  function handleFullReceipt(): void {
    if (!receivable || !record) return
    if (!receiptAccountId) {
      setError('Choose an active account to receive into.')
      return
    }
    run(() => markReceivableReceivedIntoAccount(record.id, receiptAccountId))
  }

  function handlePartialPayment(): void {
    if (!payable || !record) return
    const numeric = toWholeAmount(partialAmount)
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setError('Enter a whole PKR amount greater than zero.')
      return
    }
    if (!paymentAccountId) {
      setError('Choose an active account to pay from.')
      return
    }
    run(() => recordPayablePaymentFromAccount(record.id, numeric, paymentAccountId))
  }

  function handleFullPayment(): void {
    if (!payable || !record) return
    if (!paymentAccountId) {
      setError('Choose an active account to pay from.')
      return
    }
    run(() => markPayablePaidFromAccount(record.id, paymentAccountId))
  }

  const title = receivable?.counterparty ?? payable?.counterparty ?? commitment?.label ?? ''
  const status = receivable
    ? getReceivableStatus(receivable, today)
    : payable
      ? getPayableStatus(payable, today)
      : commitment
        ? getCommitmentStatus(commitment, today)
        : 'pending'

  return (
    <DialogShell
      eyebrow={itemTypeLabels[type]}
      title={title}
      labelledBy="planning-detail-title"
      onClose={onClose}
    >
      <dl className="planning-detail-grid">
        <div>
          <dt>Status</dt>
          <dd>
            <span className={`planning-status status-${status}`}>
              {getPlanningStatusLabel(type, status)}
            </span>
          </dd>
        </div>
        <div>
          <dt>{commitment ? 'Next due' : 'Due date'}</dt>
          <dd>{format(parseISO(record.dueDate), 'd MMM yyyy')}</dd>
        </div>
        {receivable ? (
          <>
            <div>
              <dt>Total</dt>
              <dd>
                <PrivateAmount amount={receivable.originalAmount} />
              </dd>
            </div>
            <div>
              <dt>Received</dt>
              <dd>
                <PrivateAmount amount={receivable.receivedAmount} />
              </dd>
            </div>
            <div>
              <dt>Remaining</dt>
              <dd>
                <PrivateAmount amount={getReceivableRemainingAmount(receivable)} />
              </dd>
            </div>
          </>
        ) : null}
        {payable ? (
          <>
            <div>
              <dt>Total</dt>
              <dd>
                <PrivateAmount amount={payable.originalAmount} />
              </dd>
            </div>
            <div>
              <dt>Paid</dt>
              <dd>
                <PrivateAmount amount={payable.paidAmount} />
              </dd>
            </div>
            <div>
              <dt>Remaining</dt>
              <dd>
                <PrivateAmount amount={getPayableRemainingAmount(payable)} />
              </dd>
            </div>
          </>
        ) : null}
        {commitment ? (
          <>
            <div>
              <dt>Amount</dt>
              <dd>
                <PrivateAmount amount={commitment.amount} />
              </dd>
            </div>
            <div>
              <dt>Repeats</dt>
              <dd>{PLANNING_FREQUENCY_LABELS[commitment.frequency]}</dd>
            </div>
            <div>
              <dt>Category</dt>
              <dd>{getCategoryLabel(commitment.category)}</dd>
            </div>
            {commitment.lastPaidDate ? (
              <div>
                <dt>Last marked paid</dt>
                <dd>{format(parseISO(commitment.lastPaidDate), 'd MMM yyyy')}</dd>
              </div>
            ) : null}
          </>
        ) : null}
        {accountLabel ? (
          <div>
            <dt>Account</dt>
            <dd>{accountLabel}</dd>
          </div>
        ) : null}
      </dl>

      {record.note ? <p className="planning-detail-note">{record.note}</p> : null}

      {receivable && getReceivableRemainingAmount(receivable) > 0 ? (
        <div className="planning-detail-partial">
          <label>
            Receipt amount
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="Amount"
              value={partialAmount}
              onChange={(event) => {
                const raw = event.target.value
                if (raw === '' || /^\d+$/.test(raw)) {
                  setPartialAmount(raw)
                }
              }}
            />
          </label>
          <label>
            Receive into account
            <select
              value={receiptAccountId}
              onChange={(event) => setReceiptAccountId(event.target.value)}
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={isProcessing}
            onClick={handlePartialReceipt}
          >
            Record receipt
          </button>
        </div>
      ) : null}

      {payable && getPayableRemainingAmount(payable) > 0 ? (
        <div className="planning-detail-partial">
          <label>
            Payment amount
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="Amount"
              value={partialAmount}
              onChange={(event) => {
                const raw = event.target.value
                if (raw === '' || /^\d+$/.test(raw)) {
                  setPartialAmount(raw)
                }
              }}
            />
          </label>
          <label>
            Pay from account
            <select
              value={paymentAccountId}
              onChange={(event) => setPaymentAccountId(event.target.value)}
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={isProcessing}
            onClick={handlePartialPayment}
          >
            Record payment
          </button>
        </div>
      ) : null}

      {receivable || payable ? (
        <p className="planning-detail-hint">
          Recording an amount updates your account balance and creates a transaction
          in your financial history.
        </p>
      ) : null}

      {commitment ? (
        <p className="planning-detail-hint">
          {commitment.frequency === 'one-time'
            ? 'Marking this paid completes the commitment. No new due date is scheduled.'
            : `Marking this paid moves the next due date to ${format(parseISO(getNextDueDate(commitment.dueDate, commitment.frequency)), 'd MMM yyyy')}.`}
        </p>
      ) : null}

      {error ? (
        <p className="finance-dialog-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="planning-detail-actions">
        {receivable && getReceivableRemainingAmount(receivable) > 0 ? (
          <div className="planning-detail-full-action">
            <label>
              Receive into account
              <select
                value={receiptAccountId}
                onChange={(event) => setReceiptAccountId(event.target.value)}
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={isProcessing}
              onClick={handleFullReceipt}
            >
              Mark fully received
            </button>
          </div>
        ) : null}
        {payable && getPayableRemainingAmount(payable) > 0 ? (
          <div className="planning-detail-full-action">
            <label>
              Pay from account
              <select
                value={paymentAccountId}
                onChange={(event) => setPaymentAccountId(event.target.value)}
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={isProcessing}
              onClick={handleFullPayment}
            >
              Mark fully paid
            </button>
          </div>
        ) : null}
        {commitment && !commitment.isArchived && !commitment.isSettled ? (
          <button
            type="button"
            disabled={isProcessing}
            onClick={() => run(() => markCommitmentPaid(record.id))}
          >
            Mark occurrence paid
          </button>
        ) : null}
        <button type="button" disabled={isProcessing} onClick={() => onEdit({ type, id: record.id })}>
          Edit
        </button>
        {commitment ? (
          <button
            type="button"
            disabled={isProcessing}
            onClick={() =>
              run(() =>
                commitment.isArchived
                  ? restoreCommitment(record.id)
                  : archiveCommitment(record.id),
              )
            }
          >
            {commitment.isArchived ? 'Restore' : 'Archive'}
          </button>
        ) : null}
        {isConfirmingDelete ? (
          <>
            {hasFinancialHistory ? (
              <p className="planning-detail-note">
                Recorded transactions from this item will remain in your financial
                history after deletion.
              </p>
            ) : null}
            <button
              type="button"
              className="is-destructive"
              disabled={isProcessing}
              onClick={() =>
                run(
                  () =>
                    receivable
                      ? deleteReceivable(record.id)
                      : payable
                        ? deletePayable(record.id)
                        : deleteCommitment(record.id),
                  true,
                )
              }
            >
              Confirm delete
            </button>
            <button type="button" disabled={isProcessing} onClick={() => setIsConfirmingDelete(false)}>
              Keep item
            </button>
          </>
        ) : (
          <button
            type="button"
            className="is-destructive"
            disabled={isProcessing}
            onClick={() => setIsConfirmingDelete(true)}
          >
            Delete
          </button>
        )}
      </div>
    </DialogShell>
  )
}
