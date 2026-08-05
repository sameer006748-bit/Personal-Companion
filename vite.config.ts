import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

/**
 * `import.meta.env.VITE_*` is statically replaced at build time. When a value is
 * absent the replacement is the literal `undefined`, so the bundle ships with
 * cloud config permanently missing and the Assistant short-circuits on its
 * `not-configured` preflight before any request starts. That failure is silent:
 * the app still builds, still installs, and still answers locally.
 *
 * A build that cannot reach the cloud must therefore be a deliberate choice, not
 * an accident. Set VITE_ALLOW_LOCAL_ONLY_BUILD=1 to opt into one on purpose.
 */
function requireCloudConfiguration(mode: string): Plugin {
  return {
    name: 'require-cloud-configuration',
    apply: 'build',
    config() {
      const env = loadEnv(mode, process.cwd(), 'VITE_')
      if (env.VITE_ALLOW_LOCAL_ONLY_BUILD === '1') return

      const url = env.VITE_SUPABASE_URL?.trim()
      const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim()
      const problems: string[] = []

      if (!url) problems.push('VITE_SUPABASE_URL is missing or empty')
      else {
        try {
          const { protocol } = new URL(url)
          if (protocol !== 'https:' && protocol !== 'http:') {
            problems.push(`VITE_SUPABASE_URL has an unusable protocol (${protocol})`)
          }
        } catch {
          problems.push('VITE_SUPABASE_URL is not a valid URL')
        }
      }
      if (!anonKey) problems.push('VITE_SUPABASE_ANON_KEY is missing or empty')

      if (!problems.length) return
      throw new Error(
        [
          'Refusing to build: the Assistant would ship permanently offline.',
          ...problems.map((problem) => `  - ${problem}`),
          '',
          'Put both values in .env.local (see .env.example), then rebuild.',
          'For an intentional local-only build, set VITE_ALLOW_LOCAL_ONLY_BUILD=1.',
        ].join('\n'),
      )
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), requireCloudConfiguration(mode)],
}))
