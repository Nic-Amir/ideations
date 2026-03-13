'use client';

import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettingsStore } from '@/stores/settings-store';
import { useBalanceStore } from '@/stores/balance-store';
import { useTickStream, useNextTick } from '@/hooks/use-tick-stream';
import {
  getActualMultiplier,
  getKnockoutProbability,
  isKnockout,
  getPayoutTable,
} from '@/lib/games/digit-collect';
import type { DigitCollectState, ParsedTick } from '@/types';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  GameLayout,
  GameNotice,
  GameStatusLine,
} from '@/components/games/shared/game-layout';

interface DrawnDigit {
  digit: number;
  tick: ParsedTick;
  isKnockout: boolean;
}

export function DigitCollectGame() {
  const { selectedIndex } = useSettingsStore();
  const { balance, placeBet, addWinnings } = useBalanceStore();
  const { ticks } = useTickStream(selectedIndex);
  const getNextTick = useNextTick(selectedIndex);

  const [gameState, setGameState] = useState<DigitCollectState>('idle');
  const [stake, setStake] = useState(100);
  const [collected, setCollected] = useState<Set<number>>(new Set());
  const [history, setHistory] = useState<DrawnDigit[]>([]);
  const [currentMultiplier, setCurrentMultiplier] = useState(1);
  const [drawNumber, setDrawNumber] = useState(0);
  const [lastResult, setLastResult] = useState<{ won: boolean; amount: number } | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightedTicks, setHighlightedTicks] = useState<ParsedTick[]>([]);
  const [lastConsumedTick, setLastConsumedTick] = useState<ParsedTick | null>(null);
  const [extractionKey, setExtractionKey] = useState(0);
  const gameActive = useRef(false);

  const payoutTable = getPayoutTable();

  const startGame = useCallback(() => {
    if (!placeBet(stake)) return;
    setGameState('collecting');
    setCollected(new Set());
    setHistory([]);
    setCurrentMultiplier(1);
    setDrawNumber(0);
    setLastResult(null);
    setError(null);
    setHighlightedTicks([]);
    gameActive.current = true;
  }, [stake, placeBet]);

  const drawNext = useCallback(async () => {
    if (!gameActive.current || isDrawing) return;
    setIsDrawing(true);
    setError(null);

    try {
      const tick = await getNextTick();
      const digit = tick.lastDigit;
      const newDrawNumber = drawNumber + 1;
      const knockout = isKnockout(digit, collected);

      setLastConsumedTick(tick);
      setExtractionKey((k) => k + 1);
      setHighlightedTicks((prev) => [...prev, tick]);

      const entry: DrawnDigit = { digit, tick, isKnockout: knockout };
      setHistory((prev) => [...prev, entry]);

      if (knockout) {
        gameActive.current = false;
        setGameState('knocked_out');
        setLastResult({ won: false, amount: stake });
      } else {
        const newCollected = new Set(collected);
        newCollected.add(digit);
        setCollected(newCollected);
        setDrawNumber(newDrawNumber);
        const mult = getActualMultiplier(newDrawNumber);
        setCurrentMultiplier(mult);

        if (newCollected.size === 10) {
          gameActive.current = false;
          const winAmount = stake * mult;
          addWinnings(winAmount);
          setGameState('cashed_out');
          setLastResult({ won: true, amount: winAmount });
        }
      }
    } catch {
      setError('Connection issue — check your stream and try again.');
    } finally {
      setIsDrawing(false);
    }
  }, [getNextTick, drawNumber, collected, stake, addWinnings, isDrawing]);

  const cashOut = useCallback(() => {
    if (!gameActive.current) return;
    gameActive.current = false;
    const winAmount = stake * currentMultiplier;
    addWinnings(winAmount);
    setGameState('cashed_out');
    setLastResult({ won: true, amount: winAmount });
  }, [stake, currentMultiplier, addWinnings]);

  const reset = useCallback(() => {
    setGameState('idle');
    setCollected(new Set());
    setHistory([]);
    setCurrentMultiplier(1);
    setDrawNumber(0);
    setLastResult(null);
    setError(null);
    setHighlightedTicks([]);
    setLastConsumedTick(null);
    gameActive.current = false;
  }, []);

  const nextKnockoutProb = getKnockoutProbability(drawNumber + 1);
  const potentialWin = stake * currentMultiplier;
  const maxStake = Math.max(10, Math.min(balance, 5000));

  return (
    <GameLayout
      ticks={ticks}
      highlightedTicks={highlightedTicks}
      lastConsumedTick={lastConsumedTick}
      extractionKey={extractionKey}
      marketSummary="Each draw consumes the next live tick. Duplicate digits end the run immediately."
      statusLine={
        <GameStatusLine>
          {gameState === 'idle'
            ? 'Set your stake and start a fresh run.'
            : gameState === 'collecting'
              ? `Collected ${collected.size}/10 digits. Next duplicate risk is ${(nextKnockoutProb * 100).toFixed(0)}%.`
              : gameState === 'cashed_out'
                ? `Run closed for ${lastResult?.amount.toFixed(0) ?? potentialWin.toFixed(0)} credits.`
                : 'The round ended on a duplicate digit.'}
        </GameStatusLine>
      }
      playArea={
        <div className="space-y-5">
          <div className="text-center">
            <div className="section-label">Current multiplier</div>
            <motion.div
              key={currentMultiplier}
              initial={{ scale: 1.04, opacity: 0.2 }}
              animate={{ scale: 1, opacity: 1 }}
              className="mt-2 font-mono-game text-6xl font-bold text-primary text-glow-green"
            >
              {currentMultiplier.toFixed(2)}x
            </motion.div>
            <p className="mt-2 text-sm text-muted-foreground">
              {collected.size}/10 collected • next duplicate risk {(nextKnockoutProb * 100).toFixed(0)}%
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-5">
            {Array.from({ length: 10 }, (_, i) => {
              const isCollected = collected.has(i);
              const lastDrawn = history.length > 0 && history[history.length - 1].digit === i;
              const wasKnockout = lastDrawn && history[history.length - 1].isKnockout;

              return (
                <motion.div
                  key={i}
                  className={`flex h-20 items-center justify-center rounded-2xl border text-2xl font-mono-game font-bold transition-all ${
                    wasKnockout
                      ? 'border-destructive/40 bg-destructive/12 text-destructive'
                      : isCollected
                        ? 'border-primary/30 bg-primary/10 text-primary'
                        : 'border-white/8 bg-white/4 text-muted-foreground'
                  }`}
                  animate={
                    wasKnockout
                      ? { x: [0, -6, 6, -6, 6, 0] }
                      : lastDrawn && isCollected
                        ? { scale: [1, 1.08, 1] }
                        : {}
                  }
                  transition={{ duration: 0.35 }}
                >
                  {i}
                </motion.div>
              );
            })}
          </div>

          {error ? <GameNotice tone="danger">{error}</GameNotice> : null}

          <AnimatePresence>
            {lastResult ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <GameNotice tone={lastResult.won ? 'success' : 'danger'}>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-medium">
                        {lastResult.won ? 'Position closed successfully' : 'Duplicate digit hit'}
                      </p>
                      <p className="mt-1 text-xs opacity-80">
                        {lastResult.won
                          ? `Collected ${lastResult.amount.toFixed(0)} credits from the run.`
                          : 'The round ended before cash-out.'}
                      </p>
                    </div>
                    <div className="font-mono-game text-lg font-semibold">
                      {lastResult.won ? `+${lastResult.amount.toFixed(0)}` : `-${stake.toFixed(0)}`}
                    </div>
                  </div>
                </GameNotice>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      }
      controls={
        <div className="space-y-4">
          <div className="space-y-3">
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
                onClick={startGame}
                className="h-12 w-full text-base font-semibold"
                disabled={stake > balance || balance <= 0}
              >
                Start round
              </Button>
            ) : null}

            {gameState === 'collecting' ? (
              <div className="grid grid-cols-2 gap-3">
                <Button
                  onClick={drawNext}
                  className="h-12 text-sm font-semibold"
                  disabled={isDrawing}
                >
                  {isDrawing ? 'Waiting...' : 'Draw next'}
                </Button>
                <Button
                  onClick={cashOut}
                  variant="secondary"
                  className="h-12 text-sm font-semibold"
                  disabled={drawNumber === 0 || isDrawing}
                >
                  Cash out
                </Button>
              </div>
            ) : null}

            {gameState === 'collecting' ? (
              <div className="rounded-2xl border border-white/8 bg-white/4 px-3 py-3 text-xs text-muted-foreground">
                Cash out value: <span className="font-mono-game text-foreground">{potentialWin.toFixed(0)}</span>
              </div>
            ) : null}

            {(gameState === 'cashed_out' || gameState === 'knocked_out') ? (
              <Button
                onClick={reset}
                variant="outline"
                className="h-12 w-full text-sm font-semibold"
              >
                Play again
              </Button>
            ) : null}
          </div>
        </div>
      }
      tabs={[
        {
          id: 'payouts',
          label: 'Payouts',
          content: (
            <div className="space-y-2">
              <div className="grid grid-cols-4 gap-2 px-1 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                <span>Draw</span>
                <span>Alive</span>
                <span>Risk</span>
                <span className="text-right">Payout</span>
              </div>
              {payoutTable.map((row) => (
                <div
                  key={row.draw}
                  className={`grid grid-cols-4 gap-2 rounded-xl px-3 py-2 text-xs ${
                    row.draw === drawNumber + 1
                      ? 'border border-primary/20 bg-primary/10 text-primary'
                      : 'border border-white/8 bg-white/4 text-muted-foreground'
                  }`}
                >
                  <span>#{row.draw}</span>
                  <span className="font-mono-game">{(row.survivalProb * 100).toFixed(0)}%</span>
                  <span className="font-mono-game">{(row.knockoutProb * 100).toFixed(0)}%</span>
                  <span className="text-right font-mono-game">{row.actualMultiplier.toFixed(2)}x</span>
                </div>
              ))}
            </div>
          ),
        },
        {
          id: 'history',
          label: 'History',
          content: history.length ? (
            <div className="space-y-2">
              {history.map((entry, idx) => (
                <div
                  key={`${entry.tick.epoch}-${idx}`}
                  className="flex items-center justify-between rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-xs text-muted-foreground"
                >
                  <span>Draw {idx + 1}</span>
                  <span className="font-mono-game text-foreground">{entry.tick.numericQuote.toFixed(2)}</span>
                  <span className={entry.isKnockout ? 'text-destructive' : 'text-primary'}>
                    Digit {entry.digit}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No draws yet.</div>
          ),
        },
        {
          id: 'rules',
          label: 'Rules',
          content: (
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>Each draw consumes the next live tick and extracts its last digit.</p>
              <p>Only unique digits grow your multiplier. A duplicate ends the round instantly.</p>
              <p>You can cash out at any point before the next draw resolves.</p>
            </div>
          ),
        },
      ]}
    />
  );
}
