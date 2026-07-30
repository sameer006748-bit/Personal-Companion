import { useState } from 'react'
import { Archive, Pencil, Plus, RotateCcw, Star } from 'lucide-react'

import { getAccountBalance, getActiveAccounts, getArchivedAccounts } from '../../lib/financeCore'
import { ACCOUNT_TYPE_LABELS, type AccountType, type LocalAccount } from '../../models/finance'
import { PrivateAmount } from '../../shared/ui/PrivateAmount'
import { useAppStore } from '../../store/appStore'

const accountTypes = Object.keys(ACCOUNT_TYPE_LABELS) as AccountType[]

function AccountForm({ account, onClose }: { account?: LocalAccount; onClose: () => void }) {
  const createAccount = useAppStore((state) => state.createFinanceAccount)
  const updateAccount = useAppStore((state) => state.updateFinanceAccount)
  const [name, setName] = useState(account?.name ?? '')
  const [type, setType] = useState<AccountType>(account?.type ?? 'bank')
  const [institutionName, setInstitutionName] = useState(account?.institutionName ?? '')
  const [lastFourDigits, setLastFourDigits] = useState(account?.lastFourDigits ?? '')
  const [openingBalance, setOpeningBalance] = useState(String(account?.openingBalance ?? 0))
  const [makeDefault, setMakeDefault] = useState(account?.isDefault ?? false)
  const [error, setError] = useState('')
  function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const input = { name, type, ...(institutionName.trim() ? { institutionName } : {}), ...(lastFourDigits ? { lastFourDigits } : {}), openingBalance: Number(openingBalance), makeDefault }; const message = account ? updateAccount(account.id, input) : createAccount(input); if (message) { setError(message); return }; onClose() }
  return <form className="finance-account-form" onSubmit={submit}><label>Account name<input required value={name} onChange={(event) => setName(event.target.value)} /></label><label>Account type<select value={type} onChange={(event) => setType(event.target.value as AccountType)}>{accountTypes.map((value) => <option key={value} value={value}>{ACCOUNT_TYPE_LABELS[value]}</option>)}</select></label><label>Institution <span>Optional</span><input value={institutionName} onChange={(event) => setInstitutionName(event.target.value)} /></label><label>Last four digits <span>Optional</span><input inputMode="numeric" maxLength={4} value={lastFourDigits} onChange={(event) => setLastFourDigits(event.target.value.replaceAll(/\D/g, '').slice(0, 4))} /></label><label>Opening balance<input required type="number" min="0" step="1" inputMode="numeric" value={openingBalance} onChange={(event) => setOpeningBalance(event.target.value)} /></label><label className="finance-checkbox"><input type="checkbox" checked={makeDefault} onChange={(event) => setMakeDefault(event.target.checked)} /> Make default</label>{error ? <p role="alert">{error}</p> : null}<button type="submit" className="profile-action-button glass-control">Save account</button></form>
}

export function AccountManagement() {
  const finance = useAppStore((state) => state.finance)
  const setDefault = useAppStore((state) => state.setFinanceDefaultAccount)
  const archive = useAppStore((state) => state.archiveFinanceAccount)
  const restore = useAppStore((state) => state.restoreFinanceAccount)
  const [editing, setEditing] = useState<LocalAccount | null>(null)
  const [adding, setAdding] = useState(false)
  const [message, setMessage] = useState('')
  const active = getActiveAccounts(finance)
  const archived = getArchivedAccounts(finance)
  function run(action: () => string | undefined) { const error = action(); setMessage(error ?? 'Account updated') }
  return <section className="profile-section glass-surface" aria-labelledby="accounts-title"><div className="finance-account-heading"><div><h2 id="accounts-title" className="profile-section-title">Accounts</h2><p>Manage the accounts used in your financial overview.</p></div><button type="button" className="glass-control profile-action-button" onClick={() => setAdding(true)}><Plus aria-hidden="true" /> Add account</button></div>{message ? <p className="finance-account-message" role="status">{message}</p> : null}<div className="finance-account-list">{active.map((account) => <article key={account.id} className="finance-account-row"><div><strong>{account.name}{account.isDefault ? <span>Default</span> : null}</strong><small>{ACCOUNT_TYPE_LABELS[account.type]}{account.institutionName ? ` · ${account.institutionName}` : ''}{account.lastFourDigits ? ` · •••• ${account.lastFourDigits}` : ''}</small></div><PrivateAmount amount={getAccountBalance(finance, account.id)} /><div className="finance-account-actions"><button type="button" aria-label={`Edit ${account.name}`} onClick={() => setEditing(account)}><Pencil aria-hidden="true" /></button>{!account.isDefault ? <button type="button" aria-label={`Set ${account.name} as default`} onClick={() => run(() => setDefault(account.id))}><Star aria-hidden="true" /></button> : null}{!account.isDefault ? <button type="button" aria-label={`Archive ${account.name}`} onClick={() => run(() => archive(account.id))}><Archive aria-hidden="true" /></button> : null}</div></article>)}</div>{archived.length ? <div className="finance-archived"><p>Archived accounts</p>{archived.map((account) => <div key={account.id}><span>{account.name}</span><button type="button" onClick={() => run(() => restore(account.id))}><RotateCcw aria-hidden="true" /> Restore</button></div>)}</div> : null}{adding ? <AccountForm onClose={() => setAdding(false)} /> : null}{editing ? <AccountForm account={editing} onClose={() => setEditing(null)} /> : null}</section>
}
