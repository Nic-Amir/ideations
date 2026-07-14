'use client';

import { motion } from 'framer-motion';
import { ArrowDownUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GameShell } from '@/components/games/shared/game-shell';
import { GameViewport, GameNotice } from '@/components/games/shared/game-layout';
import { StakeDock } from '@/components/games/shared/stake-dock';
import { ResultOverlay } from '@/components/games/shared/result-overlay';
import type { GameInfoSection } from '@/components/games/shared/game-info-drawer';
import { TouchChart } from '@/components/games/barrier-touch/touch-chart';
import {
  useBarrierTouch,
  type BarrierTouchResult,
  type TouchPick,
} from '@/hooks/use-barrier-touch';
import {
  COUNT_BUCKETS,
  COUNT_BUCKET_LABELS,
  SEQUENCE_LABELS,
  DISTANCE_PRESETS,
  DURATION_OPTIONS,
  type TouchMode,
  type CountBucket,
  type SequencePick,
  type DistancePresetId,
} from '@/lib/games/barrier-touch';

const INFO_SECTIONS: GameInfoSection[] = [
  {
    id: 'how',
    label: 'How it works',
    content: (
      <p className="text-sm text-on-subtle">
        Barrier Touch is about touch events, not direction. In Count mode you
        bet on how many times the price crosses its entry line before time runs
        out. In Sequence mode you bet on a round trip — one barrier touched
        first, then the opposite barrier touched afterward.
      </p>
    ),
  },
  {
    id: 'count',
    label: 'Count mode',
    content: (
      <div className="space-y-2 text-sm text-on-subtle">
        <p>
          A crossing happens when two consecutive ticks land on opposite sides
          of the entry line. Pick a bucket — 0, 1, 2 or 3+ crossings — and
          exactly one bucket wins every round, so there are no refunds.
        </p>
        <p>
          Longer durations leave more room for the price to whip back and
          forth, shifting the odds from the low buckets toward 3+.
        </p>
      </div>
    ),
  },
  {
    id: 'sequence',
    label: 'Sequence mode',
    content: (
      <div className="space-y-2 text-sm text-on-subtle">
        <p>
          Two barriers sit log-symmetrically around the entry spot. Betting
          Upper → Lower means the upper barrier must be touched first — if the
          lower one is hit first your bet dies on the spot — and then the
          price must travel all the way down through the lower barrier before
          the round ends.
        </p>
        <p>
          Incomplete sequences lose, which is priced into the multiplier.
          Nearer barriers complete more round trips and pay less; farther ones
          are long shots that pay more.
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
          The price path is driftless geometric Brownian motion checked once
          per tick. Bucket odds and round-trip completion odds are computed
          with a state-augmented probability grid — no simulation jitter, the
          same settings always price the same.
        </p>
        <p>
          Every pick pays (1 − 3%) ÷ probability, so the house keeps a 3% edge
          on each stake. Monte Carlo tests validate the grid to within
          statistical noise.
        </p>
      </div>
    ),
  },
];

