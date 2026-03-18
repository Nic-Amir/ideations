'use client';

import { use } from 'react';
import dynamic from 'next/dynamic';
import { getGameBySlug } from '@/lib/games/game-registry';
import { notFound } from 'next/navigation';

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
    <div className="flex h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-2">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
        <p className="font-mono-game text-[10px] text-muted-foreground">Loading module</p>
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

  return <GameComponent />;
}
