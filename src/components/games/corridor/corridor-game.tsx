'use client';

import { cn } from '@/lib/utils';
import { GameShell } from '@/components/games/shared/game-shell';
import { GameViewport, GameNotice } from '@/components/games/shared/game-layout';
import { StakeDock } from '@/components/games/shared/stake-dock';
import { ResultOverlay } from '@/components/games/shared/result-overlay';
import type { GameInfoSection } from '@/components/games/shared/game-info-drawer';
import { CorridorChart } from '@/components/games/corridor/corridor-chart';
import { CorridorPickStrip } from '@/components/games/corridor/corridor-pick-strip';
import { useCorridor } from '@/hooks/use-corridor';
import {
  DISTANCE_PRESETS,
  DURATION_OPTIONS,
  centsToUsdt,
  payoutCentsFromMult,
  usdtToCents,
  type DistancePresetId,
  type DurationTicks,
} from '@/lib/games/corridor';

const INFO_SECTIONS: GameInfoSection[] = [
  {
    id: 'how',
    label: 'How it works',
    content: (
      <p className="text-sm text-on-subtle">
        The chart shows a fixed price corridor. Tap Inside to bet the path stays
        between both barriers for all ticks. Tap Outside to bet it touches either
        barrier (above or below) first. Multipliers lock when you tap.
      </p>
    ),
  },
  {
    id: 'sides',
    label: 'Stay in / Goes out',
    content: (
      <div className="space-y-2 text-sm text-on-subtle">
        <p>
          <span className="font-semibold text-on-prominent">Inside</span> wins
          only if neither barrier is touched for the full duration.
        </p>
        <p>
          <span className="font-semibold text-on-prominent">Outside</span> wins
          on the first tick that reaches the upper or lower barrier — one side,
          not two separate bets.
        </p>
        <p>There is no mid-path cash-out.</p>
      </div>
    ),
  },
  {
    id: 'pricing',
    label: 'Pricing',
    content: (
      <div className="space-y-2 text-sm text-on-subtle">
        <p>
          Corridor width locks from a reference duration (10 ticks at Standard).
          Longer T makes Stay harder and Goes easier at the same barriers. Each
          side pays (1 / p) × (1 − margin), locked at place, with a 3% house edge.
        </p>
        <p>Near corridors make Stay harder and Goes easier; Far flips that.</p>
      </div>
    ),
  },
];

function DurationPicker({
  ticks,
  onChange,
  disabled,
}: {
  ticks: DurationTicks;
  onChange: (ticks: DurationTicks) => void;
  disabled: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Round duration"
      className="flex flex-1 rounded-lg border border-border-subtle bg-subtle p-0.5"
    >
      {DURATION_OPTIONS.map((opt) => (
        <button
          key={opt}
          type="button"
          role="radio"
          aria-checked={ticks === opt}
          disabled={disabled}
          onClick={() => onChange(opt)}
          className={cn(
            'flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors min-h-[32px] tabular-nums',
            ticks === opt
              ? 'bg-prominent text-on-prominent shadow-sm'
              : 'text-on-subtle hover:text-on-prominent',
          )}
        >
          {opt}t
        </button>
      ))}
    </div>
  );
}

