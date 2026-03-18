'use client';

import { use } from 'react';
import dynamic from 'next/dynamic';
import { getGameBySlug } from '@/lib/games/game-registry';
import { notFound } from 'next/navigation';
import { ConnectionIndicator } from '@/components/layout/connection-indicator';
import { GameIcon } from '@/components/layout/game-icon';
import { Badge } from '@/components/ui/badge';

const DigitCollectGame = dynamic(
  () =>
    import('@/components/games/digit-collect/digit-collect-game').then(
      (m) => m.DigitCollectGame
    ),
  { ssr: false, loading: () => <GameLoading /> }
);

const DigitPokerGame = dynamic(
  () =>
    import('@/components/games/digit-poker/digit-poker-game').then(
      (m) => m.DigitPokerGame
    ),
  { ssr: false, loading: () => <GameLoading /> }
);

const DigitSlotsGame = dynamic(
  () =>
    import('@/components/games/digit-slots/digit-slots-game').then(
      (m) => m.DigitSlotsGame
    ),
  { ssr: false, loading: () => <GameLoading /> }
);

const PlinkoGame = dynamic(
  () =>
    import('@/components/games/plinko/plinko-game').then((m) => m.PlinkoGame),
  { ssr: false, loading: () => <GameLoading /> }
);

function GameLoading() {
  return (
    <div className="page-gutter">
      <div className="surface-panel flex h-[60vh] items-center justify-center rounded-lg">
        <div className="flex flex-col items-center gap-2">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-[12px] text-muted-foreground">Loading...</p>
        </div>
      </div>
    </div>
  );
}

const GAME_COMPONENTS: Record<string, React.ComponentType> = {
  'digit-collect': DigitCollectGame,
  'digit-poker': DigitPokerGame,
  'digit-slots': DigitSlotsGame,
  'volatility-plinko': PlinkoGame,
};

const STREAM_GAMES = new Set(['digit-collect', 'digit-poker', 'digit-slots']);

export default function GamePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);

  const game = getGameBySlug(slug);
  if (!game) notFound();

  const GameComponent = GAME_COMPONENTS[slug];
  if (!GameComponent) notFound();

  const usesStream = STREAM_GAMES.has(slug);

  return (
    <div className="min-h-[calc(100vh-3.5rem)]">
      <div className="page-gutter pb-0">
        <div className="flex flex-col gap-2 rounded-lg border border-white/6 bg-white/[0.03] px-3 py-2.5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-primary/16 bg-primary/8 text-primary">
              <GameIcon iconKey={game.iconKey} className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate font-display text-[15px] font-semibold tracking-tight">
                {game.name}
              </h1>
              <p className="truncate text-[12px] text-muted-foreground">
                {game.shortPitch}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono-game text-muted-foreground">
            <span>{game.category}</span>
            <span className="text-white/10">·</span>
            <span>{game.risk}</span>
            <span className="text-white/10">·</span>
            <span>{game.marketSource}</span>
            {usesStream ? <ConnectionIndicator /> : null}
          </div>
        </div>
      </div>
      <GameComponent />
    </div>
  );
}
