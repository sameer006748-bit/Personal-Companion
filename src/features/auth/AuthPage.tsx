import { useEffect, useState } from 'react'
import { CheckCircle2, Eye, EyeOff, KeyRound, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'
import { Navigate, useNavigate } from 'react-router'

import { getFriendlyCloudError, supabase } from '../../lib/supabase'

type AuthMode = 'sign-in' | 'sign-up' | 'forgot' | 'confirmation'
type Feedback = { kind: 'error' | 'info'; title: string; body: string } | undefined

function maskEmail(email: string): string {
  const [local, domain] = email.trim().split('@')
  if (!local || !domain) return 'your email address'
  return `${local.slice(0, 2)}${'•'.repeat(Math.max(1, local.length - 2))}@${domain}`
}

function friendlyAuthError(error: unknown): Feedback {
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  if (message.includes('already') || message.includes('registered')) return { kind: 'error', title: 'Account already exists', body: 'Try signing in or reset your password if you cannot access your account.' }
  if (message.includes('password') || message.includes('weak')) return { kind: 'error', title: 'Choose a stronger password', body: 'Use at least eight characters and avoid an easily guessed password.' }
  if (message.includes('email')) return { kind: 'error', title: 'Check your email address', body: 'Enter a valid email address and try again.' }
  if (message.includes('rate') || message.includes('limit')) return { kind: 'error', title: 'Please try again shortly', body: 'Too many requests were sent. Wait a moment before trying again.' }
  return { kind: 'error', title: 'We could not complete that request', body: getFriendlyCloudError() }
}

export function AuthPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<AuthMode>('sign-in')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>()

  useEffect(() => {
    if (!supabase) return
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession()
        if (data.session) void navigate('/profile', { replace: true })
      } catch { /* The form remains usable when restoration fails. */ }
    })()
  }, [navigate])

  if (!supabase) return <Navigate to="/profile" replace />
  const client: NonNullable<typeof supabase> = supabase
  const isPasswordMode = mode === 'sign-in' || mode === 'sign-up'

  function changeMode(next: AuthMode) {
    setMode(next)
    setFeedback(undefined)
    setPassword('')
  }

  async function resendConfirmation() {
    setLoading(true)
    setFeedback(undefined)
    try {
      const { error } = await client.auth.resend({ type: 'signup', email })
      if (error) throw error
      setFeedback({ kind: 'info', title: 'Confirmation email sent', body: `A new confirmation link was sent to ${maskEmail(email)}.` })
    } catch (error) { setFeedback(friendlyAuthError(error)) } finally { setLoading(false) }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setFeedback(undefined)
    try {
      if (mode === 'forgot') {
        const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth` })
        if (error) throw error
        setFeedback({ kind: 'info', title: 'Check your email', body: `If an account exists for ${maskEmail(email)}, we sent a password reset link.` })
      } else if (mode === 'sign-up') {
        const { data, error } = await client.auth.signUp({ email, password })
        if (error) throw error
        if (data.session) { void navigate('/profile'); return }
        setMode('confirmation')
      } else {
        const { error } = await client.auth.signInWithPassword({ email, password })
        if (error) throw error
        void navigate('/profile')
      }
    } catch (error) { setFeedback(friendlyAuthError(error)) } finally { setLoading(false) }
  }

  if (mode === 'confirmation') return <main className="auth-page"><section className="auth-card glass-surface auth-confirmation" aria-labelledby="auth-title">
    <span className="auth-icon"><CheckCircle2 aria-hidden="true" /></span><p className="eyebrow">Secure cloud access</p><h1 id="auth-title">Check your email</h1>
    <p>We sent a confirmation link to <strong>{maskEmail(email)}</strong>. Confirm your email, then return here to sign in.</p>
    {feedback ? <FeedbackSurface feedback={feedback} /> : null}
    <button type="button" className="finance-dialog-save" onClick={() => changeMode('sign-in')}>Back to sign in</button>
    <button type="button" className="auth-secondary" disabled={loading} onClick={() => void resendConfirmation()}>{loading ? 'Sending confirmation' : 'Resend confirmation email'}</button>
    <small><ShieldCheck aria-hidden="true" /> Cloud service available</small>
  </section></main>

  return <main className="auth-page"><section className="auth-card glass-surface" aria-labelledby="auth-title">
    <div className="auth-brand"><span className="auth-icon">{mode === 'forgot' ? <KeyRound aria-hidden="true" /> : <LockKeyhole aria-hidden="true" />}</span><div><p className="eyebrow">Personal Companion</p><h1 id="auth-title">{mode === 'forgot' ? 'Reset password' : mode === 'sign-up' ? 'Create account' : 'Secure cloud access'}</h1></div></div>
    <p className="auth-intro">Your local financial data remains private on this device until you explicitly import it.</p>
    <form onSubmit={(event) => { void submit(event) }}>
      <label htmlFor="auth-email">Email<input id="auth-email" required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      {isPasswordMode ? <label htmlFor="auth-password">Password<span className="auth-password"><input id="auth-password" required minLength={8} type={showPassword ? 'text' : 'password'} autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button></span></label> : null}
      {feedback ? <FeedbackSurface feedback={feedback} /> : null}
      <button className="finance-dialog-save" disabled={loading} type="submit">{loading ? 'Please wait' : mode === 'forgot' ? 'Send reset link' : mode === 'sign-up' ? 'Create account' : 'Sign in'}</button>
    </form>
    <div className="auth-actions">{mode === 'sign-in' ? <><button type="button" className="auth-secondary" onClick={() => changeMode('sign-up')}>Create account</button><button type="button" className="auth-secondary" onClick={() => changeMode('forgot')}>Forgot password</button></> : <button type="button" className="auth-secondary" onClick={() => changeMode('sign-in')}>Back to sign in</button>}</div>
    <small><Mail aria-hidden="true" /> Cloud service available</small>
  </section></main>
}

function FeedbackSurface({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null
  return <div className={`auth-feedback is-${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'}><strong>{feedback.title}</strong><span>{feedback.body}</span></div>
}
