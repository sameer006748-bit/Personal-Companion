import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type CloudConnectionState =
  | 'not-configured'
  | 'configuration-error'
  | 'configured'
  | 'connected'
  | 'error'

export interface CloudConnection {
  state: CloudConnectionState
  message: string
}

function readPublicEnvironmentValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

const url = readPublicEnvironmentValue(import.meta.env.VITE_SUPABASE_URL)
const anonKey = readPublicEnvironmentValue(import.meta.env.VITE_SUPABASE_ANON_KEY)

function hasValidPublicConfig(): boolean {
  if (!url || !anonKey) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

export const supabase: SupabaseClient | undefined = hasValidPublicConfig()
  ? createClient(url ?? '', anonKey ?? '', {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : undefined

export function getCloudConfiguration(): CloudConnection {
  if (!url && !anonKey) return { state: 'not-configured', message: 'Local only' }
  if (!hasValidPublicConfig()) {
    return { state: 'configuration-error', message: 'Cloud configuration needs attention.' }
  }
  return { state: 'configured', message: 'Supabase configured' }
}

export async function checkCloudConnection(): Promise<CloudConnection> {
  const configuration = getCloudConfiguration()
  if (!supabase) return configuration

  const { error } = await supabase.auth.getSession()
  if (error) return { state: 'error', message: 'Cloud connection could not be reached. Try again.' }

  return { state: 'connected', message: 'Supabase configured' }
}

export function getSupabaseClient(): SupabaseClient {
  if (!supabase) throw new Error('Cloud sync is not configured.')
  return supabase
}

export function getFriendlyCloudError(): string {
  return 'The cloud request could not be completed. Your local data is unchanged.'
}
