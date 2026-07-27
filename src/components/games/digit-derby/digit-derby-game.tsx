'use client';

import { Play, X } from 'lucide-react';
import { Button, Spinner } from '@trading-game/design-intelligence-layer';
import { GameShell } from '@/components/games/shared/game-shell';
import { GameViewport, GameNotice } from '@/components/games/shared/game-layout';
import { MiniMarketStrip } from '@/components/games/shared/mini-market-strip';
import { StakeDock } from '@/components/games/shared/stake-dock';
import {
  ResultOverlay,
  getResultTierFromPayout,
} from '@/components/games/shared/result-overlay';
import type { GameInfoSection } from '@/components/games/shared/game-info-drawer';
import { useDigitDerby, type DigitDerbyResult } from '@/hooks/use-digit-derby';
import {
  DigitLeaderboardStrip,
  DigitRaceTrack,
} from '@/components/games/digit-derby/digit-race-track';
import { DigitPickGrid } from '@/components/games/digit-derby/digit-pick-grid';
import { DIGIT_DERBY_CONFIG, DIGIT_SILKS } from '@/lib/games/digit-derby';
import { cn } from '@/lib/utils';

function SportsbookSlip({
  pick,
  multiplier,
  stake,
  canStart,
  onClear,
  onStart,
}: {
  pick: number;
  multiplier: number;
  stake: number;
  canStart: boolean;
  onClear: () => void;
  onStart: () => void;
}) {
  const returnAmount = Math.round(stake * multiplier);
  const netProfit = Math.max(0, returnAmount - stake);

  return (
    <div className="mx-1 mb-1 shrink-0 rounded-xl border border-border-subtle bg-subtle/50 p-3 shadow-sm">
      <div className="mb-2 flex min-h-[32px] items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-on-subtle">
            Bet slip
          </p>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-on-prominent">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: DIGIT_SILKS[pick] }}
            />
            Digit {pick}
            <span className="font-normal text-on-subtle">· Winner</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear selection"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-prominent text-on-subtle transition-colors hover:text-on-prominent"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-lg bg-prominent px-3 py-2 text-center">
        <div>
          <p className="text-[9px] uppercase tracking-wide text-on-subtle">Odds</p>
          <p className="font-display text-sm font-bold tabular-nums text-on-prominent">
            {multiplier.toFixed(2)}×
          </p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-wide text-on-subtle">Return</p>
          <p className="font-display text-sm font-bold tabular-nums text-on-prominent">
            {returnAmount.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-wide text-on-subtle">Profit</p>
          <p className="font-display text-sm font-bold tabular-nums text-semantic-win">
            +{netProfit.toLocaleString()}
          </p>
        </div>
      </div>

      <button
        type="button"
        disabled={!canStart}
        onClick={onStart}
        className={cn(
          'mt-2 flex min-h-[52px] w-full items-center justify-between rounded-xl bg-primary px-4 text-on-prominent-static-inverse',
          !canStart && 'opacity-40',
          canStart && 'active:scale-[0.98]',
        )}
      >
        <span className="flex items-center gap-2 font-display text-base font-bold">
          <Play className="h-5 w-5 fill-current" />
          Start race
        </span>
        <span className="text-right text-xs font-semibold tabular-nums">
          Stake {stake.toLocaleString()}
          <span className="block text-[10px] opacity-80">
            Return {returnAmount.toLocaleString()}
          </span>
        </span>
      </button>
    </div>
  );
}

function LockedPickChip({
  pick,
  rank,
  count,
  finishCount,
  multiplier,
}: {
  pick: number;
  rank: number;
  count: number;
  finishCount: number;
  multiplier: number;
}) {
  return (
    <div className="mx-1 flex shrink-0 items-center gap-3 rounded-xl border border-border-subtle bg-subtle/60 px-3 py-2">
      <span
        className="flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold text-black/80 ring-2 ring-border-prominent"
        style={{ backgroundColor: DIGIT_SILKS[pick] }}
      >
        {pick}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-on-subtle">
          Your pick · locked
        </p>
        <p className="font-display text-sm font-bold tabular-nums text-on-prominent">
          #{rank} · {count}/{finishCount}
          <span className="ml-2 text-on-subtle">{multiplier.toFixed(2)}×</span>
        </p>
      </div>
    </div>
  );
}

function FinishDetails({ result }: { result: DigitDerbyResult }) {
  const topFive = result.finishOrder.slice(0, 5);
  const pickOutside = topFive.includes(result.pick) ? null : result.pick;

  const finishRow = (digit: number, position: number, isPlayerPick: boolean) => (
    <div
      key={`${position}-${digit}`}
      className={cn(
        'grid grid-cols-[24px_12px_1fr_auto] items-center gap-2 rounded-md px-2 py-1.5 text-xs',
        isPlayerPick ? 'bg-primary/10 text-on-prominent' : 'bg-subtle text-on-subtle',
      )}
    >
      <span className="font-display font-bold tabular-nums">{position}</span>
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: DIGIT_SILKS[digit] }}
      />
      <span className="truncate font-medium">Digit {digit}</span>
      {isPlayerPick ? (
        <span className="text-[9px] font-bold uppercase tracking-wide text-primary">
          Your pick
        </span>
      ) : null}
    </div>
  );

  return (
    <div className="max-h-[min(300px,35vh)] space-y-2 overflow-y-auto pr-1 text-left">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-on-subtle">
        Top five finish
      </p>
      <div className="space-y-1">
        {topFive.map((digit, index) =>
          finishRow(digit, index + 1, digit === result.pick),
        )}
      </div>
      {pickOutside !== null ? (
        <div className="border-t border-border-subtle pt-2">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-on-subtle">
            Your pick
          </p>
          {finishRow(pickOutside, result.finishOrder.indexOf(pickOutside) + 1, true)}
        </div>
      ) : null}
    </div>
  );
}