function DistancePicker({
  distanceId,
  onChange,
  disabled,
}: {
  distanceId: DistancePresetId;
  onChange: (id: DistancePresetId) => void;
  disabled: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Barrier distance"
      className="flex flex-1 rounded-lg border border-border-subtle bg-subtle p-0.5"
    >
      {DISTANCE_PRESETS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          role="radio"
          aria-checked={distanceId === preset.id}
          disabled={disabled}
          onClick={() => onChange(preset.id)}
          className={cn(
            'flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors min-h-[32px]',
            distanceId === preset.id
              ? 'bg-prominent text-on-prominent shadow-sm'
              : 'text-on-subtle hover:text-on-prominent',
          )}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}

function SessionStrip({
  n,
  stayWins,
}: {
  n: number;
  stayWins: number;
}) {
  if (n === 0) {
    return (
      <p className="px-4 py-2 text-center text-xs text-on-subtle">
        Stay in / Goes out — tap Inside or Outside
      </p>
    );
  }

  return (
    <div className="flex items-center justify-center gap-4 px-4 py-2 text-xs text-on-subtle">
      <span>
        Last {n}:{' '}
        <span className="font-semibold text-on-prominent tabular-nums">
          {stayWins}/{n}
        </span>{' '}
        Inside wins
      </span>
    </div>
  );
}

export function CorridorGame() {
  const {
    stake,
    setStake,
    ticks,
    setTicks,
    distanceId,
    setDistanceId,
    phase,
    pick,
    path,
    visibleTick,
    result,
    history,
    playError,
    barrierFlash,
    balance,
    maxStake,
    canTrade,
    pricing,
    spot,
    idleBarriers,
    previewPrices,
    ticksLeft,
    startRound,
    dismissResult,
    playAgain,
  } = useCorridor();

  const idle = phase === 'idle';
  const running = phase === 'running';
  const settled = phase === 'settled';
  const showOverlay = settled && result !== null;

  const upper = path ? path.upper : idleBarriers.upper;
  const lower = path ? path.lower : idleBarriers.lower;
  const entrySpot = path ? path.entrySpot : spot;

  const stakeCents = usdtToCents(stake);
  const payoutStay = centsToUsdt(payoutCentsFromMult(stakeCents, pricing.multStay));
  const payoutGoes = centsToUsdt(payoutCentsFromMult(stakeCents, pricing.multGoes));

  const stayWins = history.filter(
    (h) =>
      (h.pick === 'stay' && h.outcome === 'WON') ||
      (h.pick === 'goes' && h.outcome === 'LOST'),
  ).length;

  const progress =
    running && path && path.settleTick > 0
      ? Math.min(1, visibleTick / path.settleTick)
      : null;

  const distanceLabel =
    DISTANCE_PRESETS.find((p) => p.id === distanceId)?.label ?? 'Standard';

  let resultTitle = 'Round over';
  let resultSubtitle: string | undefined;
  if (result) {
    if (result.outcome === 'WON') {
      if (result.pick === 'stay') {
        resultTitle = 'Stayed inside';
        resultSubtitle = `No touch for ${result.settleTick} ticks · ${result.multiplier.toFixed(2)}×`;
      } else {
        resultTitle = 'Broke out';
        resultSubtitle = `Barrier hit on tick ${result.settleTick} · ${result.multiplier.toFixed(2)}×`;
      }
    } else if (result.pick === 'stay') {
      resultTitle = 'Broke out';
      resultSubtitle = `Price left the corridor on tick ${result.settleTick}`;
    } else {
      resultTitle = 'Stayed inside';
      resultSubtitle = 'Price never left the corridor';
    }
  }

  return (
    <GameShell infoSections={INFO_SECTIONS} showSymbolPicker={false}>
      <GameViewport
        market={<SessionStrip n={history.length} stayWins={stayWins} />}
        play={
          <div className="flex min-h-0 flex-1 flex-col">
            {playError ? (
              <div className="px-4 pt-3">
                <GameNotice tone="danger">{playError}</GameNotice>
              </div>
            ) : null}

            <div className="relative mx-3 mt-2 min-h-[200px] flex-1 overflow-hidden rounded-xl border border-border-subtle bg-subtle/30">
              <CorridorChart
                path={path}
                visibleTick={visibleTick}
                previewPrices={previewPrices}
                upper={upper}
                lower={lower}
                entrySpot={entrySpot}
                barrierFlash={barrierFlash}
                touched={path?.touched ?? null}
                progress={progress}
                pick={pick}
              />

              {running && ticksLeft !== null ? (
                <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2">
                  <span className="rounded-full border border-border-subtle bg-card/90 px-3 py-1 text-xs font-semibold text-on-prominent backdrop-blur-sm tabular-nums">
                    {ticksLeft > 0
                      ? `${ticksLeft} tick${ticksLeft === 1 ? '' : 's'} left`
                      : 'Settling…'}
                  </span>
                </div>
              ) : null}
            </div>

            <div className="shrink-0 space-y-2 p-4 pt-3">
              {idle ? (
                <>
                  <CorridorPickStrip
                    multStay={pricing.multStay}
                    multGoes={pricing.multGoes}
                    payoutStay={payoutStay}
                    payoutGoes={payoutGoes}
                    canTrade={canTrade}
                    onTap={(side) => startRound(side)}
                  />
                  <div className="flex gap-2">
                    <DurationPicker ticks={ticks} onChange={setTicks} disabled={!canTrade} />
                    <DistancePicker
                      distanceId={distanceId}
                      onChange={setDistanceId}
                      disabled={!canTrade}
                    />
                  </div>
                  <p className="text-center text-xs text-on-subtle tabular-nums">
                    {(pricing.pStay * 100).toFixed(0)}% stay ·{' '}
                    {(pricing.pGoes * 100).toFixed(0)}% goes · {ticks} ticks ·{' '}
                    {distanceLabel}
                  </p>
                </>
              ) : null}
            </div>
          </div>
        }
        dock={
          <StakeDock
            stake={stake}
            max={maxStake}
            balance={balance}
            onStakeChange={setStake}
            stakeDisabled={running || settled}
            footer={
              idle
                ? 'Outside wins if price hits either barrier'
                : running
                  ? 'Round in progress'
                  : undefined
            }
          />
        }
      />

      <ResultOverlay
        open={showOverlay}
        won={result?.outcome === 'WON'}
        title={resultTitle}
        subtitle={resultSubtitle}
        amount={
          result?.outcome === 'WON'
            ? result.netPL
            : result?.outcome === 'LOST'
              ? result.stakeUsdt
              : undefined
        }
        amountLabel="credits"
        tier={result?.outcome === 'WON' ? 'win' : 'loss'}
        onDismiss={dismissResult}
        autoDismissMs={5000}
        showAutoDismissBar
        primaryAction={{ label: 'Play again', onClick: playAgain }}
      />
    </GameShell>
  );
}
