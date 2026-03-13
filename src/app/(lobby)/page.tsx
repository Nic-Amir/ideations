'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { GAMES } from '@/lib/games/game-registry';
import { ArrowRight } from 'lucide-react';
import { GameIcon } from '@/components/layout/game-icon';
import { Badge } from '@/components/ui/badge';

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

export default function LobbyPage() {
  return (
    <div className="page-gutter space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-3 px-1 pt-2"
      >
        <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
          Games powered by live market data
        </h1>
        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
          Pick a game below. Every outcome is derived from real-time tick
          data — play with demo credits, fully transparent math.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Badge variant="outline" className="rounded-full border-white/10 bg-white/4 px-3 py-1 text-xs text-muted-foreground">
            Live Market Data
          </Badge>
          <Badge variant="outline" className="rounded-full border-white/10 bg-white/4 px-3 py-1 text-xs text-muted-foreground">
            Demo Credits
          </Badge>
          <Badge variant="outline" className="rounded-full border-white/10 bg-white/4 px-3 py-1 text-xs text-muted-foreground">
            Provably Fair
          </Badge>
        </div>
      </motion.div>

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid gap-4 sm:grid-cols-2"
      >
        {GAMES.map((game) => (
          <motion.div key={game.slug} variants={item}>
            <Link href={`/game/${game.slug}`}>
              <div className="surface-panel group flex h-full flex-col rounded-[2rem] p-5 transition-transform duration-300 hover:-translate-y-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                    <GameIcon iconKey={game.iconKey} className="h-6 w-6" />
                  </div>
                  <Badge variant="outline" className="rounded-full border-white/10 bg-white/4 px-2.5 py-0.5 text-[10px] text-muted-foreground">
                    {game.risk} risk
                  </Badge>
                </div>

                <div className="mt-5 flex-1">
                  <h2 className="font-display text-xl font-semibold tracking-tight">
                    {game.name}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {game.shortPitch}
                  </p>
                </div>

                <div className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-primary transition-transform group-hover:translate-x-1">
                  <span>Play</span>
                  <ArrowRight className="h-4 w-4" />
                </div>
              </div>
            </Link>
          </motion.div>
        ))}
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="surface-panel-muted rounded-2xl px-5 py-4 text-center text-sm text-muted-foreground"
      >
        All outcomes derived from live Deriv tick data.{' '}
        <Link href="/provably-fair" className="font-medium text-primary hover:underline">
          See how it works
        </Link>
      </motion.div>
    </div>
  );
}
