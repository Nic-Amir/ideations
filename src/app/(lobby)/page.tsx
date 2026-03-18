'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { GAMES } from '@/lib/games/game-registry';
import { ArrowRight } from 'lucide-react';
import { GameIcon } from '@/components/layout/game-icon';

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.04 },
  },
};

const item = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

const RISK_COLOR: Record<string, string> = {
  High: 'text-destructive',
  Medium: 'text-warning',
  Low: 'text-primary',
};

export default function LobbyPage() {
  return (
    <div className="page-gutter space-y-5">
      <div className="space-y-1.5 pt-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">
          Game modules
        </h1>
        <p className="max-w-lg text-[13px] leading-relaxed text-muted-foreground">
          Every outcome sourced from live Deriv ticks. Demo credits, transparent math,
          zero signup.
        </p>
      </div>

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid gap-px overflow-hidden rounded-lg border border-white/6 bg-white/[0.03] sm:grid-cols-2"
      >
        {GAMES.map((game) => (
          <motion.div key={game.slug} variants={item}>
            <Link href={`/game/${game.slug}`} className="group block h-full">
              <div className="flex h-full flex-col justify-between bg-card p-4 transition-colors duration-150 group-hover:bg-white/[0.04]">
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/8 bg-white/[0.04] text-muted-foreground group-hover:text-primary">
                        <GameIcon iconKey={game.iconKey} className="h-4 w-4" />
                      </span>
                      <h2 className="font-display text-[15px] font-semibold tracking-tight">
                        {game.name}
                      </h2>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-primary" />
                  </div>
                  <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                    {game.shortPitch}
                  </p>
                </div>

                <div className="mt-3 flex items-center gap-3 border-t border-white/[0.04] pt-3 text-[11px] text-muted-foreground">
                  <span className="font-mono-game uppercase">{game.category}</span>
                  <span className="text-white/10">|</span>
                  <span className={`font-mono-game ${RISK_COLOR[game.risk] ?? 'text-muted-foreground'}`}>
                    {game.risk}
                  </span>
                  <span className="text-white/10">|</span>
                  <span className="font-mono-game">{game.sessionLength}</span>
                </div>
              </div>
            </Link>
          </motion.div>
        ))}
      </motion.div>

      <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary/60" />
        <span>
          All outcomes derived from live tick data.{' '}
          <Link href="/provably-fair" className="font-medium text-primary hover:underline">
            Verify the math
          </Link>
        </span>
      </div>
    </div>
  );
}
