'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useSettingsStore } from '@/stores/settings-store';
import { useBalanceStore } from '@/stores/balance-store';
import { useTickStream, useNextTick } from '@/hooks/use-tick-stream';
import { evaluateHand, getPayTable } from '@/lib/games/digit-poker';
import type { DigitPokerState, HandResult, ParsedTick } from '@/types';
import { Button, Spinner } from '@trading-game/design-intelligence-layer';
import { GameShell } from '@/components/games/shared/game-shell';
import { GameViewport, GameNotice } from '@/components/games/shared/game-layout';
import { MiniMarketStrip } from '@/components/games/shared/mini-market-strip';
import { StakeDock } from '@/components/games/shared/stake-dock';
import { ResultOverlay } from '@/components/games/shared/result-overlay';
import type { GameInfoSection } from '@/components/games/shared/game-info-drawer';

function PokerCard({
  digit,
  held,
  revealed,
  onToggleHold,
  canHold,
  isNew,
}: {
  digit: number | null;
  held: boolean;
  revealed: boolean;
  onToggleHold: () => void;
  canHold: boolean;
  isNew: boolean;
}) {
  return (
    <motion.button
      onClick={canHold ? onToggleHold : undefined}
      aria-pressed={held}
      className={`relative flex flex-col items-center justify-center rounded-lg border-2 shadow-sm transition-all w-[clamp(3rem,18vw,4rem)] h-[clamp(4.75rem,28vw,6.5rem)] min-h-[44px] ${
        held
          ? 'border-primary bg-primary/10'
          : 'border-border-subtle bg-card hover:border-border-prominent'
      } ${canHold ? 'cursor-pointer' : 'cursor-default'}`}
      whileTap={canHold ? { scale: 0.97 } : undefined}
      animate={isNew ? { rotateY: [90, 0], scale: [0.8, 1] } : {}}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      {revealed && digit !== null ? (
        <>
          <span className="font-display text-2xl font-bold tabular-nums">{digit}</span>
          {held ? (
            <motion.span
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute -top-3 left-1/2 -translate-x-1/2 rounded bg-primary px-1.5 py-0.5 text-[9px] font-bold text-on-prominent-static-inverse"
            >
              HOLD
            </motion.span>
          ) : null}
        </>
      ) : (
        <>
          <span className="absolute inset-1.5 rounded-md border border-border-subtle bg-subtle" aria-hidden />
          <span className="relative text-xl font-display font-bold text-on-subtle">?</span>
        </>
      )}
    </motion.button>
  );
}

