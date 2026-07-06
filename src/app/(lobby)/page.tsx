'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Sparkles, Wallet } from 'lucide-react';
import { GAMES, LIVE_GAMES } from '@/lib/games/game-registry';
import { Badge, Card, TicketCard } from '@trading-game/design-intelligence-layer';
import { GameIcon } from '@/components/layout/game-icon';
import { useBalanceStore } from '@/stores/balance-store';
import { useMounted } from '@/hooks/use-mounted';
import type { GameInfo } from '@/types';

const RISK_COLOR: Record<string, string> = {
  High: 'text-semantic-loss',
  Medium: 'text-semantic-warning',
  Low: 'text-semantic-win',
};

const FEATURED_GAME = LIVE_GAMES[0];
const GRID_GAMES = GAMES.filter((game) => game.slug !== FEATURED_GAME?.slug);

function isLive(slug: string) {
  return LIVE_GAMES.some((game) => game.slug === slug);
}

export default function HomePage() {
  const router = useRouter();
  const { balance, totalWagered, totalWon } = useBalanceStore();
  const mounted = useMounted();

  const net = balance - 10_000;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-8">
      <header className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xs bg-primary">
          <Sparkles className="size-5 text-on-prominent-static-inverse" />
        </div>
        <div>
          <h1 className="font-display text-xl font-bold text-on-prominent">
            Trading Game product roadmap
          </h1>
          <p className="text-sm text-on-subtle">
            Market-driven digit games — demo pricing and mechanics.
          </p>
        </div>
      </header>

      <div className="space-y-2">
        <TicketCard
          icon={<Wallet size={20} className="text-primary" />}
          label="Balance"
          value={mounted ? balance.toLocaleString() : '—'}
          currency="credits"
          stubLabel="Verify"
          onStubClick={() => router.push('/provably-fair')}
        />
        <div className="flex flex-wrap items-center gap-4 px-1 text-xs text-on-subtle">
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
      </div>

      {FEATURED_GAME && (
        <section>
          <Link href={`/game/${FEATURED_GAME.slug}`} className="block">
            <FeaturedHeroCard game={FEATURED_GAME} />
          </Link>
        </section>
      )}

      <section>
        <h2 className="mb-3 font-display text-sm font-bold text-on-prominent">
          All games
        </h2>
        <div className="grid grid-cols-1 gap-3 min-[960px]:grid-cols-2">
          {GRID_GAMES.map((game, idx) => {
            const live = isLive(game.slug);
            return (
              <motion.div
                key={game.slug}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.04, duration: 0.2 }}
              >
                {live ? (
                  <Link href={`/game/${game.slug}`} className="group block">
                    <GameGridCard game={game} />
                  </Link>
                ) : (
                  <div className="opacity-60">
                    <GameGridCard game={game} preview />
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </section>

      <p className="body-xs text-on-subtle">
        All outcomes from live Deriv tick data.
      </p>
    </div>
  );
}

function FeaturedHeroCard({ game }: { game: GameInfo }) {
  return (
    <Card className="relative flex min-h-[280px] flex-col justify-between overflow-hidden border-0 bg-primary p-6 transition-transform duration-200 hover:scale-[1.01] md:p-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 -bottom-8 select-none opacity-20"
      >
        <GameIcon iconKey={game.iconKey} className="size-48 text-on-prominent-static-inverse md:size-56" />
      </div>

      <div className="relative z-10">
        <Badge variant="default-success" size="sm">
          Featured
        </Badge>
      </div>

      <div className="relative z-10 mt-auto">
        <h3 className="font-display text-2xl font-bold leading-tight text-on-prominent-static-inverse md:text-3xl">
          {game.name}
        </h3>
        <p className="mt-2 line-clamp-2 font-body text-sm font-semibold text-on-prominent-static-inverse md:text-base">
          {game.shortPitch}
        </p>
        <div className="mt-2 flex items-center gap-2 font-body text-xs text-on-prominent-static-inverse/70">
          <span className="uppercase">{game.category}</span>
          <span>/</span>
          <span>{game.risk}</span>
          <span>/</span>
          <span>{game.sessionLength}</span>
        </div>
      </div>
    </Card>
  );
}

function GameGridCard({
  game,
  preview,
}: {
  game: GameInfo;
  preview?: boolean;
}) {
  return (
    <Card className="h-fit overflow-hidden border-0 bg-subtle transition-colors duration-fast hover:bg-secondary-hover">
      <div className="flex flex-row items-center px-6 py-4">
        <div className="min-w-0 flex-1">
          <div className="mb-2">
            <Badge
              variant={preview ? 'default-warning' : 'default-success'}
              size="sm"
            >
              {preview ? 'Preview' : 'Live'}
            </Badge>
          </div>
          <h3 className="font-display text-2xl font-bold leading-tight text-on-prominent">
            {game.name}
          </h3>
          <p className="mt-2 font-body text-sm text-on-subtle">
            {game.shortPitch}
          </p>
          <div className="mt-2 flex items-center gap-2 font-body text-xs text-on-subtle">
            <span className="uppercase">{game.category}</span>
            <span>/</span>
            <span className={RISK_COLOR[game.risk] ?? ''}>{game.risk}</span>
            <span>/</span>
            <span>{game.sessionLength}</span>
          </div>
        </div>
        <div className="relative ml-4 shrink-0">
          <div className="flex size-[90px] items-center justify-center rounded-full bg-primary/10 transition-transform duration-200 group-hover:scale-105 min-[960px]:size-[115px]">
            <GameIcon iconKey={game.iconKey} className="size-10 text-primary min-[960px]:size-12" />
          </div>
        </div>
      </div>
    </Card>
  );
}
