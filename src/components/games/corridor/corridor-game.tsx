'use client';

import { cn } from '@/lib/utils';
import { GameShell } from '@/components/games/shared/game-shell';
import { GameViewport, GameNotice } from '@/components/games/shared/game-layout';
import { StakeDock } from '@/components/games/shared/stake-dock';
import { ResultOverlay } from '@/components/games/shared/result-overlay';
import type { GameInfoSection } from '@/components/games/shared/game-info-drawer';
import { CorridorStrip } from '@/components/games/corridor/corridor-strip';
import { useCorridor } from '@/hooks/use-corridor';
import {
  DISTANCE_PRESETS,
  PICK_LABELS,
  type DistancePresetId,
} from '@/lib/games/corridor';

const INFO_SECTIONS: GameInfoSection[] = [
  {
    id: 'how',
    label: 'How it works',
    content: (
      <p className="text-sm text-on-subtle">
        Price moves inside a fixed corridor for T ticks. Tap Inside if you think
        it stays between the barriers the whole time (Stay in). Tap Outside if
        you think it touches either barrier first (Goes out). One gesture —
        multipliers lock when you tap.
      </p>
    ),
  },
  {
    id: 'sides',
    label: 'Stay in / Goes out',
    content: (
      <div className="space-y-2 text-sm text-on-subtle">
        <p>
          <span className="font-semibold text-on-prominent">Stay in</span> wins
          only if neither barrier is touched for the full duration. No-touch is
          a win for Inside — not a refund.
        </p>
        <p>
          <span className="font-semibold text-on-prominent">Goes out</span> wins
          on the first tick that reaches the upper or lower barrier.
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
          Fair odds come from the same discrete double-barrier first-passage
          grid as Barrier Predictor. Each side pays (1 / p) × (1 − margin),
          locked at place, with a 3% house edge.
        </p>
        <p>
          Near corridors make Stay harder and Goes easier; Far flips that.
          Columns on the board show live multipliers for each duration.
        </p>
      </div>
    ),
  },
];

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
      className="flex rounded-lg border border-border-subtle bg-subtle p-0.5"
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
        Stay in / Goes out — tap a zone on the board
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
    columnPricing,
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

  const stayWins = history.filter(
    (h) =>
      (h.pick === 'stay' && h.outcome === 'WON') ||
      (h.pick === 'goes' && h.outcome === 'LOST'),
  ).length;

  const resultTitle =
    result?.outcome === 'WON'
      ? `${PICK_LABELS[result.pick].name} — you won`
      : `${PICK_LABELS[result?.pick ?? 'stay'].name} — lost`;

  const resultSubtitle =
    result?.outcome === 'WON'
      ? result.pick === 'stay'
        ? `No touch for ${result.settleTick} ticks · ${result.multiplier.toFixed(2)}×`
        : `Barrier hit on tick ${result.settleTick} · ${result.multiplier.toFixed(2)}×`
      : result?.pick === 'stay'
        ? `Price left the corridor on tick ${result.settleTick}`
        : `Price never left the corridor`;

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

            <div className="relative mx-3 mt-2 min-h-[240px] flex-1 overflow-hidden rounded-xl border border-border-subtle bg-subtle/30">
              <CorridorStrip
                columnPricing={columnPricing}
                selectedTicks={ticks}
                pick={pick}
                phase={phase}
                canTrade={canTrade}
                path={path}
                visibleTick={visibleTick}
                previewPrices={previewPrices}
                upper={upper}
                lower={lower}
                entrySpot={entrySpot}
                barrierFlash={barrierFlash}
                stake={stake}
                onTap={(side, duration) => startRound(side, duration)}
              />

              {running && ticksLeft !== null ? (
                <div className="pointer-events-none absolute left-1/2 top-2 z-20 -translate-x-1/2">
                  <span className="rounded-full border border-border-subtle bg-card/90 px-3 py-1 text-xs font-semibold text-on-prominent backdrop-blur-sm tabular-nums">
                    {ticksLeft > 0
                      ? `${ticksLeft} tick${ticksLeft === 1 ? '' : 's'} left`
                      : 'Settling…'}
                    {pick ? ` — ${PICK_LABELS[pick].board}` : ''}
                  </span>
                </div>
              ) : null}
            </div>

            <div className="shrink-0 space-y-2 p-4 pt-3">
              {idle ? (
                <>
                  <DistancePicker
                    distanceId={distanceId}
                    onChange={setDistanceId}
                    disabled={!canTrade}
                  />
                  <p className="text-center text-xs text-on-subtle tabular-nums">
                    {(pricing.pStay * 100).toFixed(0)}% stay ·{' '}
                    {(pricing.pGoes * 100).toFixed(0)}% goes at {ticks}t ·{' '}
                    {DISTANCE_PRESETS.find((p) => p.id === distanceId)?.label}
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
                ? 'Tap Inside or Outside on a column'
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
