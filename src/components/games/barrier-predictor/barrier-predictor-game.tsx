'use client';

import { motion } from 'framer-motion';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GameShell } from '@/components/games/shared/game-shell';
import { GameViewport, GameNotice } from '@/components/games/shared/game-layout';
import { StakeDock } from '@/components/games/shared/stake-dock';
import { ResultOverlay } from '@/components/games/shared/result-overlay';
import type { GameInfoSection } from '@/components/games/shared/game-info-drawer';
import { PredictorChart } from '@/components/games/barrier-predictor/predictor-chart';
import { useBarrierPredictor } from '@/hooks/use-barrier-predictor';
import {
  BARRIER_LABELS,
  DISTANCE_PRESETS,
  DURATION_OPTIONS,
  type BarrierSide,
  type DistancePresetId,
} from '@/lib/games/barrier-predictor';

const INFO_SECTIONS: GameInfoSection[] = [
  {
    id: 'how',
    label: 'How it works',
    content: (
      <p className="text-sm text-on-subtle">
        A simulated price moves inside a corridor bounded by two barriers — one
        above the spot, one below. Predict which barrier the price touches
        first. The round settles the instant a barrier is reached; if neither
        is touched before time runs out, your stake is refunded.
      </p>
    ),
  },
  {
    id: 'barriers',
    label: 'Barriers',
    content: (
      <div className="space-y-2 text-sm text-on-subtle">
        <p>
          Barriers are placed log-symmetrically around the entry spot, so
          Upper and Lower are always an even coin flip. They lock the moment
          you place a trade.
        </p>
        <p>
          Near barriers get touched almost every round. Far barriers are
          harder to reach — more rounds end in a refund, but a decisive touch
          pays less because fewer rounds risk your stake.
        </p>
      </div>
    ),
  },
  {
    id: 'payouts',
    label: 'Payouts',
    content: (
      <p className="text-sm text-on-subtle">
        The payout multiplier depends on your duration and barrier distance —
        it is shown live on both buttons before you trade. A correct pick pays
        stake × multiplier, a wrong pick loses the stake, and a no-touch round
        refunds it in full.
      </p>
    ),
  },
  {
    id: 'pricing',
    label: 'Pricing',
    content: (
      <div className="space-y-2 text-sm text-on-subtle">
        <p>
          The price path is driftless geometric Brownian motion checked
          against the barriers once per tick. The chance the corridor survives
          all ticks is computed with a first-passage grid model, and by
          symmetry each barrier carries half of the touch probability.
        </p>
        <p>
          The multiplier is set so the house keeps a 3% edge on every stake,
          after accounting for refunded rounds. Monte Carlo tests validate the
          model to within statistical noise.
        </p>
      </div>
    ),
  },
];

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

/** The game's single trade gesture: pick a barrier, start the round. */
function PickButton({
  side,
  multiplier,
  payout,
  selected,
  disabled,
  idle,
  onSelect,
}: {
  side: BarrierSide;
  multiplier: number;
  payout: number;
  selected: boolean;
  disabled: boolean;
  idle: boolean;
  onSelect: () => void;
}) {
  const { name, tag } = BARRIER_LABELS[side];
  const isUpper = side === 'upper';
  const Arrow = isUpper ? ArrowUpRight : ArrowDownRight;

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
              delay: isUpper ? 0 : 0.4,
            }
          : { duration: 0.2 }
      }
      className={cn(
        'flex min-h-[76px] flex-1 flex-col rounded-xl px-4 py-3 text-left transition-opacity',
        isUpper ? 'bg-semantic-win' : 'bg-semantic-loss',
        'text-on-prominent-static-inverse',
        disabled && !selected && 'opacity-40',
        disabled && selected && 'ring-2 ring-border-prominent ring-offset-2 ring-offset-card',
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
  touchRate,
  upperRate,
  n,
}: {
  touchRate: number;
  upperRate: number;
  n: number;
}) {
  if (n === 0) {
    return (
      <p className="px-4 py-2 text-xs text-on-subtle text-center">
        Touch stats appear after your first round
      </p>
    );
  }

  return (
    <div className="flex items-center justify-center gap-4 px-4 py-2 text-xs text-on-subtle">
      <span>
        Last {n} rounds:{' '}
        <span className="font-semibold text-on-prominent tabular-nums">
          {(touchRate * 100).toFixed(0)}%
        </span>{' '}
        touched
      </span>
      <span className="text-border-subtle">/</span>
      <span>
        <span className="font-semibold text-semantic-win tabular-nums">
          {(upperRate * 100).toFixed(0)}%
        </span>{' '}
        broke upward
      </span>
    </div>
  );
}

