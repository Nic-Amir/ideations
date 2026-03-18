'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { GAMES } from '@/lib/games/game-registry';
import { ArrowRight } from 'lucide-react';
import { GameIcon } from '@/components/layout/game-icon';
import { useBalanceStore } from '@/stores/balance-store';
import { useMounted } from '@/hooks/use-mounted';

const ACCENT_BORDER: Record<string, string> = {
  emerald: 'border-l-game-emerald',
  violet: 'border-l-game-violet',
  amber: 'border-l-game-amber',
  cyan: 'border-l-game-cyan',
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

export default function HomePage() {
  const { balance, totalWagered, totalWon } = useBalanceStore();
  const mounted = useMounted();

  const net = balance - 10_000;

  return (
    <div className="mx-auto max-w-3xl px-3 py-4 md:px-5 md:py-6">
      <div className="grid gap-2 sm:grid-cols-2">
        {GAMES.map((game, idx) => (
          <motion.div
            key={game.slug}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.04, duration: 0.2 }}
          >
            <Link href={`/game/${game.slug}`} className="group block">
              <div
                className={`rounded border-l-2 bg-card p-3.5 transition-colors duration-100 hover:bg-accent ${ACCENT_BORDER[game.accent] ?? 'border-l-border'}`}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center ${ACCENT_TEXT[game.accent] ?? 'text-muted-foreground'}`}
                  >
                    <GameIcon iconKey={game.iconKey} className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono-game text-[13px] font-medium text-foreground">
                        {game.name}
                      </span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground/30 transition-transform duration-100 group-hover:translate-x-0.5 group-hover:text-foreground" />
                    </div>
                    <div className="flex items-center gap-2 font-mono-game text-[9px] text-muted-foreground">
                      <span className="uppercase">{game.category}</span>
                      <span className="text-border">/</span>
                      <span className={RISK_COLOR[game.risk] ?? ''}>
                        {game.risk}
                      </span>
                      <span className="text-border">/</span>
                      <span>{game.sessionLength}</span>
                    </div>
                  </div>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  {game.shortPitch}
                </p>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-4 rounded bg-accent px-3 py-2.5 font-mono-game text-[10px] text-muted-foreground">
        <span>
          Balance{' '}
          <span className={`text-foreground ${net < -1000 ? 'text-destructive' : ''}`}>
            {mounted ? balance.toLocaleString() : '\u2014'}
          </span>
        </span>
        <span className="text-border">/</span>
        <span>
          Net{' '}
          <span className={net >= 0 ? 'text-success' : 'text-destructive'}>
            {mounted ? `${net >= 0 ? '+' : ''}${net.toLocaleString()}` : '\u2014'}
          </span>
        </span>
        <span className="text-border">/</span>
        <span>
          Wagered{' '}
          <span className="text-foreground">
            {mounted ? totalWagered.toLocaleString() : '\u2014'}
          </span>
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between px-1 text-[10px] text-muted-foreground">
        <span>All outcomes from live Deriv tick data.</span>
        <Link
          href="/provably-fair"
          className="font-mono-game text-foreground underline underline-offset-2 hover:no-underline"
        >
          Verify the math
        </Link>
      </div>
    </div>
  );
}
