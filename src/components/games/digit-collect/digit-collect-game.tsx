'use client';

import { useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Button, Spinner } from '@trading-game/design-intelligence-layer';
import { useSettingsStore } from '@/stores/settings-store';
import { useBalanceStore } from '@/stores/balance-store';
import { useTickStream, useNextTick } from '@/hooks/use-tick-stream';
import { useIsLandscape } from '@/hooks/use-landscape';
import {
  getActualMultiplier,
  getKnockoutProbability,
  isKnockout,
  getPayoutTable,
} from '@/lib/games/digit-collect';
import type { DigitCollectState, ParsedTick } from '@/types';
import { GameShell } from '@/components/games/shared/game-shell';
import { GameViewport, GameNotice } from '@/components/games/shared/game-layout';
import { MiniMarketStrip } from '@/components/games/shared/mini-market-strip';
import { StakeDock } from '@/components/games/shared/stake-dock';
import { ResultOverlay } from '@/components/games/shared/result-overlay';
import type { GameInfoSection } from '@/components/games/shared/game-info-drawer';

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
  const isLandscape = useIsLandscape();

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
  const nextKnockoutProb = getKnockoutProbability(drawNumber + 1);
  const potentialWin = stake * currentMultiplier;
  const maxStake = Math.max(10, Math.min(balance, 5000));
  const showResultOverlay =
    lastResult !== null &&
    (gameState === 'cashed_out' || gameState === 'knocked_out');

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

  const infoSections: GameInfoSection[] = [
    {
      id: 'payouts',
      label: 'Payouts',
      content: (
        <div className="space-y-2">
          <div className="grid grid-cols-4 gap-2 text-xs font-medium uppercase tracking-wide text-on-subtle">
            <span>Draw</span>
            <span>Alive</span>
            <span>Risk</span>
            <span className="text-right">Payout</span>
          </div>
          {payoutTable.map((row) => (
            <div
              key={row.draw}
              className={`grid grid-cols-4 gap-2 rounded-lg px-3 py-2 text-xs ${
                row.draw === drawNumber + 1
                  ? 'border border-semantic-win/20 bg-semantic-win/10 text-semantic-win'
                  : 'bg-subtle text-on-subtle'
              }`}
            >
              <span>#{row.draw}</span>
              <span className="font-display tabular-nums">{(row.survivalProb * 100).toFixed(0)}%</span>
              <span className="font-display tabular-nums">{(row.knockoutProb * 100).toFixed(0)}%</span>
              <span className="text-right font-display tabular-nums">{row.actualMultiplier.toFixed(2)}x</span>
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
              className="flex items-center justify-between rounded-lg bg-subtle px-3 py-2 text-xs text-on-subtle"
            >
              <span>Draw {idx + 1}</span>
              <span className="font-display tabular-nums text-on-prominent">
                {entry.tick.numericQuote.toFixed(entry.tick.pip_size ?? 2)}
              </span>
              <span className={entry.isKnockout ? 'text-semantic-loss' : 'text-semantic-win'}>
                Digit {entry.digit}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-on-subtle">No draws yet.</p>
      ),
    },
    {
      id: 'rules',
      label: 'Rules',
      content: (
        <div className="space-y-2 text-sm text-on-subtle">
          <p>Each draw consumes the next live tick and extracts its last digit.</p>
          <p>Only unique digits grow your multiplier. A duplicate ends the round instantly.</p>
          <p>You can cash out at any point before the next draw resolves.</p>
        </div>
      ),
    },
  ];

  const marketReady = ticks.length > 0 || lastConsumedTick !== null;

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
          <div className="flex flex-col flex-1 min-h-0 px-4 py-3">
            <div className="shrink-0 rounded-xl border border-border-subtle bg-subtle px-4 py-3">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="body-xs text-on-subtle uppercase">Multiplier</p>
                  <motion.p
                    key={currentMultiplier}
                    initial={{ scale: 1.04, opacity: 0.5 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className={`font-display font-bold text-semantic-win tabular-nums ${
                      isLandscape ? 'text-3xl' : 'text-4xl'
                    }`}
                  >
                    {currentMultiplier.toFixed(2)}x
                  </motion.p>
                </div>
                <div className="pb-1 text-right">
                  <p className="text-xs font-semibold text-on-prominent tabular-nums">{collected.size} of 10 collected</p>
                  <p className="mt-0.5 text-[10px] text-on-subtle tabular-nums">Next draw risk {(nextKnockoutProb * 100).toFixed(0)}%</p>
                </div>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border-subtle">
                <div
                  className="h-full rounded-full bg-semantic-win transition-[width] duration-300"
                  style={{ width: `${collected.size * 10}%` }}
                />
              </div>
            </div>

            <div
              className="flex-1 min-h-0 grid grid-cols-5 content-center mx-auto w-full max-w-[360px]"
              style={{ gap: 'clamp(4px, 2vw, 10px)' }}
            >
              {Array.from({ length: 10 }, (_, i) => {
                const isCollected = collected.has(i);
                const lastDrawn = history.length > 0 && history[history.length - 1].digit === i;
                const wasKnockout = lastDrawn && history[history.length - 1].isKnockout;

                return (
                  <motion.div
                    key={i}
                    whileTap={{ scale: 0.97 }}
                    className={`relative flex aspect-square items-center justify-center rounded-xl border text-xl sm:text-2xl font-display font-bold tabular-nums ${
                      wasKnockout
                        ? 'border-semantic-loss/40 bg-semantic-loss/10 text-semantic-loss'
                        : isCollected
                          ? 'border-semantic-win/20 bg-semantic-win/10 text-semantic-win'
                          : 'border-border-subtle bg-subtle text-on-subtle'
                    }`}
                    animate={
                      wasKnockout
                        ? { x: [0, -4, 4, -4, 4, 0] }
                        : lastDrawn && isCollected
                          ? { scale: [1, 1.06, 1] }
                          : {}
                    }
                  >
                    {i}
                    {isCollected ? (
                      <span className="absolute bottom-1.5 h-1 w-1 rounded-full bg-current" aria-hidden />
                    ) : null}
                  </motion.div>
                );
              })}
            </div>

            {error ? (
              <div className="shrink-0 mt-2">
                <GameNotice tone="danger">{error}</GameNotice>
              </div>
            ) : null}
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
              gameState === 'collecting' ? (
                <>
                  Cash out:{' '}
                  <span className="font-display font-semibold text-semantic-win tabular-nums">
                    {potentialWin.toFixed(0)}
                  </span>{' '}
                  credits
                </>
              ) : undefined
            }
            actions={
              <>
                {gameState === 'idle' ? (
                  <Button
                    variant="primary"
                    className="w-full min-h-[44px]"
                    disabled={stake > balance || balance <= 0}
                    onClick={startGame}
                  >
                    Start round
                  </Button>
                ) : null}
                {gameState === 'collecting' ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="primary"
                      className="min-h-[44px]"
                      disabled={isDrawing}
                      aria-busy={isDrawing}
                      onClick={drawNext}
                    >
                      {isDrawing ? 'Waiting…' : 'Draw next'}
                    </Button>
                    <Button
                      variant="secondary"
                      className="min-h-[44px]"
                      disabled={drawNumber === 0 || isDrawing}
                      onClick={cashOut}
                    >
                      Cash out
                    </Button>
                  </div>
                ) : null}
              </>
            }
          />
        }
      />

      <ResultOverlay
        open={showResultOverlay}
        won={lastResult?.won ?? false}
        title={lastResult?.won ? 'Run closed' : 'Duplicate digit'}
        subtitle={
          lastResult?.won
            ? 'You collected your multiplier payout.'
            : 'The round ended before cash-out.'
        }
        amount={lastResult?.won ? lastResult.amount : stake}
        amountLabel="credits"
        onDismiss={reset}
        primaryAction={{ label: 'Play again', onClick: reset }}
      />
    </GameShell>
  );
}
