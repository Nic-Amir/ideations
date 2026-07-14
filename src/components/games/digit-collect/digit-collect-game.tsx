'use client';

import { useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Button, Spinner } from '@trading-game/design-intelligence-layer';
import { Check, Minus, Plus, ShieldCheck, X } from 'lucide-react';
import { cn } from '@/lib/utils';
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

function formatCredits(value: number): string {
  return Math.round(value).toLocaleString();
}

function PositionPanel({
  gameState,
  multiplier,
  cashOutValue,
  netPL,
  collectedCount,
  nextRisk,
}: {
  gameState: DigitCollectState;
  multiplier: number;
  cashOutValue: number;
  netPL: number;
  collectedCount: number;
  nextRisk: number;
}) {
  const idle = gameState === 'idle';
  const live = gameState === 'collecting';
  const netTone = idle
    ? 'text-on-subtle'
    : netPL > 0
      ? 'text-semantic-win'
      : netPL < 0
        ? 'text-semantic-loss'
        : 'text-on-prominent';
  const multiplierTone = idle
    ? 'text-on-prominent'
    : multiplier >= 1
      ? 'text-semantic-win'
      : 'text-semantic-loss';
  const safeDigits = 10 - collectedCount;

  return (
    <section
      aria-label="Round position"
      className="rounded-xl border border-border-subtle bg-subtle/70 p-3 shadow-sm [@media(max-height:520px)]:p-2.5"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-on-subtle">
            Position
          </p>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide',
              live
                ? 'bg-semantic-win/10 text-semantic-win'
                : 'bg-prominent text-on-subtle',
            )}
          >
            {live ? 'Live' : idle ? 'Ready' : 'Closed'}
          </span>
        </div>
        <p className="text-[10px] font-medium tabular-nums text-on-subtle">
          {collectedCount}/10 synced
        </p>
      </div>

      <div className="mt-2 grid grid-cols-[1.15fr_1fr_1fr] gap-2">
        <div>
          <p className="text-[9px] uppercase tracking-wide text-on-subtle">Multiplier</p>
          <motion.p
            key={multiplier}
            initial={{ scale: 1.03, opacity: 0.6 }}
            animate={{ scale: 1, opacity: 1 }}
            className={cn(
              'font-display text-3xl font-bold leading-none tabular-nums [@media(max-height:520px)]:text-2xl',
              multiplierTone,
            )}
          >
            {multiplier.toFixed(2)}×
          </motion.p>
        </div>
        <div className="border-l border-border-subtle pl-2">
          <p className="text-[9px] uppercase tracking-wide text-on-subtle">Cash out</p>
          <p className="mt-1 font-display text-base font-bold tabular-nums text-on-prominent">
            {idle ? '—' : formatCredits(cashOutValue)}
          </p>
          <p className="text-[9px] text-on-subtle">credits</p>
        </div>
        <div className="border-l border-border-subtle pl-2">
          <p className="text-[9px] uppercase tracking-wide text-on-subtle">Net P/L</p>
          <p className={cn('mt-1 font-display text-base font-bold tabular-nums', netTone)}>
            {idle ? '—' : `${netPL > 0 ? '+' : netPL < 0 ? '−' : ''}${formatCredits(Math.abs(netPL))}`}
          </p>
          <p className="text-[9px] text-on-subtle">credits</p>
        </div>
      </div>

      <div className="mt-3 border-t border-border-subtle pt-2">
        <div className="flex items-center justify-between gap-3 text-[10px] font-semibold tabular-nums">
          <span className="flex items-center gap-1.5 text-on-prominent">
            <ShieldCheck className="h-3.5 w-3.5 text-semantic-win" />
            {safeDigits} safe
          </span>
          <span className={collectedCount > 0 ? 'text-semantic-loss' : 'text-on-subtle'}>
            {collectedCount} repeat{collectedCount === 1 ? '' : 's'} · {(nextRisk * 100).toFixed(0)}% risk
          </span>
        </div>
        <div
          className="mt-1.5 grid grid-cols-10 gap-1"
          role="img"
          aria-label={`${safeDigits} safe digit${safeDigits === 1 ? '' : 's'} and ${collectedCount} knockout digit${collectedCount === 1 ? '' : 's'} on the next draw`}
        >
          {Array.from({ length: 10 }, (_, index) => (
            <span
              key={index}
              className={cn(
                'h-1.5 rounded-full',
                index < collectedCount ? 'bg-semantic-loss' : 'bg-semantic-win/55',
              )}
              aria-hidden
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function DigitBoard({ collected, history }: { collected: Set<number>; history: DrawnDigit[] }) {
  const latest = history.at(-1);

  return (
    <section aria-labelledby="digit-board-title" className="w-full">
      <div className="mb-2 flex items-center justify-between">
        <h2 id="digit-board-title" className="text-[10px] font-semibold uppercase tracking-wide text-on-subtle">
          Digit board
        </h2>
        <p className="text-[10px] text-on-subtle">Unique digits stay safe</p>
      </div>
      <div
        role="list"
        aria-label="Digit collection board"
        className="grid grid-cols-5 gap-2 [@media(max-height:520px)]:gap-1.5"
      >
        {Array.from({ length: 10 }, (_, digit) => {
          const firstDrawIndex = history.findIndex(
            (entry) => entry.digit === digit && !entry.isKnockout,
          );
          const isCollected = collected.has(digit);
          const isLatest = latest?.digit === digit;
          const isKnockout = Boolean(isLatest && latest?.isKnockout);
          const order = firstDrawIndex >= 0 ? firstDrawIndex + 1 : null;
          const stateLabel = isKnockout
            ? `Digit ${digit}, repeated on draw ${history.length}, knockout`
            : isCollected
              ? `Digit ${digit}, collected on draw ${order}${isLatest ? ', latest draw' : ''}`
              : `Digit ${digit}, available`;

          return (
            <motion.div
              key={digit}
              role="listitem"
              aria-label={stateLabel}
              animate={
                isKnockout
                  ? { x: [0, -3, 3, -3, 3, 0] }
                  : isLatest
                    ? { scale: [1, 1.04, 1] }
                    : undefined
              }
              className={cn(
                'relative flex min-h-[62px] flex-col items-center justify-center rounded-xl border font-display tabular-nums [@media(max-height:520px)]:min-h-[48px]',
                isKnockout
                  ? 'border-semantic-loss/40 bg-semantic-loss/10 text-semantic-loss'
                  : isCollected
                    ? 'border-semantic-win/30 bg-semantic-win/10 text-semantic-win'
                    : 'border-border-subtle bg-subtle text-on-subtle',
                isLatest && 'ring-2 ring-border-prominent ring-offset-1 ring-offset-prominent',
              )}
            >
              {order ? (
                <span className="absolute right-1.5 top-1 rounded-full bg-prominent px-1.5 py-0.5 text-[8px] font-bold text-on-prominent">
                  #{order}
                </span>
              ) : null}
              <span className="text-xl font-bold leading-none sm:text-2xl">{digit}</span>
              <span className="mt-1 flex items-center gap-0.5 text-[8px] font-semibold uppercase tracking-wide">
                {isKnockout ? (
                  <><X className="h-2.5 w-2.5" /> Repeat</>
                ) : isCollected ? (
                  <><Check className="h-2.5 w-2.5" /> Synced</>
                ) : (
                  'Open'
                )}
              </span>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

function DrawTrail({ history }: { history: DrawnDigit[] }) {
  return (
    <section aria-label="Draw trail" className="min-w-0">
      <div className="mb-1.5 flex items-center justify-between [@media(max-height:520px)]:hidden">
        <h2 id="draw-trail-title" className="text-[10px] font-semibold uppercase tracking-wide text-on-subtle">
          Draw trail
        </h2>
        <span className="text-[10px] tabular-nums text-on-subtle">{history.length}/10</span>
      </div>
      {history.length > 0 ? (
        <div className="scrollbar-hide flex gap-1.5 overflow-x-auto pb-1" role="list" aria-label="Draw sequence">
          {history.map((entry, index) => (
            <span
              key={`${entry.tick.epoch}-${index}`}
              role="listitem"
              aria-label={`Draw ${index + 1}, digit ${entry.digit}${entry.isKnockout ? ', repeated and knocked out' : ''}`}
              className={cn(
                'flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-lg border px-2 text-[10px] font-semibold tabular-nums [@media(max-height:520px)]:min-h-[32px]',
                entry.isKnockout
                  ? 'border-semantic-loss/40 bg-semantic-loss/10 text-semantic-loss'
                  : index === history.length - 1
                    ? 'border-border-prominent bg-prominent text-on-prominent'
                    : 'border-border-subtle bg-subtle text-on-subtle',
              )}
            >
              <span className="text-[9px] opacity-75">#{index + 1}</span>
              <span className="font-display text-sm font-bold">{entry.digit}</span>
              {entry.isKnockout ? <X className="h-3 w-3" /> : null}
            </span>
          ))}
        </div>
      ) : (
        <div className="flex min-h-[40px] items-center rounded-lg border border-border-subtle bg-subtle/50 px-3 text-[10px] text-on-subtle [@media(max-height:520px)]:min-h-[32px]">
          Draw from the live market. Unique digits build the return; a repeat ends the run.
        </div>
      )}
    </section>
  );
}

function SyncResultDetails({
  history,
  collectedCount,
  returnAmount,
  netPL,
}: {
  history: DrawnDigit[];
  collectedCount: number;
  returnAmount: number;
  netPL: number;
}) {
  const knockout = history.at(-1)?.isKnockout ? history.at(-1) : null;

  return (
    <div className="space-y-3 text-left">
      <div className="grid grid-cols-2 gap-2 rounded-lg bg-subtle p-2.5 text-center">
        <div>
          <p className="text-[9px] uppercase tracking-wide text-on-subtle">Returned</p>
          <p className="font-display text-sm font-bold tabular-nums text-on-prominent">
            {formatCredits(returnAmount)}
          </p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-wide text-on-subtle">Unique digits</p>
          <p className="font-display text-sm font-bold tabular-nums text-on-prominent">
            {collectedCount}/10
          </p>
        </div>
      </div>
      {knockout ? (
        <p className="rounded-lg bg-semantic-loss/10 px-3 py-2 text-xs text-semantic-loss">
          Digit <span className="font-display font-bold">{knockout.digit}</span> repeated on draw {history.length}.
        </p>
      ) : null}
      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-on-subtle">
          Final sequence
        </p>
        <div className="scrollbar-hide flex gap-1.5 overflow-x-auto pb-1">
          {history.map((entry, index) => (
            <span
              key={`${entry.tick.epoch}-${index}`}
              className={cn(
                'flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg border font-display text-xs font-bold tabular-nums',
                entry.isKnockout
                  ? 'border-semantic-loss/40 bg-semantic-loss/10 text-semantic-loss'
                  : 'border-border-subtle bg-subtle text-on-prominent',
              )}
            >
              {entry.digit}
            </span>
          ))}
        </div>
      </div>
      <p className="sr-only">Net profit or loss: {netPL} credits.</p>
    </div>
  );
}

function SyncDock({
  isLandscape,
  gameState,
  stake,
  maxStake,
  balance,
  isDrawing,
  drawNumber,
  nextRisk,
  cashOutValue,
  netPL,
  onStakeChange,
  onStart,
  onDraw,
  onCashOut,
}: {
  isLandscape: boolean;
  gameState: DigitCollectState;
  stake: number;
  maxStake: number;
  balance: number;
  isDrawing: boolean;
  drawNumber: number;
  nextRisk: number;
  cashOutValue: number;
  netPL: number;
  onStakeChange: (stake: number) => void;
  onStart: () => void;
  onDraw: () => void;
  onCashOut: () => void;
}) {
  const idle = gameState === 'idle';
  const collecting = gameState === 'collecting';
  const effectiveMax = Math.max(10, Math.min(maxStake, balance));
  const startDisabled = stake > balance || balance <= 0;
  const netDescription = netPL > 0
    ? `net profit ${formatCredits(netPL)} credits`
    : netPL < 0
      ? `net loss ${formatCredits(Math.abs(netPL))} credits`
      : 'break even';

  const startButton = (
    <Button
      variant="primary"
      className="min-h-[44px] w-full"
      disabled={startDisabled}
      onClick={onStart}
      aria-label={`Start round with ${formatCredits(stake)} credit stake`}
    >
      <span>Start round</span>
      <span className="ml-1 text-xs opacity-80">· {formatCredits(stake)} credits</span>
    </Button>
  );

  const roundActions = collecting ? (
    <>
      <Button
        variant="primary"
        className="min-h-[44px]"
        disabled={isDrawing}
        aria-busy={isDrawing}
        aria-label={isDrawing ? 'Waiting for the next live tick' : `Draw next with ${(nextRisk * 100).toFixed(0)} percent repeat risk`}
        onClick={onDraw}
      >
        <span className="flex flex-col items-center leading-tight">
          <span>{isDrawing ? 'Waiting for tick…' : 'Draw next'}</span>
          {!isDrawing ? (
            <span className="text-[9px] font-normal opacity-75">
              {(nextRisk * 100).toFixed(0)}% repeat risk
            </span>
          ) : null}
        </span>
      </Button>
      <Button
        variant="secondary"
        className="min-h-[44px]"
        disabled={drawNumber === 0 || isDrawing}
        aria-label={`Cash out ${formatCredits(cashOutValue)} credits, ${netDescription}`}
        onClick={onCashOut}
      >
        <span className="flex flex-col items-center leading-tight">
          <span>Cash out</span>
          <span className="text-[9px] font-normal opacity-75">
            {formatCredits(cashOutValue)} credits
          </span>
        </span>
      </Button>
    </>
  ) : null;

  if (!isLandscape) {
    return (
      <StakeDock
        stake={stake}
        max={maxStake}
        balance={balance}
        onStakeChange={onStakeChange}
        stakeDisabled={!idle}
        showSlider={idle}
        actions={
          idle ? startButton : collecting ? <div className="grid grid-cols-2 gap-2">{roundActions}</div> : undefined
        }
      />
    );
  }

  return (
    <div className="grid min-h-[60px] grid-cols-[44px_minmax(100px,0.7fr)_44px_minmax(220px,1.3fr)] items-center gap-2 px-4 py-2">
      <Button
        variant="primary"
        size="icon"
        aria-label="Decrease stake"
        disabled={!idle || stake <= 10}
        onClick={() => onStakeChange(Math.max(10, stake - 10))}
        className="min-h-[44px] min-w-[44px]"
      >
        <Minus className="h-4 w-4" />
      </Button>
      <div className="min-w-0 text-center">
        <p className="text-[9px] text-on-subtle">{idle ? 'Stake' : 'Locked stake'}</p>
        <p className="truncate font-display text-xl font-bold leading-tight tabular-nums text-on-prominent">
          {formatCredits(stake)} <span className="font-body text-xs font-normal text-on-subtle">Credits</span>
        </p>
      </div>
      <Button
        variant="primary"
        size="icon"
        aria-label="Increase stake"
        disabled={!idle || stake >= effectiveMax}
        onClick={() => onStakeChange(Math.min(effectiveMax, stake + 10))}
        className="min-h-[44px] min-w-[44px]"
      >
        <Plus className="h-4 w-4" />
      </Button>
      {idle ? startButton : collecting ? (
        <div className="grid grid-cols-2 gap-2">{roundActions}</div>
      ) : (
        <div />
      )}
    </div>
  );
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
  const currentNetPL = potentialWin - stake;
  const maxStake = Math.max(10, Math.min(balance, 5000));
  const showResultOverlay =
    lastResult !== null &&
    (gameState === 'cashed_out' || gameState === 'knocked_out');
  const resultReturn = lastResult?.won ? lastResult.amount : 0;
  const resultNetPL = lastResult ? resultReturn - stake : 0;
  const resultTier = resultNetPL > 0 ? 'win' : resultNetPL < 0 ? 'loss' : 'push';

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
          <div className="scrollbar-hide flex min-h-0 flex-1 overflow-y-auto px-4 py-3 [@media(max-height:520px)]:py-2">
            <div className="my-auto grid w-full gap-3 [@media(max-height:520px)]:grid-cols-[minmax(0,0.9fr)_minmax(280px,1.1fr)] [@media(max-height:520px)]:items-center">
              <div className="min-w-0 space-y-3 [@media(max-height:520px)]:space-y-2">
                <PositionPanel
                  gameState={gameState}
                  multiplier={currentMultiplier}
                  cashOutValue={potentialWin}
                  netPL={currentNetPL}
                  collectedCount={collected.size}
                  nextRisk={nextKnockoutProb}
                />
                <DrawTrail history={history} />
                {error ? <GameNotice tone="danger">{error}</GameNotice> : null}
              </div>
              <div className="mx-auto w-full max-w-[360px]">
                <DigitBoard collected={collected} history={history} />
              </div>
            </div>
          </div>
        }
        dock={
          <SyncDock
            isLandscape={isLandscape}
            gameState={gameState}
            stake={stake}
            maxStake={maxStake}
            balance={balance}
            isDrawing={isDrawing}
            drawNumber={drawNumber}
            nextRisk={nextKnockoutProb}
            cashOutValue={potentialWin}
            netPL={currentNetPL}
            onStakeChange={setStake}
            onStart={startGame}
            onDraw={drawNext}
            onCashOut={cashOut}
          />
        }
      />

      <ResultOverlay
        open={showResultOverlay}
        won={resultNetPL > 0}
        tier={resultTier}
        title={lastResult?.won ? 'Position closed' : 'Duplicate digit'}
        subtitle={
          lastResult?.won
            ? `Returned ${formatCredits(resultReturn)} credits from ${collected.size} unique digit${collected.size === 1 ? '' : 's'}.`
            : `The repeat ended the run after ${collected.size} unique digit${collected.size === 1 ? '' : 's'}.`
        }
        amount={lastResult ? Math.abs(resultNetPL) : undefined}
        amountLabel="net"
        onDismiss={reset}
        details={
          lastResult ? (
            <SyncResultDetails
              history={history}
              collectedCount={collected.size}
              returnAmount={resultReturn}
              netPL={resultNetPL}
            />
          ) : undefined
        }
        primaryAction={{ label: 'Play again', onClick: reset }}
      />
    </GameShell>
  );
}
