'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { GAMES } from '@/lib/games/game-registry';
import { ArrowRight } from 'lucide-react';
import { GameIcon } from '@/components/layout/game-icon';

const ACCENT_MAP: Record<string, string> = {
  emerald: 'group-hover:text-game-emerald',
  violet: 'group-hover:text-game-violet',
  amber: 'group-hover:text-game-amber',
  cyan: 'group-hover:text-game-cyan',
};

const RISK_COLOR: Record<string, string> = {
  High: 'text-destructive',
  Medium: 'text-warning',
  Low: 'text-success',
};

export default function LobbyPage() {
  return (
    <div className="page-gutter space-y-5">
      <div className="space-y-1 pt-1">
        <h1 className="font-display text-xl font-semibold tracking-tight md:text-2xl">
          Modules
        </h1>
        <p className="max-w-md text-[13px] text-muted-foreground">
          Live tick outcomes. Demo credits. Transparent math.
        </p>
      </div>

      <div className="space-y-1">
        {GAMES.map((game, idx) => (
          <motion.div
            key={game.slug}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.04, duration: 0.2 }}
          >
            <Link href={`/game/${game.slug}`} className="group block">
              <div className="flex items-center gap-3 rounded-md px-3 py-3 transition-colors duration-100 hover:bg-accent">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded text-muted-foreground ${ACCENT_MAP[game.accent] ?? ''}`}>
                  <GameIcon iconKey={game.iconKey} className="h-4 w-4" />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[14px] font-medium text-foreground">
                      {game.name}
                    </span>
                    <span className="hidden text-[11px] text-muted-foreground sm:inline">
                      {game.shortPitch}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="font-mono-game uppercase">{game.category}</span>
                    <span className="text-border">·</span>
                    <span className={`font-mono-game ${RISK_COLOR[game.risk] ?? ''}`}>
                      {game.risk}
                    </span>
                    <span className="text-border">·</span>
                    <span className="font-mono-game">{game.sessionLength}</span>
                  </div>
                </div>

                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-transform duration-100 group-hover:translate-x-0.5 group-hover:text-foreground" />
              </div>
            </Link>
          </motion.div>
        ))}
      </div>

      <p className="px-1 text-[11px] text-muted-foreground">
        All outcomes derived from live tick data.{' '}
        <Link href="/provably-fair" className="text-foreground underline underline-offset-2 hover:no-underline">
          Verify the math
        </Link>
      </p>
    </div>
  );
}