function overlayAmount(result: DigitDerbyResult): number {
  if (result.outcome === 'win') return result.netPL;
  if (result.outcome === 'refund') return result.payout;
  return result.stake;
}

export function DigitDerbyGame() {
  const {
    phase,
    pick,
    stake,
    setStake,
    counts,
    tickCount,
    lockedMultiplier,
    lockedPick,
    multiplier,
    result,
    playError,
    balance,
    maxStake,
    canStart,
    marketReady,
    finishOrder,
    inFinalStretch,
    raceProgress,
    finishCount,
    ticks,
    highlightedTicks,
    lastConsumedTick,
    extractionKey,
    winningDigit,
    selectDigit,
    clearPick,
    startRace,
    dismissResult,
  } = useDigitDerby();

  const displayMultiplier = lockedMultiplier ?? multiplier;
  const displayPick = lockedPick ?? pick;
  const idle = phase === 'idle';
  const racing = phase === 'running' || phase === 'settled';

  const infoSections: GameInfoSection[] = [
    {
      id: 'how',
      label: 'How to play',
      content: (
        <div className="space-y-2 text-sm text-on-subtle">
          <p>Pick a digit from 0 to 9, set your stake, and start the race.</p>
          <p>
            Each live tick advances the digit that matches its last digit. First
            to {finishCount} wins.
          </p>
          <p>You win if the digit you picked finishes first.</p>
        </div>
      ),
    },
    {
      id: 'pricing',
      label: 'Pricing',
      content: (
        <div className="space-y-2 text-sm text-on-subtle">
          <p>
            Under uniform last digits, each runner has a 10% chance to win.
          </p>
          <p>
            Offered odds use a {DIGIT_DERBY_CONFIG.commission * 100}% commission:{' '}
            <span className="font-display tabular-nums text-on-prominent">
              {multiplier.toFixed(2)}×
            </span>{' '}
            for every digit. Multiplier locks when you start.
          </p>
          <p>Timeout or feed failure mid-race refunds your stake.</p>
        </div>
      ),
    },
    {
      id: 'feed',
      label: 'Feed',
      content: (
        <div className="space-y-2 text-sm text-on-subtle">
          <p>
            Settlement prefers live Deriv ticks. If markets are unavailable in
            your region, a labeled demo feed (~1 Hz) keeps the game playable.
          </p>
          <p>Starting a race stays disabled until ticks arrive.</p>
        </div>
      ),
    },
  ];

  const statusLabel =
    phase === 'running'
      ? inFinalStretch
        ? 'Final stretch'
        : 'Live'
      : phase === 'settled'
        ? 'Finish'
        : 'Ready';

  const overlayOpen = phase === 'settled' && result !== null;
  const overlayWon = result?.outcome === 'win' || result?.outcome === 'refund';
  const overlayTier =
    result?.outcome === 'refund'
      ? ('push' as const)
      : result?.outcome === 'win'
        ? getResultTierFromPayout(
            result.stake > 0 ? result.payout / result.stake : 0,
          )
        : ('loss' as const);

  const pickRank =
    displayPick !== null ? finishOrder.indexOf(displayPick) + 1 : 0;

  return (
    <GameShell infoSections={infoSections} showSymbolPicker>
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
            <div className="flex shrink-0 items-center justify-center border-b border-border-subtle py-6">
              <Spinner />
            </div>
          )
        }
        play={
          <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 py-2">
            {racing ? (
              <>
                <div className="shrink-0">
                  <DigitLeaderboardStrip
                    finishOrder={finishOrder}
                    counts={counts}
                    pick={displayPick}
                    statusLabel={statusLabel}
                  />
                  <div className="mt-1 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between text-[10px] font-semibold tabular-nums text-on-subtle">
                        <span>
                          {inFinalStretch && phase === 'running'
                            ? 'Final stretch'
                            : phase === 'settled'
                              ? 'Race complete'
                              : `${tickCount} ticks`}
                        </span>
                        <span>
                          {phase === 'settled'
                            ? 'Photo finish'
                            : `${Math.max(0, finishCount - Math.max(0, ...counts))} to go`}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-border-subtle">
                        <div
                          className={cn(
                            'h-full rounded-full transition-[width] duration-200',
                            inFinalStretch ? 'bg-semantic-warning' : 'bg-primary',
                          )}
                          style={{ width: `${raceProgress}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border-subtle bg-subtle/40">
                  <DigitRaceTrack
                    counts={counts}
                    finishCount={finishCount}
                    finishOrder={finishOrder}
                    lockedPick={lockedPick}
                    lastAdvancedDigit={lastConsumedTick?.lastDigit ?? null}
                    winningDigit={winningDigit}
                    finished={phase === 'settled'}
                    inFinalStretch={inFinalStretch}
                  />
                </div>

                {lockedPick !== null && lockedMultiplier !== null ? (
                  <LockedPickChip
                    pick={lockedPick}
                    rank={pickRank}
                    count={counts[lockedPick] ?? 0}
                    finishCount={finishCount}
                    multiplier={lockedMultiplier}
                  />
                ) : null}
              </>
            ) : (
              <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border-subtle bg-subtle/40 p-3">
                <DigitPickGrid
                  pick={pick}
                  multiplier={multiplier}
                  onSelectDigit={selectDigit}
                  disabled={!idle}
                />
              </div>
            )}

            {idle && pick !== null ? (
              <SportsbookSlip
                pick={pick}
                multiplier={multiplier}
                stake={stake}
                canStart={canStart}
                onClear={clearPick}
                onStart={() => void startRace()}
              />
            ) : null}

            {idle && pick === null ? (
              <p className="text-center text-sm text-on-subtle">
                Pick a digit, then start the race.
              </p>
            ) : null}

            {playError ? <GameNotice tone="danger">{playError}</GameNotice> : null}
            {!marketReady && idle ? (
              <GameNotice tone="warning">
                Market unavailable. Waiting for live ticks.
              </GameNotice>
            ) : null}
          </div>
        }
        dock={
          <StakeDock
            stake={stake}
            max={maxStake}
            balance={balance}
            onStakeChange={setStake}
            stakeDisabled={!idle}
            showSlider={idle}
            footer={
              idle
                ? pick !== null
                  ? canStart
                    ? `Digit ${pick} · ${multiplier.toFixed(2)}×`
                    : 'Waiting for live ticks'
                  : 'Tap a digit above to build your bet'
                : phase === 'running'
                  ? 'Race in progress'
                  : undefined
            }
            actions={
              <>
                {phase === 'running' ? (
                  <Button
                    variant="primary"
                    className="w-full min-h-[44px]"
                    disabled
                    aria-busy
                  >
                    Racing…
                  </Button>
                ) : null}
                {phase === 'settled' ? (
                  <Button
                    variant="primary"
                    className="w-full min-h-[44px]"
                    onClick={dismissResult}
                  >
                    Race again
                  </Button>
                ) : null}
              </>
            }
          />
        }
      />

      <ResultOverlay
        open={overlayOpen}
        won={overlayWon}
        tier={overlayTier}
        title={
          result?.outcome === 'win'
            ? `Digit ${result.winner} wins`
            : result?.outcome === 'refund'
              ? 'Race refunded'
              : `Digit ${result?.winner ?? '—'} wins`
        }
        subtitle={
          result?.outcome === 'win'
            ? `Your pick ${result.pick} finished first · ${result.multiplier.toFixed(2)}×`
            : result?.outcome === 'refund'
              ? 'Stake returned — timeout or market issue'
              : `Your pick was ${result?.pick} · better luck next race`
        }
        amount={result ? overlayAmount(result) : undefined}
        amountLabel="credits"
        onDismiss={dismissResult}
        primaryAction={{ label: 'Race again', onClick: dismissResult }}
        details={result ? <FinishDetails result={result} /> : null}
      />
    </GameShell>
  );
}
