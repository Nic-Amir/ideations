'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { GAMES, LIVE_GAMES } from '@/lib/games/game-registry';
import { Badge, Button, Card } from '@trading-game/design-intelligence-layer';
import { GameIcon } from '@/components/layout/game-icon';
import { useBalanceStore } from '@/stores/balance-store';
import { useMounted } from '@/hooks/use-mounted';

const RISK_COLOR: Record<string, string> = {
  High: 'text-semantic-loss',
  Medium: 'text-semantic-warning',
  Low: 'text-semantic-win',
};

export default function HomePage() {
  const { balance, totalWagered, totalWon } = useBalanceStore();
  const mounted = useMounted();

  const net = balance - 10_000;

  return (
    <div className="mx-auto max-w-3xl px-layout-margin-inline py-6">
      <div className="mb-6">
        <h1 className="heading-h2 font-display text-on-prominent">Ideations</h1>
        <p className="body-sm text-on-subtle mt-1">
          Market-driven digit games — demo pricing and mechanics.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {GAMES.map((game, idx) => {
          const isLive = LIVE_GAMES.some((g) => g.slug === game.slug);
          return (
            <motion.div
              key={game.slug}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.04, duration: 0.2 }}
            >
              {isLive ? (
                <Link href={`/game/${game.slug}`} className="group block">
                  <GameCardContent game={game} />
                </Link>
              ) : (
                <div className="opacity-60">
                  <GameCardContent game={game} preview />
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      <Card className="mt-4 border-0 bg-subtle">
        <div className="flex flex-wrap items-center gap-4 px-4 py-3 text-xs text-on-subtle">
          <span>
            Balance{' '}
            <span
              className={`font-display font-semibold tabular-nums text-on-prominent ${net < -1000 ? 'text-semantic-loss' : ''}`}
            >
              {mounted ? balance.toLocaleString() : '—'}
            </span>
          </span>
          <span className="text-border-subtle">/</span>
          <span>
            Net{' '}
            <span
              className={`font-display font-semibold tabular-nums ${net >= 0 ? 'text-semantic-win' : 'text-semantic-loss'}`}
            >
              {mounted ? `${net >= 0 ? '+' : ''}${net.toLocaleString()}` : '—'}
            </span>
          </span>
          <span className="text-border-subtle">/</span>
          <span>
            Wagered{' '}
            <span className="font-display font-semibold tabular-nums text-on-prominent">
              {mounted ? totalWagered.toLocaleString() : '—'}
            </span>
          </span>
          <span className="text-border-subtle">/</span>
          <span>
            Won{' '}
            <span className="font-display font-semibold tabular-nums text-on-prominent">
              {mounted ? totalWon.toLocaleString() : '—'}
            </span>
          </span>
        </div>
      </Card>

      <div className="mt-4 flex items-center justify-between">
        <span className="body-xs text-on-subtle">
          All outcomes from live Deriv tick data.
        </span>
        <Button variant="tertiary" size="sm" asChild>
          <Link href="/provably-fair">Verify the math</Link>
        </Button>
      </div>
    </div>
  );
}

function GameCardContent({
  game,
  preview,
}: {
  game: (typeof GAMES)[number];
  preview?: boolean;
}) {
  return (
    <Card className="border-0 overflow-hidden h-fit bg-subtle hover:bg-secondary-hover transition-colors duration-fast">
      <div className="flex flex-row items-center px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="mb-2">
            <Badge
              variant={preview ? 'default-warning' : 'default-success'}
              size="sm"
            >
              {preview ? 'Preview' : 'Live'}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-primary">
              <GameIcon iconKey={game.iconKey} className="h-5 w-5" />
            </span>
            <h3 className="font-bold text-on-prominent text-xl font-display leading-tight">
              {game.name}
            </h3>
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-on-subtle font-body">
            <span className="uppercase">{game.category}</span>
            <span>/</span>
            <span className={RISK_COLOR[game.risk] ?? ''}>{game.risk}</span>
            <span>/</span>
            <span>{game.sessionLength}</span>
          </div>
          <p className="text-sm text-on-subtle font-body mt-2">
            {game.shortPitch}
          </p>
        </div>
      </div>
    </Card>
  );
}
