'use client';

import { use } from 'react';
import dynamic from 'next/dynamic';
import { getGameBySlug, isGameLive } from '@/lib/games/game-registry';
import { notFound } from 'next/navigation';
import { Spinner } from '@trading-game/design-intelligence-layer';

const IndexAscentGame = dynamic(
  () =>
    import('@/components/games/index-ascent/index-ascent-game').then(
      (m) => m.IndexAscentGame
    ),
  { ssr: false, loading: () => <GameLoading /> }
);

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

const BarrierRaceGame = dynamic(
  () =>
    import('@/components/games/barrier-race/barrier-race-game').then(
      (m) => m.BarrierRaceGame,
    ),
  { ssr: false, loading: () => <GameLoading /> },
);

const BarrierPredictorGame = dynamic(
  () =>
    import('@/components/games/barrier-predictor/barrier-predictor-game').then(
      (m) => m.BarrierPredictorGame,
    ),
  { ssr: false, loading: () => <GameLoading /> },
);

const BarrierTouchGame = dynamic(
  () =>
    import('@/components/games/barrier-touch/barrier-touch-game').then(
      (m) => m.BarrierTouchGame,
    ),
  { ssr: false, loading: () => <GameLoading /> },
);

const DerbyGame = dynamic(
  () => import('@/components/games/derby/derby-game').then((m) => m.DerbyGame),
  { ssr: false, loading: () => <GameLoading /> },
);

function GameLoading() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-prominent">
      <Spinner />
    </div>
  );
}

const GAME_COMPONENTS: Record<string, React.ComponentType> = {
  'index-ascent': IndexAscentGame,
  'digit-collect': DigitCollectGame,
  'digit-poker': DigitPokerGame,
  'digit-slots': DigitSlotsGame,
  'volatility-plinko': PlinkoGame,
  'barrier-race': BarrierRaceGame,
  'barrier-predictor': BarrierPredictorGame,
  'barrier-touch': BarrierTouchGame,
  'synthetic-derby': DerbyGame,
};

export default function GamePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);

  const game = getGameBySlug(slug);
  if (!game || !isGameLive(slug)) notFound();

  const GameComponent = GAME_COMPONENTS[slug];
  if (!GameComponent) notFound();

  return <GameComponent />;
}