export function DigitPokerGame() {
  const { selectedIndex } = useSettingsStore();
  const { balance, placeBet, addWinnings } = useBalanceStore();
  const { ticks } = useTickStream(selectedIndex);
  const getNextTick = useNextTick(selectedIndex);

  const [gameState, setGameState] = useState<DigitPokerState>('idle');
  const [stake, setStake] = useState(100);
  const [hand, setHand] = useState<(number | null)[]>([null, null, null, null, null]);
  const [held, setHeld] = useState<boolean[]>([false, false, false, false, false]);
  const [result, setResult] = useState<HandResult | null>(null);
  const [isDealing, setIsDealing] = useState(false);
  const [lastWin, setLastWin] = useState<number | null>(null);
  const [isNewCards, setIsNewCards] = useState<boolean[]>([false, false, false, false, false]);
  const [error, setError] = useState<string | null>(null);
  const [highlightedTicks, setHighlightedTicks] = useState<ParsedTick[]>([]);
  const [lastConsumedTick, setLastConsumedTick] = useState<ParsedTick | null>(null);
  const [extractionKey, setExtractionKey] = useState(0);

  const payTable = getPayTable();

  const deal = useCallback(async () => {
    if (!placeBet(stake)) return;
    setIsDealing(true);
    setGameState('drawing');
    setResult(null);
    setLastWin(null);
    setError(null);
    setHand([null, null, null, null, null]);
    setHeld([false, false, false, false, false]);
    setHighlightedTicks([]);
    setLastConsumedTick(null);
    setExtractionKey(0);

    try {
      const nextHand: (number | null)[] = [null, null, null, null, null];

      for (let i = 0; i < 5; i++) {
        const tick = await getNextTick();
        nextHand[i] = tick.lastDigit;
        setHand([...nextHand]);
        setIsNewCards((prev) => {
          const next = [...prev];
          next[i] = true;
          return next;
        });
        setHighlightedTicks((prev) => [...prev, tick]);
        setLastConsumedTick(tick);
        setExtractionKey((k) => k + 1);
        setTimeout(() => {
          setIsNewCards((prev) => {
            const next = [...prev];
            next[i] = false;
            return next;
          });
        }, 500);
      }

      setGameState('dealt');
    } catch {
      setError('Connection issue — check your stream and try again.');
      addWinnings(stake);
      setGameState('idle');
    } finally {
      setIsDealing(false);
    }
  }, [stake, placeBet, getNextTick, addWinnings]);

  const draw = useCallback(async () => {
    setIsDealing(true);
    setGameState('drawing');
    setError(null);

    const replacementCount = held.filter((h) => !h).length;

    if (replacementCount === 0) {
      const digits = hand as number[];
      const handResult = evaluateHand(digits);
      setResult(handResult);
      if (handResult.multiplier > 0) {
        const winAmount = stake * handResult.multiplier;
        addWinnings(winAmount);
        setLastWin(winAmount);
      }
      setGameState('evaluated');
      setIsDealing(false);
      return;
    }

    try {
      const newDigits = [...hand];

      for (let i = 0; i < 5; i++) {
        if (!held[i]) {
          const tick = await getNextTick();
          newDigits[i] = tick.lastDigit;
          setHand([...newDigits]);
          setIsNewCards((prev) => {
            const next = [...prev];
            next[i] = true;
            return next;
          });
          setHighlightedTicks((prev) => [...prev, tick]);
          setLastConsumedTick(tick);
          setExtractionKey((k) => k + 1);
          setTimeout(() => {
            setIsNewCards((prev) => {
              const next = [...prev];
              next[i] = false;
              return next;
            });
          }, 500);
        }
      }

      const digits = newDigits as number[];
      const handResult = evaluateHand(digits);
      setResult(handResult);
      if (handResult.multiplier > 0) {
        const winAmount = stake * handResult.multiplier;
        addWinnings(winAmount);
        setLastWin(winAmount);
      }
      setGameState('evaluated');
    } catch {
      setError('Connection issue — check your stream and try again.');
      setGameState('dealt');
    } finally {
      setIsDealing(false);
    }
  }, [hand, held, stake, addWinnings, getNextTick]);

  const toggleHold = (index: number) => {
    if (gameState !== 'dealt') return;
    setHeld((prev) => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  };

  const reset = () => {
    setGameState('idle');
    setHand([null, null, null, null, null]);
    setHeld([false, false, false, false, false]);
    setResult(null);
    setLastWin(null);
    setError(null);
    setHighlightedTicks([]);
    setLastConsumedTick(null);
  };

  const currentHandResult = hand.every((d) => d !== null) ? evaluateHand(hand as number[]) : null;
  const maxStake = Math.max(10, Math.min(balance, 5000));
  const marketReady = ticks.length > 0 || lastConsumedTick !== null;

  const infoSections: GameInfoSection[] = [
    {
      id: 'payouts',
      label: 'Payouts',
      content: (
        <div className="space-y-2">
          {payTable.map((row) => (
            <div
              key={row.rank}
              className={`flex items-center justify-between rounded-md border px-3 py-2 text-xs ${
                result?.rank === row.rank
                  ? 'border-primary/20 bg-primary/10 text-primary'
                  : currentHandResult?.rank === row.rank && gameState === 'dealt'
                    ? 'border-border-prominent bg-subtle text-on-prominent'
                    : 'border-transparent bg-subtle text-on-subtle'
              }`}
            >
              <span>{row.label}</span>
              <span className="font-display tabular-nums">
                {row.multiplier > 0 ? `${row.multiplier}x` : 'No payout'}
              </span>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: 'rules',
      label: 'Rules',
      content: (
        <div className="space-y-2 text-sm text-on-subtle">
          <p>Deal five digits from consecutive live ticks.</p>
          <p>Hold the positions you want to keep, then redraw the rest once.</p>
          <p>Two Pair or better qualifies for a payout.</p>
        </div>
      ),
    },
    {
      id: 'stats',
      label: 'Stats',
      content: (
        <div className="grid gap-3 grid-cols-3">
          <div className="rounded-md bg-subtle px-3 py-3 text-xs text-on-subtle">
            Phase
            <div className="mt-1 font-display tabular-nums text-sm text-on-prominent">
              {gameState === 'idle' ? 'Setup' : gameState === 'dealt' ? 'Hold / Draw' : 'Settled'}
            </div>
          </div>
          <div className="rounded-md bg-subtle px-3 py-3 text-xs text-on-subtle">
            Held
            <div className="mt-1 font-display tabular-nums text-sm text-on-prominent">
              {held.filter(Boolean).length}/5
            </div>
          </div>
          <div className="rounded-md bg-subtle px-3 py-3 text-xs text-on-subtle">
            Value
            <div className="mt-1 font-display tabular-nums text-sm text-on-prominent">
              {currentHandResult ? `${(stake * currentHandResult.multiplier).toFixed(0)}` : '0'}
            </div>
          </div>
        </div>
      ),
    },
  ];

  return (
    <GameShell infoSections={infoSections}>
      <GameViewport
        market={
          marketReady ? (
            <MiniMarketStrip
              ticks={ticks}
              highlightedTicks={highlightedTicks}
              lastConsumedTick={lastConsumedTick}
              extractionKey={extractionKey}
            />
          ) : (
            <div className="shrink-0 flex items-center justify-center py-6 border-b border-border-subtle">
              <Spinner />
            </div>
          )
        }
        play={
          <div className="flex flex-col flex-1 min-h-0 items-center justify-center px-4 py-3 gap-3">
            <div className="w-full max-w-md rounded-xl border border-border-subtle bg-subtle/60 px-2 py-4">
              <div className="mb-3 flex items-center justify-between px-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-on-subtle">Five-tick hand</span>
                <span className="text-[10px] text-on-subtle">Tap a card to hold</span>
              </div>
              <div className="flex justify-center gap-2 w-full">
              {hand.map((digit, idx) => (
                <PokerCard
                  key={idx}
                  digit={digit}
                  held={held[idx]}
                  revealed={gameState !== 'idle'}
                  onToggleHold={() => toggleHold(idx)}
                  canHold={gameState === 'dealt'}
                  isNew={isNewCards[idx]}
                />
              ))}
              </div>
            </div>

            <p className="text-center text-sm text-on-subtle max-w-xs">
              {gameState === 'dealt' ? (
                <>
                  {currentHandResult?.label ?? 'No hand'}
                  {currentHandResult && currentHandResult.multiplier > 0 ? (
                    <span className="ml-1 text-primary">({currentHandResult.multiplier}x)</span>
                  ) : null}
                  {' · '}
                  Hold {held.filter(Boolean).length}/5
                </>
              ) : gameState === 'drawing' ? (
                'Cards fill one tick at a time…'
              ) : gameState === 'idle' ? (
                'Deal five live digits, keep the strongest cards, then draw once.'
              ) : null}
            </p>

            {error ? <GameNotice tone="danger">{error}</GameNotice> : null}
          </div>
        }
        dock={
          <StakeDock
            stake={stake}
            max={maxStake}
            balance={balance}
            onStakeChange={setStake}
            stakeDisabled={gameState !== 'idle'}
            showSlider={gameState === 'idle'}
            footer={
              gameState === 'dealt'
                ? `Held ${held.filter(Boolean).length}/5 — tap cards to toggle`
                : undefined
            }
            actions={
              <>
                {gameState === 'idle' ? (
                  <Button
                    variant="primary"
                    className="w-full min-h-[44px]"
                    disabled={stake > balance || balance <= 0 || isDealing}
                    aria-busy={isDealing}
                    onClick={deal}
                  >
                    {isDealing ? 'Dealing…' : 'Deal hand'}
                  </Button>
                ) : null}
                {gameState === 'dealt' ? (
                  <Button
                    variant="primary"
                    className="w-full min-h-[44px]"
                    disabled={isDealing}
                    aria-busy={isDealing}
                    onClick={draw}
                  >
                    {isDealing ? 'Drawing…' : held.every((h) => h) ? 'Stand pat' : 'Draw cards'}
                  </Button>
                ) : null}
                {gameState === 'drawing' ? (
                  <Button variant="primary" className="w-full min-h-[44px]" disabled aria-busy>
                    Receiving ticks…
                  </Button>
                ) : null}
                {gameState === 'evaluated' ? (
                  <Button variant="primary" className="w-full min-h-[44px]" onClick={reset}>
                    Deal again
                  </Button>
                ) : null}
              </>
            }
          />
        }
      />

      <ResultOverlay
        open={gameState === 'evaluated' && result !== null}
        won={(result?.multiplier ?? 0) >= 1}
        title={result?.label ?? ''}
        subtitle={
          result && result.multiplier >= 1
            ? `${result.multiplier}x payout`
            : 'Two Pair or better required.'
        }
        amount={result && result.multiplier >= 1 ? lastWin ?? 0 : stake}
        amountLabel="credits"
        onDismiss={reset}
        primaryAction={{ label: 'Deal again', onClick: reset }}
      />
    </GameShell>
  );
}
