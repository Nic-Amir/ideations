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
import {
  DIGIT_BET_MODES,
  DIGIT_DERBY_CONFIG,
  DIGIT_SILKS,
  MARGIN_THRESHOLDS,
  getDigitBetModeSpec,
  offeredOddsFromProbability,
  winningLead,
  type DigitBetMode,
  type DigitBetModeSpec,
  type DigitDerbyPick,
  type MarginThreshold,
  type PickPricing,
} from '@/lib/games/digit-derby';
import { cn } from '@/lib/utils';

function marginThresholdLabel(threshold: MarginThreshold): string {
  return (
    MARGIN_THRESHOLDS.find((t) => t.threshold === threshold)?.label ?? 'Margin'
  );
}

function slotLabel(mode: DigitBetMode, index: number, ordered: boolean): string | null {
  if (mode === 'spread') return index === 0 ? 'Long' : 'Short';
  if (ordered) return `${index + 1}.`;
  return null;
}

function ModePicker({
  mode,
  onChange,
  disabled,
}: {
  mode: DigitBetMode;
  onChange: (mode: DigitBetMode) => void;
  disabled: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Contract type"
      className="scrollbar-hide flex gap-1.5 overflow-x-auto"
    >
      {DIGIT_BET_MODES.map((m) => {
        const active = m.id === mode;
        return (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(m.id)}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors',
              active
                ? 'border-primary bg-primary text-on-prominent-static-inverse'
                : 'border-border-subtle bg-subtle text-on-subtle hover:text-on-prominent',
              disabled && 'opacity-60',
            )}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

function OrderToggle({
  ordered,
  onChange,
  disabled,
}: {
  ordered: boolean;
  onChange: (ordered: boolean) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border-subtle bg-subtle p-0.5">
      {(
        [
          { value: false, label: 'Basket' },
          { value: true, label: 'Exact' },
        ] as const
      ).map((opt) => (
        <button
          key={opt.label}
          type="button"
          disabled={disabled}
          aria-pressed={ordered === opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            'min-h-[32px] flex-1 rounded-md px-3 text-[10px] font-semibold transition-colors',
            ordered === opt.value
              ? 'bg-prominent text-on-prominent shadow-sm'
              : 'text-on-subtle hover:text-on-prominent',
            disabled && 'opacity-60',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function SelectionSlots({
  mode,
  selection,
  picks,
  ordered,
}: {
  mode: DigitBetMode;
  selection: number[];
  picks: number;
  ordered: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {Array.from({ length: picks }, (_, i) => {
        const digit = selection[i];
        const filled = digit !== undefined;
        const label = slotLabel(mode, i, ordered);
        return (
          <span
            key={i}
            className={cn(
              'flex h-8 min-w-[2.5rem] items-center justify-center gap-1 rounded-lg border px-2 text-xs font-semibold tabular-nums',
              filled
                ? 'border-border-prominent bg-prominent text-on-prominent'
                : 'border-dashed border-border-subtle bg-subtle text-on-subtle',
            )}
          >
            {label ? (
              <span className="text-[9px] font-semibold uppercase tracking-wide text-on-subtle">
                {label}
              </span>
            ) : null}
            {filled ? (
              <>
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: DIGIT_SILKS[digit] }}
                />
                {digit}
              </>
            ) : (
              'Pick'
            )}
          </span>
        );
      })}
    </div>
  );
}

function MarginThresholdPicker({
  selected,
  stake,
  onSelect,
  disabled,
}: {
  selected: MarginThreshold | null;
  stake: number;
  onSelect: (threshold: MarginThreshold) => void;
  disabled: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Margin threshold"
      className="flex flex-col gap-2"
    >
      {MARGIN_THRESHOLDS.map((chip) => {
        const active = selected === chip.threshold;
        const p =
          chip.threshold === 1
            ? DIGIT_DERBY_CONFIG.marginPhotoP
            : chip.threshold === 2
              ? DIGIT_DERBY_CONFIG.marginWideP
              : DIGIT_DERBY_CONFIG.marginBlowoutP;
        const mult = offeredOddsFromProbability(p);
        const returnAmount = Math.round(stake * mult);
        return (
          <button
            key={chip.threshold}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onSelect(chip.threshold)}
            className={cn(
              'flex min-h-[52px] items-center justify-between rounded-xl border px-4 text-left transition-colors',
              active
                ? 'border-primary bg-primary/10 text-on-prominent'
                : 'border-border-subtle bg-prominent text-on-subtle hover:text-on-prominent',
              disabled && 'opacity-60',
            )}
          >
            <span>
              <span className="block font-display text-sm font-bold text-on-prominent">
                {chip.label}
              </span>
              <span className="text-[10px] text-on-subtle">{chip.tag}</span>
            </span>
            <span className="text-right">
              <span className="block font-display text-sm font-bold tabular-nums text-on-prominent">
                {mult.toFixed(2)}×
              </span>
              <span className="text-[10px] tabular-nums text-on-subtle">
                Return {returnAmount.toLocaleString()}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function TicketSlip({
  mode,
  spec,
  selection,
  marginThreshold,
  ordered,
  pricing,
  stake,
  canStart,
  onClear,
  onStart,
}: {
  mode: DigitBetMode;
  spec: DigitBetModeSpec;
  selection: number[];
  marginThreshold: MarginThreshold | null;
  ordered: boolean;
  pricing: PickPricing | null;
  stake: number;
  canStart: boolean;
  onClear: () => void;
  onStart: () => void;
}) {
  const isMargin = mode === 'margin';
  const remaining = isMargin
    ? marginThreshold
      ? 0
      : 1
    : spec.picks - selection.length;
  const returnAmount = pricing ? Math.round(stake * pricing.multiplier) : 0;
  const netProfit = Math.max(0, returnAmount - stake);
  const hasSelection = isMargin ? marginThreshold !== null : selection.length > 0;
  const selectionSummary = isMargin
    ? marginThreshold
      ? marginThresholdLabel(marginThreshold)
      : 'No threshold'
    : `${selection.length}/${spec.picks} selected`;

  return (
    <div className="mx-1 mb-1 shrink-0 rounded-xl border border-border-subtle bg-subtle/50 p-3 shadow-sm">
      <div className="mb-2 flex min-h-[32px] items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-on-subtle">
            Ticket
          </p>
          <p className="text-xs font-semibold text-on-prominent">
            {spec.label}
            {spec.orderable ? (ordered ? ' · Exact' : ' · Basket') : ''}
            <span className="ml-1 font-normal text-on-subtle">
              {selectionSummary}
            </span>
          </p>
        </div>
        {hasSelection ? (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear selection"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-prominent text-on-subtle transition-colors hover:text-on-prominent"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {isMargin ? (
        <div className="flex flex-wrap gap-1.5">
          <span
            className={cn(
              'flex h-8 min-w-[2.5rem] items-center justify-center rounded-lg border px-3 text-xs font-semibold',
              marginThreshold
                ? 'border-border-prominent bg-prominent text-on-prominent'
                : 'border-dashed border-border-subtle bg-subtle text-on-subtle',
            )}
          >
            {marginThreshold
              ? marginThresholdLabel(marginThreshold)
              : 'Pick threshold'}
          </span>
        </div>
      ) : (
        <SelectionSlots
          mode={mode}
          selection={selection}
          picks={spec.picks}
          ordered={spec.orderable && ordered}
        />
      )}

      {remaining > 0 ? (
        <p className="mt-2 text-center text-xs text-on-subtle">
          {isMargin
            ? 'Select Photo, Wide, or Blowout above.'
            : `Select ${remaining} more digit${remaining === 1 ? '' : 's'} from the board.`}
        </p>
      ) : pricing ? (
        <>
          <div className="mt-2 grid grid-cols-3 gap-2 rounded-lg bg-prominent px-3 py-2 text-center">
            <div>
              <p className="text-[9px] uppercase tracking-wide text-on-subtle">Payout</p>
              <p className="font-display text-sm font-bold tabular-nums text-on-prominent">
                {pricing.multiplier.toFixed(2)}×
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
              Open position
            </span>
            <span className="text-right text-xs font-semibold tabular-nums">
              Size {stake.toLocaleString()}
              <span className="block text-[10px] opacity-80">
                Return {returnAmount.toLocaleString()}
              </span>
            </span>
          </button>
        </>
      ) : null}
    </div>
  );
}

function LockedPositionChip({
  pick,
  finishOrder,
  counts,
  finishCount,
  multiplier,
}: {
  pick: DigitDerbyPick;
  finishOrder: number[];
  counts: number[];
  finishCount: number;
  multiplier: number;
}) {
  const spec = getDigitBetModeSpec(pick.mode);
  const lead =
    finishOrder.length >= 2 ? winningLead(counts, finishOrder) : null;

  return (
    <div className="mx-1 flex shrink-0 flex-col gap-2 rounded-xl border border-border-subtle bg-subtle/60 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-on-subtle">
            Locked position
          </p>
          <p className="truncate text-xs font-semibold text-on-prominent">
            {spec.label}
            {spec.orderable ? (pick.ordered ? ' · Exact' : ' · Basket') : ''}
            {pick.mode === 'margin' && pick.marginThreshold
              ? ` · ${marginThresholdLabel(pick.marginThreshold)}`
              : ''}
          </p>
        </div>
        <span className="font-display text-sm font-bold tabular-nums text-on-prominent">
          {multiplier.toFixed(2)}×
        </span>
      </div>
      {pick.mode === 'margin' ? (
        <div className="flex items-center gap-2 text-[10px] font-semibold text-on-subtle">
          <span className="rounded-full border border-border-subtle bg-prominent px-2 py-1 text-on-prominent">
            {pick.marginThreshold
              ? marginThresholdLabel(pick.marginThreshold)
              : 'Margin'}
          </span>
          {lead !== null ? (
            <span className="tabular-nums">
              Lead {lead} · 1st {counts[finishOrder[0]]}/{finishCount}
            </span>
          ) : null}
        </div>
      ) : (
        <div className="scrollbar-hide flex gap-1.5 overflow-x-auto">
          {pick.digits.map((digit, index) => (
            <span
              key={`${digit}-${index}`}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-border-subtle bg-prominent px-2 py-1 text-[10px] font-semibold text-on-prominent"
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: DIGIT_SILKS[digit] }}
              />
              {pick.mode === 'spread'
                ? index === 0
                  ? 'Long '
                  : 'Short '
                : pick.ordered
                  ? `${index + 1}. `
                  : ''}
              {digit}
              <span className="text-on-subtle">
                #{finishOrder.indexOf(digit) + 1} · {counts[digit]}/{finishCount}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function FinishDetails({ result }: { result: DigitDerbyResult }) {
  const topFive = result.finishOrder.slice(0, 5);
  const pickSet = new Set(result.pick.digits);
  const picksOutside = result.pick.digits.filter((d) => !topFive.includes(d));

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
          Ticket
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
        {topFive.map((digit, index) => finishRow(digit, index + 1, pickSet.has(digit)))}
      </div>
      {picksOutside.length > 0 ? (
        <div className="border-t border-border-subtle pt-2">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-on-subtle">
            Remaining ticket
          </p>
          <div className="space-y-1">
            {picksOutside.map((digit) =>
              finishRow(digit, result.finishOrder.indexOf(digit) + 1, true),
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function resultCopy(result: DigitDerbyResult): { title: string; subtitle: string } {
  const spec = getDigitBetModeSpec(result.pick.mode);
  const modeName =
    result.pick.mode === 'margin' && result.pick.marginThreshold
      ? `${marginThresholdLabel(result.pick.marginThreshold)} Margin`
      : result.pick.ordered
        ? `Exact ${spec.label}`
        : spec.label;
  const winner = result.winner;

  if (result.outcome === 'refund') {
    return {
      title: 'Position refunded',
      subtitle: 'Stake returned — timeout or market issue',
    };
  }

  if (result.pick.mode === 'spread') {
    const [longDigit, shortDigit] = result.pick.digits;
    if (result.outcome === 'win') {
      return {
        title: `Digit ${longDigit} beats ${shortDigit}`,
        subtitle: `Your spread paid ${result.multiplier.toFixed(2)}×`,
      };
    }
    return {
      title: `Digit ${shortDigit} finishes ahead`,
      subtitle: 'Your long did not lead the short',
    };
  }

  if (result.pick.mode === 'margin') {
    if (result.outcome === 'win') {
      return {
        title: `${modeName} hits`,
        subtitle: `Your margin ticket paid ${result.multiplier.toFixed(2)}×`,
      };
    }
    return {
      title: winner !== null ? `Digit ${winner} leads the board` : 'Margin misses',
      subtitle: `Your ${modeName.toLowerCase()} did not land`,
    };
  }

  if (result.outcome === 'win') {
    return {
      title: winner !== null ? `Digit ${winner} leads the board` : 'Ticket hits',
      subtitle: `Your ${modeName.toLowerCase()} paid ${result.multiplier.toFixed(2)}×`,
    };
  }

  return {
    title: winner !== null ? `Digit ${winner} leads the board` : 'Ticket misses',
    subtitle: `Your ${modeName.toLowerCase()} did not land`,
  };
}

function overlayAmount(result: DigitDerbyResult): number {
  if (result.outcome === 'win') return result.netPL;
  if (result.outcome === 'refund') return result.payout;
  return result.stake;
}

export function DigitDerbyGame() {
  const {
    phase,
    mode,
    setMode,
    ordered,
    setOrdered,
    selection,
    marginThreshold,
    setMarginThreshold,
    stake,
    setStake,
    counts,
    tickCount,
    lockedMultiplier,
    lockedPick,
    pricing,
    spec,
    selectionComplete,
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
    toggleDigit,
    clearSelection,
    startRace,
    dismissResult,
  } = useDigitDerby();

  const idle = phase === 'idle';
  const racing = phase === 'running' || phase === 'settled';
  const displayPicks = lockedPick?.digits ?? selection;
  const isMargin = mode === 'margin';

  const infoSections: GameInfoSection[] = [
    {
      id: 'how',
      label: 'How to play',
      content: (
        <div className="space-y-2 text-sm text-on-subtle">
          <p>
            Choose a contract — Outright, Top 3, Pair, Trio, Top 5, Spread, or
            Margin — then build a ticket.
          </p>
          <p>
            Pair / Trio / Top 5 support Basket (any order) or Exact (sequence
            must match ranks). Spread picks Long vs Short. Margin calls the
            winning lead: Photo (1), Wide (≥2), or Blowout (≥3).
          </p>
          <p>
            Each live tick advances that last digit. First to {finishCount}{' '}
            finishes first; the board ranks by collected counts.
          </p>
        </div>
      ),
    },
    {
      id: 'pricing',
      label: 'Pricing',
      content: (
        <div className="space-y-2 text-sm text-on-subtle">
          <p>
            Ranking markets use combinatorial fair odds under a uniform
            finish-order model. Margin uses Monte Carlo lead probs. All prices
            add a {DIGIT_DERBY_CONFIG.commission * 100}% commission.
          </p>
          <p>Multiplier locks when you open the position.</p>
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
            Digits come from the continuous tick feed (~1 Hz in this POC).
            Opening a position stays disabled until ticks arrive.
          </p>
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
  const copy = result ? resultCopy(result) : null;

  const dockFooter = idle
    ? selectionComplete && pricing
      ? canStart
        ? `${spec.label}${
            isMargin && marginThreshold
              ? ` · ${marginThresholdLabel(marginThreshold)}`
              : ''
          } · ${pricing.multiplier.toFixed(2)}×`
        : 'Waiting for ticks'
      : isMargin
        ? 'Select Photo, Wide, or Blowout'
        : `Select ${spec.picks} digit${spec.picks === 1 ? '' : 's'} for ${spec.label}`
    : phase === 'running'
      ? 'Position open'
      : undefined;

  return (
    <GameShell title="Digit Derby" infoSections={infoSections} showSymbolPicker>
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
            {idle ? (
              <div className="shrink-0 space-y-2">
                <ModePicker mode={mode} onChange={setMode} disabled={!idle} />
                {spec.orderable ? (
                  <OrderToggle
                    ordered={ordered}
                    onChange={setOrdered}
                    disabled={!idle}
                  />
                ) : (
                  <p className="text-[10px] text-on-subtle">{spec.tag}</p>
                )}
              </div>
            ) : null}

            {racing ? (
              <>
                <div className="shrink-0">
                  <DigitLeaderboardStrip
                    finishOrder={finishOrder}
                    counts={counts}
                    picks={displayPicks}
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
                    lockedPicks={lockedPick?.digits ?? []}
                    lastAdvancedDigit={lastConsumedTick?.lastDigit ?? null}
                    winningDigit={winningDigit}
                    finished={phase === 'settled'}
                    inFinalStretch={inFinalStretch}
                  />
                </div>

                {lockedPick !== null && lockedMultiplier !== null ? (
                  <LockedPositionChip
                    pick={lockedPick}
                    finishOrder={finishOrder}
                    counts={counts}
                    finishCount={finishCount}
                    multiplier={lockedMultiplier}
                  />
                ) : null}
              </>
            ) : (
              <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border-subtle bg-subtle/40 p-3">
                {isMargin ? (
                  <MarginThresholdPicker
                    selected={marginThreshold}
                    stake={stake}
                    onSelect={setMarginThreshold}
                    disabled={!idle}
                  />
                ) : (
                  <DigitPickGrid
                    selection={selection}
                    ordered={spec.orderable && ordered}
                    maxPicks={spec.picks}
                    multiplier={pricing?.multiplier ?? null}
                    modeLabel={spec.label}
                    onToggleDigit={toggleDigit}
                    disabled={!idle}
                  />
                )}
              </div>
            )}

            {idle ? (
              <TicketSlip
                mode={mode}
                spec={spec}
                selection={selection}
                marginThreshold={marginThreshold}
                ordered={ordered}
                pricing={pricing}
                stake={stake}
                canStart={canStart}
                onClear={clearSelection}
                onStart={() => void startRace()}
              />
            ) : null}

            {playError ? <GameNotice tone="danger">{playError}</GameNotice> : null}
            {!marketReady && idle ? (
              <GameNotice tone="warning">
                Waiting for ticks.
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
            footer={dockFooter}
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
                    New ticket
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
        title={copy?.title ?? ''}
        subtitle={copy?.subtitle}
        amount={result ? overlayAmount(result) : undefined}
        amountLabel="credits"
        onDismiss={dismissResult}
        primaryAction={{ label: 'New ticket', onClick: dismissResult }}
        details={result ? <FinishDetails result={result} /> : null}
      />
    </GameShell>
  );
}