function ModeToggle({
  mode,
  onChange,
  disabled,
}: {
  mode: TouchMode;
  onChange: (mode: TouchMode) => void;
  disabled: boolean;
}) {
  const options: { id: TouchMode; label: string }[] = [
    { id: 'count', label: 'Count' },
    { id: 'sequence', label: 'Sequence' },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Game mode"
      className="flex rounded-lg border border-border-subtle bg-subtle p-0.5"
    >
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          role="radio"
          aria-checked={mode === opt.id}
          disabled={disabled}
          onClick={() => onChange(opt.id)}
          className={cn(
            'flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors min-h-[32px]',
            mode === opt.id
              ? 'bg-prominent text-on-prominent shadow-sm'
              : 'text-on-subtle hover:text-on-prominent',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function DurationPicker({
  ticks,
  onChange,
  disabled,
}: {
  ticks: number;
  onChange: (ticks: number) => void;
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

/** Count-mode pick surface: one button per crossing bucket. */
function BucketButton({
  bucket,
  multiplier,
  payout,
  selected,
  leading,
  disabled,
  onSelect,
}: {
  bucket: CountBucket;
  multiplier: number;
  payout: number;
  selected: boolean;
  /** Bucket the revealed crossings currently land in. */
  leading: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'flex min-h-[76px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl border px-1 py-2 transition-all',
        selected
          ? 'border-border-prominent bg-prominent text-on-prominent ring-2 ring-border-prominent ring-offset-2 ring-offset-card'
          : 'border-border-subtle bg-subtle text-on-prominent',
        leading && !selected && 'border-semantic-warning/60 bg-semantic-warning/10',
        disabled && !selected && 'opacity-40',
        !disabled && 'hover:border-border-prominent active:scale-[0.98]',
      )}
    >
      <span className="font-display text-xl font-bold tabular-nums">
        {COUNT_BUCKET_LABELS[bucket]}
      </span>
      <span className="text-xs font-semibold tabular-nums text-on-subtle">
        {multiplier.toFixed(2)}×
      </span>
      <span className="text-[10px] tabular-nums opacity-70">
        Pays {payout.toLocaleString()}
      </span>
    </button>
  );
}

/** Sequence-mode pick surface: one button per round-trip direction. */
function SequenceButton({
  pick,
  multiplier,
  payout,
  selected,
  disabled,
  idle,
  onSelect,
}: {
  pick: SequencePick;
  multiplier: number;
  payout: number;
  selected: boolean;
  disabled: boolean;
  idle: boolean;
  onSelect: () => void;
}) {
  const { name, tag } = SEQUENCE_LABELS[pick];
  const isUpperFirst = pick === 'upperLower';
  const Arrow = isUpperFirst ? ArrowUpDown : ArrowDownUp;

  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      animate={idle ? { y: [0, -3, 0] } : { y: 0 }}
      transition={
        idle
          ? {
              duration: 2.5,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: isUpperFirst ? 0 : 0.4,
            }
          : { duration: 0.2 }
      }
      className={cn(
        'flex min-h-[76px] flex-1 flex-col rounded-xl px-4 py-3 text-left transition-opacity',
        isUpperFirst ? 'bg-semantic-win' : 'bg-semantic-loss',
        'text-on-prominent-static-inverse',
        disabled && !selected && 'opacity-40',
        disabled &&
          selected &&
          'ring-2 ring-border-prominent ring-offset-2 ring-offset-card',
        !disabled && 'active:scale-[0.98]',
      )}
    >
      <div className="flex w-full items-baseline justify-between gap-2">
        <span className="flex items-center gap-1 font-display text-base font-bold">
          <Arrow className="h-4 w-4" />
          {name}
        </span>
        <span className="font-display text-xl font-bold tabular-nums">
          {multiplier.toFixed(2)}×
        </span>
      </div>
      <div className="mt-auto flex w-full items-baseline justify-between gap-2 pt-1">
        <span className="text-xs opacity-80">{tag}</span>
        <span className="text-xs tabular-nums opacity-90">
          Pays {payout.toLocaleString()}
        </span>
      </div>
    </motion.button>
  );
}

function OutcomeStrip({
  mode,
  n,
  histogram,
  completionRate,
}: {
  mode: TouchMode;
  n: number;
  histogram: [number, number, number, number];
  completionRate: number;
}) {
  if (n === 0) {
    return (
      <p className="px-4 py-2 text-xs text-on-subtle text-center">
        {mode === 'count'
          ? 'Crossing stats appear after your first round'
          : 'Completion stats appear after your first round'}
      </p>
    );
  }

  if (mode === 'count') {
    return (
      <div className="flex items-center justify-center gap-3 px-4 py-2 text-xs text-on-subtle">
        <span>Last {n}:</span>
        {COUNT_BUCKETS.map((b) => (
          <span key={b} className="tabular-nums">
            <span className="font-semibold text-semantic-warning">
              {COUNT_BUCKET_LABELS[b]}
            </span>
            ×{histogram[b]}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center px-4 py-2 text-xs text-on-subtle">
      <span>
        Last {n} rounds:{' '}
        <span className="font-semibold text-on-prominent tabular-nums">
          {(completionRate * 100).toFixed(0)}%
        </span>{' '}
        completed a round trip
      </span>
    </div>
  );
}

function resultCopy(result: BarrierTouchResult): { title: string; subtitle: string } {
  if (result.mode === 'count') {
    const n = result.crossingCount;
    const crossed = `Crossed ${n} time${n === 1 ? '' : 's'}`;
    const picked =
      result.pick.kind === 'count' ? COUNT_BUCKET_LABELS[result.pick.bucket] : '';
    if (result.outcome === 'win') {
      return {
        title: crossed,
        subtitle: `Dead on — the ${COUNT_BUCKET_LABELS[result.bucket]} bucket paid ${result.multiplier.toFixed(2)}×`,
      };
    }
    return {
      title: crossed,
      subtitle: `You called ${picked} — the line had other plans`,
    };
  }

  const picked = result.pick.kind === 'sequence' ? result.pick.pick : 'upperLower';
  const pickedLabel = SEQUENCE_LABELS[picked].name;
  const firstNeeded = picked === 'upperLower' ? 'upper' : 'lower';

  if (result.outcome === 'win') {
    return {
      title: 'Round trip complete',
      subtitle: `${pickedLabel} landed on tick ${result.settleTick} — paid ${result.multiplier.toFixed(2)}×`,
    };
  }
  if (result.firstTouch !== null && result.firstTouch !== firstNeeded) {
    return {
      title: 'Sequence broken',
      subtitle: `The ${result.firstTouch} barrier was touched first — wrong way around`,
    };
  }
  if (result.firstTouch === firstNeeded) {
    return {
      title: 'One leg short',
      subtitle: `Touched ${result.firstTouch} but never made it back through the other side`,
    };
  }
  return {
    title: 'No touch',
    subtitle: 'The price never reached either barrier',
  };
}

export function BarrierTouchGame() {
  const {
    mode,
    setMode,
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
    playError,
    eventFlash,
    balance,
    maxStake,
    canTrade,
    windowStats,
    countPricing,
    sequencePricing,
    spot,
    idleBarriers,
    previewPrices,
    ticksLeft,
    revealedCrossings,
    leadingBucket,
    legState,
    startRound,
    dismissResult,
    playAgain,
  } = useBarrierTouch();

  const idle = phase === 'idle';
  const running = phase === 'running';
  const settled = phase === 'settled';
  const showOverlay = settled && result !== null;

  const entrySpot = path ? path.entrySpot : spot;
  const upper = path ? path.upper : (idleBarriers?.upper ?? null);
  const lower = path ? path.lower : (idleBarriers?.lower ?? null);

  const requiredFirst =
    pick?.kind === 'sequence' ? (pick.pick === 'upperLower' ? 'upper' : 'lower') : null;

  const settleTick =
    running || settled ? (result?.settleTick ?? path?.prices.length ?? null) : null;

  const copy = result ? resultCopy(result) : { title: '', subtitle: '' };

  const runningPill =
    mode === 'count'
      ? `${revealedCrossings} crossing${revealedCrossings === 1 ? '' : 's'}${
          ticksLeft !== null && ticksLeft > 0
            ? ` — ${ticksLeft} tick${ticksLeft === 1 ? '' : 's'} left`
            : ' — settling…'
        }`
      : legState === 'waitingFirst'
        ? `Waiting on ${requiredFirst} first${
            ticksLeft !== null && ticksLeft > 0 ? ` — ${ticksLeft} ticks left` : ''
          }`
        : legState === 'waitingSecond'
          ? `Leg 1 done — now ${requiredFirst === 'upper' ? 'lower' : 'upper'}${
              ticksLeft !== null && ticksLeft > 0 ? ` — ${ticksLeft} ticks left` : ''
            }`
          : legState === 'completed'
            ? 'Round trip complete!'
            : legState === 'busted'
              ? 'Wrong barrier touched first'
              : 'Settling…';

  const startCount = (bucket: CountBucket) =>
    startRound({ kind: 'count', bucket } satisfies TouchPick);
  const startSequence = (seqPick: SequencePick) =>
    startRound({ kind: 'sequence', pick: seqPick } satisfies TouchPick);

  return (
    <GameShell infoSections={INFO_SECTIONS} showSymbolPicker={false}>
      <GameViewport
        market={<OutcomeStrip mode={mode} {...windowStats} />}
        play={
          <div className="flex flex-col flex-1 min-h-0">
            {playError ? (
              <div className="px-4 pt-3">
                <GameNotice tone="danger">{playError}</GameNotice>
              </div>
            ) : null}

            {/* Full-bleed play surface — the touch chart is the star */}
            <div className="relative mx-3 mt-2 flex-1 min-h-[220px] overflow-hidden rounded-xl border border-border-subtle bg-subtle/30">
              <TouchChart
                mode={mode}
                path={path}
                visibleTick={visibleTick}
                previewPrices={previewPrices}
                entrySpot={entrySpot}
                upper={mode === 'sequence' ? upper : null}
                lower={mode === 'sequence' ? lower : null}
                settleTick={settleTick}
                legState={legState}
                requiredFirst={requiredFirst}
                eventFlash={eventFlash}
              />

              {running ? (
                <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2">
                  <span
                    className={cn(
                      'rounded-full border border-border-subtle bg-card/90 px-3 py-1 text-xs font-semibold text-on-prominent backdrop-blur-sm tabular-nums',
                      eventFlash && 'border-semantic-warning text-semantic-warning',
                    )}
                  >
                    {runningPill}
                  </span>
                </div>
              ) : null}
            </div>

            {/* Trade surface: mode + settings + pick buttons under the chart */}
            <div className="shrink-0 space-y-2 p-4 pt-3">
              {idle ? (
                <>
                  <ModeToggle mode={mode} onChange={setMode} disabled={!canTrade} />
                  <div className="flex gap-2">
                    <DurationPicker ticks={ticks} onChange={setTicks} disabled={!canTrade} />
                    {mode === 'sequence' ? (
                      <DistancePicker
                        distanceId={distanceId}
                        onChange={setDistanceId}
                        disabled={!canTrade}
                      />
                    ) : null}
                  </div>
                  <p className="text-center text-xs text-on-subtle">
                    {mode === 'count'
                      ? 'How many times will the price cross its entry line?'
                      : 'One barrier first, then the other — all before time runs out'}
                  </p>
                </>
              ) : null}

              {mode === 'count' ? (
                <div className="flex gap-2">
                  {COUNT_BUCKETS.map((bucket) => (
                    <BucketButton
                      key={bucket}
                      bucket={bucket}
                      multiplier={countPricing.multipliers[bucket]}
                      payout={Math.round(stake * countPricing.multipliers[bucket])}
                      selected={pick?.kind === 'count' && pick.bucket === bucket}
                      leading={!idle && leadingBucket === bucket}
                      disabled={!idle || !canTrade}
                      onSelect={() => startCount(bucket)}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex gap-2">
                  <SequenceButton
                    pick="upperLower"
                    multiplier={sequencePricing?.multUpperLower ?? 0}
                    payout={Math.round(stake * (sequencePricing?.multUpperLower ?? 0))}
                    selected={pick?.kind === 'sequence' && pick.pick === 'upperLower'}
                    disabled={!idle || !canTrade}
                    idle={idle && canTrade}
                    onSelect={() => startSequence('upperLower')}
                  />
                  <SequenceButton
                    pick="lowerUpper"
                    multiplier={sequencePricing?.multLowerUpper ?? 0}
                    payout={Math.round(stake * (sequencePricing?.multLowerUpper ?? 0))}
                    selected={pick?.kind === 'sequence' && pick.pick === 'lowerUpper'}
                    disabled={!idle || !canTrade}
                    idle={idle && canTrade}
                    onSelect={() => startSequence('lowerUpper')}
                  />
                </div>
              )}
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
                ? mode === 'count'
                  ? 'Tap a bucket above to start'
                  : 'Tap a sequence above to start'
                : running
                  ? 'Round in progress'
                  : undefined
            }
          />
        }
      />

      <ResultOverlay
        open={showOverlay}
        won={result?.outcome === 'win'}
        title={copy.title}
        subtitle={copy.subtitle}
        amount={result?.outcome === 'win' ? result.netPL : result?.stake}
        amountLabel="credits"
        tier={result?.outcome === 'win' ? 'win' : 'loss'}
        onDismiss={dismissResult}
        autoDismissMs={5000}
        showAutoDismissBar
        primaryAction={{ label: 'Play again', onClick: playAgain }}
      />
    </GameShell>
  );
}
