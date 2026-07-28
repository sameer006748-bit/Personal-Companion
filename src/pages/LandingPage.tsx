import { ArrowDown, CalendarDays, Sparkles } from 'lucide-react'

import { BrandMark } from '../shared/ui/BrandMark'

export function LandingPage() {
  return (
    <div className="min-h-screen overflow-hidden bg-canvas text-ink">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-7 sm:px-10 lg:px-12">
        <a
          className="inline-flex items-center gap-3 rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
          href="/"
          aria-label="Personal Companion home"
        >
          <BrandMark />
          <span className="text-sm font-semibold tracking-[-0.01em]">
            Personal Companion
          </span>
        </a>
        <span className="hidden text-xs font-medium uppercase tracking-[0.18em] text-muted sm:block">
          Thoughtful everyday support
        </span>
      </header>

      <main className="relative mx-auto flex min-h-[calc(100vh-104px)] w-full max-w-7xl items-center px-6 pb-14 pt-8 sm:px-10 lg:px-12">
        <div
          className="pointer-events-none absolute right-[-9rem] top-[4%] size-[28rem] rounded-full bg-accent/10 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute bottom-[-12rem] left-[18%] size-[26rem] rounded-full bg-highlight/60 blur-3xl"
          aria-hidden="true"
        />

        <section className="relative grid w-full items-end gap-16 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-24">
          <div className="max-w-3xl">
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-line bg-white/65 px-3.5 py-2 text-xs font-semibold text-muted shadow-soft backdrop-blur">
              <Sparkles aria-hidden="true" className="size-3.5 text-accent" />
              A clear place to begin
            </div>

            <h1 className="text-balance font-display text-[clamp(3.35rem,9vw,7.5rem)] leading-[0.88] tracking-[-0.065em]">
              Make space for
              <span className="block text-accent">what matters.</span>
            </h1>

            <p className="mt-8 max-w-xl text-pretty text-base leading-7 text-muted sm:text-lg sm:leading-8">
              Personal Companion is being shaped as a calm, dependable home for
              everyday planning, reflection, and support.
            </p>
          </div>

          <aside className="relative overflow-hidden rounded-[2rem] border border-line bg-panel p-7 shadow-card sm:p-8">
            <div
              className="absolute right-0 top-0 size-32 translate-x-10 -translate-y-12 rounded-full bg-highlight"
              aria-hidden="true"
            />
            <CalendarDays
              aria-hidden="true"
              className="relative size-7 text-accent"
              strokeWidth={1.7}
            />
            <p className="relative mt-14 text-xs font-semibold uppercase tracking-[0.17em] text-muted">
              Foundation
            </p>
            <p className="relative mt-3 font-display text-3xl leading-tight tracking-[-0.035em]">
              A focused start, ready to grow with purpose.
            </p>
            <div className="relative mt-8 flex items-center gap-3 border-t border-line pt-5 text-sm font-medium text-muted">
              <ArrowDown aria-hidden="true" className="size-4 text-accent" />
              Initial experience in progress
            </div>
          </aside>
        </section>
      </main>
    </div>
  )
}

