'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { GAMES } from '@/lib/games/game-registry';
import { ArrowRight, Sparkles } from 'lucide-react';
import { GameIcon } from '@/components/layout/game-icon';
import { useBalanceStore } from '@/stores/balance-store';
import { useMounted } from '@/hooks/use-mounted';

const ACCENT_BORDER: Record<string, string> = {
  emerald: 'group-hover:border-game-emerald/25',
  violet: 'group-hover:border-game-violet/25',
  amber: 'group-hover:border-game-amber/25',
  cyan: 'group-hover:border-game-cyan/25',
};

const ACCENT_TEXT: Record<string, string> = {
  emerald: 'text-game-emerald',
  violet: 'text-game-violet',
  amber: 'text-game-amber',
  cyan: 'text-game-cyan',
};

const RISK_COLOR: Record<string, string> = {
  High: 'text-destructive',
  Medium: 'text-warning',
  Low: 'text-success',
};

export default function LandingPage() {
  const { balance } = useBalanceStore();
  const mounted = useMounted();

  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-50 flex h-12 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur-sm md:px-8">
        <Link href="/" className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-foreground" />
          <span className="font-display text-sm font-semibold tracking-tight">
            Ideations
          </span>
        </Link>
        <div className="flex items-center gap-4">
          <span className="font-mono-game text-[11px] text-muted-foreground">
            {mounted ? `${balance.toLocaleString()} credits` : '\u2014'}
          </span>
          <Link
            href="/provably-fair"
            className="hidden text-[12px] text-muted-foreground transition-colors hover:text-foreground sm:inline"
          >
            Provably Fair
          </Link>
        </div>
      </nav>

      <section className="flex min-h-[55vh] flex-col justify-center px-4 md:px-8 lg:px-16">
        <div className="mx-auto w-full max-w-5xl">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="space-y-6"
          >
            <div className="space-y-3">
              <h1 className="font-display text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">
                Digit games.
                <br />
                <span className="text-muted-foreground">Live markets.</span>
              </h1>
              <p className="max-w-lg text-[15px] leading-relaxed text-muted-foreground md:text-base">
                Every outcome sourced from real-time Deriv tick data.
                Transparent math, open verification, demo credits.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href={`/game/${GAMES[0].slug}`}
                className="inline-flex items-center gap-2 rounded-md bg-foreground px-4 py-2 text-[13px] font-medium text-background transition-opacity hover:opacity-90"
              >
                Start playing
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <Link
                href="#modules"
                className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
              >
                Browse modules
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      <section id="modules" className="px-4 pb-16 md:px-8 lg:px-16">
        <div className="mx-auto w-full max-w-5xl">
          <div className="mb-5">
            <span className="section-label">Modules</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {GAMES.map((game, idx) => (
              <motion.div
                key={game.slug}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 + idx * 0.05, duration: 0.3 }}
              >
                <Link href={`/game/${game.slug}`} className="group block">
                  <div
                    className={`rounded-md border border-border bg-card p-4 transition-all duration-150 ${ACCENT_BORDER[game.accent] ?? ''}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <span
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded ${ACCENT_TEXT[game.accent] ?? 'text-muted-foreground'}`}
                        >
                          <GameIcon
                            iconKey={game.iconKey}
                            className="h-5 w-5"
                          />
                        </span>
                        <div>
                          <span className="text-[15px] font-medium text-foreground">
                            {game.name}
                          </span>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span className="font-mono-game uppercase">
                              {game.category}
                            </span>
                            <span className="text-border">·</span>
                            <span
                              className={`font-mono-game ${RISK_COLOR[game.risk] ?? ''}`}
                            >
                              {game.risk} risk
                            </span>
                          </div>
                        </div>
                      </div>
                      <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/30 transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-foreground" />
                    </div>
                    <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
                      {game.description}
                    </p>
                    <div className="mt-3 flex items-center gap-3 font-mono-game text-[10px] text-muted-foreground/60">
                      <span>{game.sessionLength}</span>
                      <span className="text-border">·</span>
                      <span>{game.marketSource}</span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border px-4 py-16 md:px-8 lg:px-16">
        <div className="mx-auto w-full max-w-5xl">
          <div className="mb-8">
            <span className="section-label">How it works</span>
          </div>
          <div className="grid gap-8 md:grid-cols-3">
            <div className="space-y-2">
              <h3 className="text-[14px] font-medium text-foreground">
                Live Market Entropy
              </h3>
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                Outcomes derive from real Deriv tick streams — not
                pseudo-random generators. Each digit is the last decimal of a
                live market quote.
              </p>
            </div>
            <div className="space-y-2">
              <h3 className="text-[14px] font-medium text-foreground">
                Provably Fair
              </h3>
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                No hidden house edge beyond published multipliers. Every
                outcome is auditable against the source tick.
              </p>
            </div>
            <div className="space-y-2">
              <h3 className="text-[14px] font-medium text-foreground">
                Open Math
              </h3>
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                Payout tables, probability distributions, and expected values
                are published and verifiable. Nothing opaque.
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-border px-4 py-6 md:px-8">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between">
          <p className="text-[11px] text-muted-foreground">
            Demo environment. No real funds at risk.
          </p>
          <Link
            href="/provably-fair"
            className="text-[11px] text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground hover:no-underline"
          >
            Verify the math
          </Link>
        </div>
      </footer>
    </div>
  );
}