export function BarrierPredictorGame() {
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
    playError,
    barrierFlash,
    balance,
    maxStake,
    canTrade,
    windowStats,
    pricing,
    spot,
    idleBarriers,
    previewPrices,
    ticksLeft,
    startRound,
    dismissResult,
    playAgain,
  } = useBarrierPredictor();

  const idle = phase === 'idle';
  const running = phase === 'running';
  const settled = phase === 'settled';
  const showOverlay = settled && result !== null;

  // Barriers: live preview around the drifting spot while idle, locked to the
  // contract while a round is in play.
  const upper = path ? path.upper : idleBarriers.upper;
  const lower = path ? path.lower : idleBarriers.lower;
  const entrySpot = path ? path.entrySpot : spot;

  const potentialPayout = Math.round(stake * pricing.multiplier);

  const resultTitle =
    result?.outcome === 'win'
      ? `${BARRIER_LABELS[result.pick].name} touched first`
      : result?.outcome === 'lose'
        ? `${BARRIER_LABELS[result.touched === 'upper' ? 'upper' : 'lower'].name} touched first`
        : 'No touch — stake refunded';

  const resultSubtitle =
    result?.outcome === 'win'
      ? `Paid at ${result.multiplier.toFixed(2)}× on tick ${result.settleTick}`
      : result?.outcome === 'lose'
        ? `The price broke the other way on tick ${result.settleTick}`
        : 'The price never left the corridor';

  const resultTier =
    result?.outcome === 'win' ? 'win' : result?.outcome === 'lose' ? 'loss' : 'push';

  return (
    <GameShell infoSections={INFO_SECTIONS} showSymbolPicker={false}>
      <GameViewport
        market={<OutcomeStrip {...windowStats} />}
        play={
          <div className="flex flex-col flex-1 min-h-0">
            {playError ? (
              <div className="px-4 pt-3">
                <GameNotice tone="danger">{playError}</GameNotice>
              </div>
            ) : null}

            {/* Full-bleed play surface — the corridor chart is the star */}
            <div className="relative flex-1 min-h-[220px]">
              <PredictorChart
                path={path}
                visibleTick={visibleTick}
                previewPrices={previewPrices}
                upper={upper}
                lower={lower}
                entrySpot={entrySpot}
                barrierFlash={barrierFlash}
                touched={path?.touched ?? null}
              />

              {running && ticksLeft !== null ? (
                <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2">
                  <span className="rounded-full border border-border-subtle bg-card/90 px-3 py-1 text-xs font-semibold text-on-prominent backdrop-blur-sm tabular-nums">
                    {ticksLeft > 0
                      ? `${ticksLeft} tick${ticksLeft === 1 ? '' : 's'} left`
                      : 'Settling…'}
                    {pick ? ` — you picked ${BARRIER_LABELS[pick].name}` : ''}
                  </span>
                </div>
              ) : null}
            </div>

            {/* Trade surface: settings + pick buttons under the chart edge */}
            <div className="shrink-0 space-y-2 p-4 pt-2">
              {idle ? (
                <>
                  <div className="flex gap-2">
                    <DurationPicker ticks={ticks} onChange={setTicks} disabled={!canTrade} />
                    <DistancePicker
                      distanceId={distanceId}
                      onChange={setDistanceId}
                      disabled={!canTrade}
                    />
                  </div>
                  <p className="text-center text-xs text-on-subtle tabular-nums">
                    {(pricing.pTouch * 100).toFixed(0)}% of rounds touch a barrier —
                    the rest refund your stake
                  </p>
                </>
              ) : null}
              <div className="flex gap-2">
                <PickButton
                  side="upper"
                  multiplier={pricing.multiplier}
                  payout={potentialPayout}
                  selected={pick === 'upper'}
                  disabled={!idle || !canTrade}
                  idle={idle && canTrade}
                  onSelect={() => startRound('upper')}
                />
                <PickButton
                  side="lower"
                  multiplier={pricing.multiplier}
                  payout={potentialPayout}
                  selected={pick === 'lower'}
                  disabled={!idle || !canTrade}
                  idle={idle && canTrade}
                  onSelect={() => startRound('lower')}
                />
              </div>
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
                ? 'Tap a barrier above to start'
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
        title={resultTitle}
        subtitle={resultSubtitle}
        amount={
          result?.outcome === 'win'
            ? result.netPL
            : result?.outcome === 'lose'
              ? result.stake
              : undefined
        }
        amountLabel="credits"
        tier={resultTier}
        onDismiss={dismissResult}
        autoDismissMs={5000}
        showAutoDismissBar
        primaryAction={{ label: 'Predict again', onClick: playAgain }}
      />
    </GameShell>
  );
}
