'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettingsStore } from '@/stores/settings-store';
import { useBalanceStore } from '@/stores/balance-store';
import { useTickStream, useNextTick } from '@/hooks/use-tick-stream';
import { evaluateHand, getPayTable } from '@/lib/games/digit-poker';
import type { DigitPokerState, HandResult, ParsedTick } from '@/types';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  GameLayout,
  GameNotice,
  GameStatusLine,
} from '@/components/games/shared/game-layout';

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
      className={`relative flex h-24 w-16 flex-col items-center justify-center rounded-xl border-2 transition-all ${
        held
          ? 'border-primary bg-primary/10 shadow-[0_0_15px_rgba(0,212,170,0.2)]'
          : 'border-border bg-card hover:border-muted-foreground/30'
      } ${canHold ? 'cursor-pointer' : 'cursor-default'}`}
      animate={isNew ? { rotateY: [90, 0], scale: [0.8, 1] } : {}}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      {revealed && digit !== null ? (
        <>
          <span className="font-mono-game text-2xl font-bold">{digit}</span>
          {held ? (
            <motion.span
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute -top-3 left-1/2 -translate-x-1/2 rounded bg-primary px-1.5 py-0.5 text-[9px] font-bold text-primary-foreground"
            >
              HOLD
            </motion.span>
          ) : null}
        </>
      ) : (
        <span className="text-xl text-muted-foreground">?</span>
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

  return (
    <GameLayout
      ticks={ticks}
      highlightedTicks={highlightedTicks}
      lastConsumedTick={lastConsumedTick}
      extractionKey={extractionKey}
      marketSummary="Five consecutive live ticks seed the hand. Replacements only consume the unheld positions."
      statusLine={
        <GameStatusLine>
          {gameState === 'idle'
            ? 'Deal the opening hand.'
            : gameState === 'dealt'
              ? `Hold ${held.filter(Boolean).length} cards, then draw the rest.`
              : gameState === 'drawing'
                ? 'Receiving live ticks and populating the hand...'
              : result
                ? `${result.label} settled${result.multiplier > 0 ? ` for ${lastWin?.toFixed(0)} credits.` : '.'}`
                : 'Round settled.'}
        </GameStatusLine>
      }
      playArea={
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-5">
            {hand.map((digit, idx) => (
              <div key={idx} className="flex justify-center">
                <PokerCard
                  digit={digit}
                  held={held[idx]}
                  revealed={gameState !== 'idle'}
                  onToggleHold={() => toggleHold(idx)}
                  canHold={gameState === 'dealt'}
                  isNew={isNewCards[idx]}
                />
              </div>
            ))}
          </div>

          <div className="text-center text-sm text-muted-foreground">
            {gameState === 'dealt' ? (
              <>
                Current hand:{' '}
                <span className="font-medium text-foreground">
                  {currentHandResult?.label ?? 'No hand'}
                </span>
                {currentHandResult && currentHandResult.multiplier > 0 ? (
                  <span className="ml-1 text-primary">({currentHandResult.multiplier}x)</span>
                ) : null}
              </>
            ) : gameState === 'drawing' ? (
              'New cards appear one tick at a time as the feed arrives.'
            ) : (
              'Tap any dealt card to hold it before drawing replacements.'
            )}
          </div>

          <AnimatePresence>
            {result ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <GameNotice tone={result.multiplier > 0 ? 'success' : 'default'}>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-display text-lg font-semibold">{result.label}</p>
                      <p className="mt-1 text-xs opacity-80">
                        {result.multiplier > 0
                          ? `Settled for ${lastWin?.toFixed(0)} credits at ${result.multiplier}x.`
                          : 'Full House or better is required to return a payout.'}
                      </p>
                    </div>
                    <div className="font-mono-game text-lg font-semibold">
                      {result.multiplier > 0 ? `+${lastWin?.toFixed(0)}` : '0'}
                    </div>
                  </div>
                </GameNotice>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {error ? <GameNotice tone="danger">{error}</GameNotice> : null}
        </div>
      }
      controls={
        <div className="space-y-4">
          <div>
            <div className="mb-2 flex justify-between text-sm">
              <span className="text-muted-foreground">Stake</span>
              <span className="font-mono-game text-primary">{stake}</span>
            </div>
            <Slider
              value={[stake]}
              onValueChange={(v) => setStake(Array.isArray(v) ? v[0] : v)}
              min={10}
              max={maxStake}
              step={10}
              disabled={gameState !== 'idle'}
            />
          </div>

          {gameState === 'idle' ? (
            <Button
              onClick={deal}
              className="h-12 w-full text-base font-semibold"
              disabled={stake > balance || balance <= 0 || isDealing}
            >
              {isDealing ? 'Dealing...' : 'Deal hand'}
            </Button>
          ) : null}

          {gameState === 'dealt' ? (
            <div className="space-y-3">
              <div className="rounded-2xl border border-white/8 bg-white/4 px-3 py-3 text-xs text-muted-foreground">
                Held cards: <span className="font-mono-game text-foreground">{held.filter(Boolean).length}/5</span>
              </div>
              <Button
                onClick={draw}
                className="h-12 w-full text-base font-semibold"
                disabled={isDealing}
              >
                {isDealing ? 'Drawing...' : held.every((h) => h) ? 'Stand pat' : 'Draw cards'}
              </Button>
            </div>
          ) : null}

          {gameState === 'drawing' ? (
            <Button className="h-12 w-full text-base font-semibold" disabled>
              Receiving ticks...
            </Button>
          ) : null}

          {gameState === 'evaluated' ? (
            <Button
              onClick={reset}
              variant="outline"
              className="h-12 w-full text-sm font-semibold"
            >
              Deal again
            </Button>
          ) : null}
        </div>
      }
      tabs={[
        {
          id: 'payouts',
          label: 'Payouts',
          content: (
            <div className="space-y-2">
              {payTable.map((row) => (
                <div
                  key={row.rank}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs ${
                    result?.rank === row.rank
                      ? 'border-primary/20 bg-primary/10 text-primary'
                      : currentHandResult?.rank === row.rank && gameState === 'dealt'
                        ? 'border-white/10 bg-white/6 text-foreground'
                        : 'border-white/8 bg-white/4 text-muted-foreground'
                  }`}
                >
                  <span>{row.label}</span>
                  <span className="font-mono-game">
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
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>Deal five digits from consecutive live ticks.</p>
              <p>Hold the positions you want to keep, then redraw the rest once.</p>
              <p>Full House or better qualifies for a payout.</p>
            </div>
          ),
        },
        {
          id: 'stats',
          label: 'Stats',
          content: (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-white/8 bg-white/4 px-3 py-3 text-xs text-muted-foreground">
                Phase
                <div className="mt-1 font-mono-game text-sm text-foreground">
                  {gameState === 'idle' ? 'Setup' : gameState === 'dealt' ? 'Hold / Draw' : 'Settled'}
                </div>
              </div>
              <div className="rounded-xl border border-white/8 bg-white/4 px-3 py-3 text-xs text-muted-foreground">
                Held
                <div className="mt-1 font-mono-game text-sm text-foreground">{held.filter(Boolean).length}/5</div>
              </div>
              <div className="rounded-xl border border-white/8 bg-white/4 px-3 py-3 text-xs text-muted-foreground">
                Current value
                <div className="mt-1 font-mono-game text-sm text-foreground">
                  {currentHandResult ? `${(stake * currentHandResult.multiplier).toFixed(0)}` : '0'}
                </div>
              </div>
            </div>
          ),
        },
      ]}
    />
  );
}
