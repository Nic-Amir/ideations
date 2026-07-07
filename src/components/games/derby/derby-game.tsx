'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Play, RotateCcw, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GameShell } from '@/components/games/shared/game-shell';
import { GameViewport, GameNotice } from '@/components/games/shared/game-layout';
import { StakeDock } from '@/components/games/shared/stake-dock';
import { ResultOverlay } from '@/components/games/shared/result-overlay';
import type { GameInfoSection } from '@/components/games/shared/game-info-drawer';
import { RaceTrack, LeaderboardStrip } from '@/components/games/derby/race-track';
import { DerbyChart } from '@/components/games/derby/derby-chart';
import { useDerby, type DerbyResult } from '@/hooks/use-derby';
import {
  BET_MODES,
  getBetModeSpec,
  type BetMode,
  type RaceCard,
} from '@/lib/games/derby';

const INFO_SECTIONS: GameInfoSection[] = [
  {
    id: 'how',
    label: 'How it works',
    content: (
      <div className="space-y-2 text-sm text-on-subtle">
        <p>
          Sixteen virtual horses, each a synthetic asset following its own
          calibrated price process, race from the same starting price of 100.
          When time runs out, the finish order is simply the ranking of the
          final prices — highest price wins.
        </p>
        <p>
          Every race draws a fresh card: each horse gets its own drift and
          volatility, so favorites and longshots change from race to race. The
          odds board updates accordingly before you bet.
        </p>
      </div>
    ),
  },
  {
    id: 'bets',
    label: 'Bet types',
    content: (
      <div className="space-y-2 text-sm text-on-subtle">
        <p>
          <span className="font-semibold text-on-prominent">Winner</span> — one
          horse to finish first.{' '}
          <span className="font-semibold text-on-prominent">Place</span> — one
          horse to finish in the top 3.
        </p>
        <p>
          <span className="font-semibold text-on-prominent">Couple</span>,{' '}
          <span className="font-semibold text-on-prominent">Trio</span> and{' '}
          <span className="font-semibold text-on-prominent">Quinté</span> — pick
          2, 3 or 5 horses to fill the top spots. Ordered means your picks must
          finish in the exact order you chose them; unordered pays if they fill
          the top spots in any order. Ordered exotics on longshots can pay
          thousands of times your stake.
        </p>
      </div>
    ),
  },
  {
    id: 'horses',
    label: 'The horses',
    content: (
      <div className="space-y-2 text-sm text-on-subtle">
        <p>
          Each horse&apos;s price follows geometric Brownian motion with its own
          drift (trend strength) and volatility (wildness). The form tag hints
          at the mix: Front-runners trend hard, Erratic horses swing widely —
          dangerous but capable of anything — and Steady types keep a tight
          line.
        </p>
        <p>
          All parameters are known the moment the card is drawn, which is what
          lets the game quote exact odds for every bet before the race runs.
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
          Because the terminal prices are independent log-normal variables,
          every event probability — a win, a top-3 finish, an exact quinté
          order — is computed exactly by numerical integration, not simulation.
          Monte Carlo tests validate the model to within statistical noise.
        </p>
        <p className="font-semibold text-on-prominent">
          Proof-of-concept note: odds are fair (multiplier = 1 ÷ probability)
          with no commission built in. A production version would apply the
          platform&apos;s standard margin.
        </p>
      </div>
    ),
  },
];

function ModePicker({
  mode,
  onChange,
  disabled,
}: {
  mode: BetMode;
  onChange: (mode: BetMode) => void;
  disabled: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Bet type"
      className="flex rounded-lg border border-border-subtle bg-subtle p-0.5"
    >
      {BET_MODES.map((spec) => (
        <button
          key={spec.id}
          type="button"
          role="radio"
          aria-checked={mode === spec.id}
          disabled={disabled}
          onClick={() => onChange(spec.id)}
          className={cn(
            'flex-1 rounded-md px-1 py-1.5 text-xs font-semibold transition-colors min-h-[32px]',
            mode === spec.id
              ? 'bg-prominent text-on-prominent shadow-sm'
              : 'text-on-subtle hover:text-on-prominent',
          )}
        >
          {spec.label}
        </button>
      ))}
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
    <div
      role="radiogroup"
      aria-label="Order requirement"
      className="flex flex-1 rounded-lg border border-border-subtle bg-subtle p-0.5"
    >
      {[
        { value: false, label: 'Any order' },
        { value: true, label: 'Exact order' },
      ].map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          role="radio"
          aria-checked={ordered === opt.value}
          disabled={disabled}
          onClick={() => onChange(opt.value)}
          className={cn(
            'flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors min-h-[32px]',
            ordered === opt.value
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

/** Numbered slots showing the current selection in pick order. */
function SelectionSlots({
  card,
  selection,
  picks,
  ordered,
}: {
  card: RaceCard;
  selection: number[];
  picks: number;
  ordered: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: picks }, (_, i) => {
        const horse = selection[i];
        const filled = horse !== undefined;
        return (
          <div
            key={i}
            className={cn(
              'flex h-8 flex-1 items-center justify-center gap-1 rounded-lg border text-xs font-semibold',
              filled
                ? 'border-border-prominent bg-subtle text-on-prominent'
                : 'border-dashed border-border-subtle text-on-subtle',
            )}
          >
            {ordered ? <span className="text-on-subtle">{i + 1}.</span> : null}
            {filled ? (
              <>
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: card.horses[horse].silks }}
                />
                <span className="max-w-[72px] truncate">{card.horses[horse].name}</span>
              </>
            ) : (
              <span>Pick</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function OutcomeStrip({
  n,
  hitRate,
  bestPayout,
}: {
  n: number;
  hitRate: number;
  bestPayout: number;
}) {
  if (n === 0) {
    return (
      <p className="px-4 py-2 text-xs text-on-subtle text-center">
        Race stats appear after your first bet
      </p>
    );
  }
  return (
    <div className="flex items-center justify-center gap-4 px-4 py-2 text-xs text-on-subtle">
      <span>
        Last {n} bets:{' '}
        <span className="font-semibold text-on-prominent tabular-nums">
          {(hitRate * 100).toFixed(0)}%
        </span>{' '}
        landed
      </span>
      {bestPayout > 0 ? (
        <>
          <span className="text-border-subtle">/</span>
          <span>
            Best hit{' '}
            <span className="font-semibold text-semantic-win tabular-nums">
              {bestPayout.toFixed(2)}×
            </span>
          </span>
        </>
      ) : null}
    </div>
  );
}

function resultCopy(result: DerbyResult, card: RaceCard): { title: string; subtitle: string } {
  const winnerName = card.horses[result.finishOrder[0]].name;
  const spec = getBetModeSpec(result.pick.mode);
  const modeName = result.pick.ordered ? `ordered ${spec.label}` : spec.label;

  if (result.outcome === 'win') {
    return {
      title: `${winnerName} takes it`,
      subtitle: `Your ${modeName.toLowerCase()} landed — paid ${result.multiplier.toFixed(2)}×`,
    };
  }

  if (result.pick.mode === 'winner' || result.pick.mode === 'place') {
    const horse = result.pick.horses[0];
    const finished = result.finishOrder.indexOf(horse) + 1;
    return {
      title: `${winnerName} takes it`,
      subtitle: `${card.horses[horse].name} finished ${ordinal(finished)} — your ${modeName.toLowerCase()} missed`,
    };
  }

  const hits = result.pick.horses.filter((h) =>
    result.finishOrder.slice(0, spec.picks).includes(h),
  ).length;
  return {
    title: `${winnerName} takes it`,
    subtitle:
      hits > 0
        ? `${hits} of ${spec.picks} picks placed — the ${modeName.toLowerCase()} needed all of them${result.pick.ordered ? ', in order' : ''}`
        : `None of your picks made the top ${spec.picks}`,
  };
}

function ordinal(n: number): string {
  const suffix =
    n % 100 >= 11 && n % 100 <= 13
      ? 'th'
      : n % 10 === 1
        ? 'st'
        : n % 10 === 2
          ? 'nd'
          : n % 10 === 3
            ? 'rd'
            : 'th';
  return `${n}${suffix}`;
}

export function DerbyGame() {
  const {
    card,
    mode,
    setMode,
    ordered,
    setOrdered,
    spec,
    selection,
    toggleHorse,
    clearSelection,
    selectionComplete,
    pricing,
    stake,
    setStake,
    phase,
    pick,
    path,
    visibleTick,
    result,
    playError,
    balance,
    maxStake,
    canTrade,
    windowStats,
    ticksLeft,
    inFinalStretch,
    liveRanks,
    newRace,
    startRace,
    dismissResult,
  } = useDerby();

  /** Race view: price chart (the trading view, default) or track lanes. */
  const [view, setView] = useState<'chart' | 'track'>('chart');

  const idle = phase === 'idle';
  const running = phase === 'running';
  const settled = phase === 'settled';
  const showOverlay = settled && result !== null;
  const finished = running && ticksLeft === 0;

  const pickedHorses = pick?.horses ?? selection;
  const showChart = !idle && path !== null && view === 'chart';

  const copy = result ? resultCopy(result, card) : { title: '', subtitle: '' };
  const potentialPayout =
    pricing !== null ? Math.round(stake * pricing.multiplier) : 0;

  const finishTop5 = result
    ? result.finishOrder
        .slice(0, 5)
        .map((h, i) => `${i + 1}. ${card.horses[h].name}`)
        .join('  ·  ')
    : '';

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

            {/* Full-bleed play surface — odds board while idle, price chart
                (or track lanes) once the race is on */}
            <div className="relative flex-1 min-h-[300px]">
              {showChart && path ? (
                <div className="flex h-full flex-col">
                  <LeaderboardStrip
                    card={card}
                    liveRanks={liveRanks}
                    selection={pickedHorses}
                    statusLabel={finished || settled ? 'Finish' : 'Live'}
                  />
                  <DerbyChart
                    card={card}
                    path={path}
                    visibleTick={visibleTick}
                    pickedHorses={pickedHorses}
                    liveRanks={liveRanks}
                    finished={finished || settled}
                    className="flex-1 min-h-0"
                  />
                </div>
              ) : (
                <RaceTrack
                  card={card}
                  path={path}
                  visibleTick={visibleTick}
                  liveRanks={liveRanks}
                  selection={pickedHorses}
                  onToggleHorse={toggleHorse}
                  selectable={idle}
                  inFinalStretch={inFinalStretch}
                  finished={finished || settled}
                />
              )}

              {/* Chart/Track view toggle, once there is a race to look at */}
              {!idle && path ? (
                <div className="absolute right-2 top-1.5 flex rounded-lg border border-border-subtle bg-card/90 p-0.5 backdrop-blur-sm">
                  {(['chart', 'track'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setView(v)}
                      aria-pressed={view === v}
                      className={cn(
                        'rounded-md px-2 py-0.5 text-[10px] font-semibold transition-colors',
                        view === v
                          ? 'bg-prominent text-on-prominent shadow-sm'
                          : 'text-on-subtle hover:text-on-prominent',
                      )}
                    >
                      {v === 'chart' ? 'Chart' : 'Track'}
                    </button>
                  ))}
                </div>
              ) : null}

              {running && ticksLeft !== null ? (
                <div className="pointer-events-none absolute left-1/2 top-9 -translate-x-1/2">
                  <span
                    className={cn(
                      'rounded-full border border-border-subtle bg-card/90 px-3 py-1 text-xs font-semibold backdrop-blur-sm tabular-nums',
                      inFinalStretch
                        ? 'border-semantic-warning text-semantic-warning'
                        : 'text-on-prominent',
                    )}
                  >
                    {ticksLeft > 0
                      ? inFinalStretch
                        ? `Final stretch — ${ticksLeft} tick${ticksLeft === 1 ? '' : 's'}`
                        : `${ticksLeft} ticks to the line`
                      : 'Photo finish…'}
                  </span>
                </div>
              ) : null}
            </div>

            {/* Bet slip under the track */}
            <div className="shrink-0 space-y-2 p-4 pt-2">
              {idle ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="w-4 shrink-0 text-center text-[10px] font-bold text-on-subtle">
                      1
                    </span>
                    <div className="flex-1">
                      <ModePicker mode={mode} onChange={setMode} disabled={!idle} />
                    </div>
                    <button
                      type="button"
                      onClick={newRace}
                      aria-label="Draw a new race card"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-subtle text-on-subtle transition-colors hover:text-on-prominent"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {spec.orderable ? (
                    <div className="flex items-center gap-2">
                      <span className="w-4 shrink-0" aria-hidden />
                      <OrderToggle
                        ordered={ordered}
                        onChange={setOrdered}
                        disabled={!idle}
                      />
                    </div>
                  ) : null}

                  <div className="flex items-center gap-2">
                    <span className="w-4 shrink-0 text-center text-[10px] font-bold text-on-subtle">
                      2
                    </span>
                    <div className="flex-1">
                      <SelectionSlots
                        card={card}
                        selection={selection}
                        picks={spec.picks}
                        ordered={spec.orderable && ordered}
                      />
                    </div>
                    {selection.length > 0 ? (
                      <button
                        type="button"
                        onClick={clearSelection}
                        aria-label="Clear selection"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-subtle text-on-subtle transition-colors hover:text-on-prominent"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                </>
              ) : null}

              {/* Start CTA / locked-bet summary */}
              {idle ? (
                selectionComplete ? (
                  <motion.button
                    type="button"
                    disabled={!canTrade}
                    onClick={startRace}
                    animate={canTrade ? { scale: [1, 1.015, 1] } : { scale: 1 }}
                    transition={
                      canTrade
                        ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }
                        : { duration: 0.2 }
                    }
                    className={cn(
                      'flex min-h-[60px] w-full items-center justify-between rounded-xl px-4 py-2',
                      'bg-semantic-win text-on-prominent-static-inverse shadow-lg',
                      !canTrade && 'opacity-40',
                      canTrade && 'active:scale-[0.98]',
                    )}
                  >
                    <span className="flex items-center gap-2 font-display text-base font-bold">
                      <Play className="h-5 w-5 fill-current" />
                      Start race
                      <span className="text-xs font-semibold opacity-80">
                        {spec.label}
                        {spec.orderable && ordered ? ' · exact order' : ''}
                      </span>
                    </span>
                    {pricing !== null ? (
                      <span className="text-right">
                        <span className="font-display text-xl font-bold tabular-nums">
                          {pricing.multiplier >= 1000
                            ? `${Math.round(pricing.multiplier).toLocaleString()}×`
                            : `${pricing.multiplier.toFixed(2)}×`}
                        </span>
                        <span className="block text-[10px] tabular-nums opacity-90">
                          Pays {potentialPayout.toLocaleString()}
                        </span>
                      </span>
                    ) : null}
                  </motion.button>
                ) : (
                  <div className="flex min-h-[60px] w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-subtle px-4 py-2 text-sm font-semibold text-on-subtle">
                    <span className="w-4 shrink-0 text-center text-[10px] font-bold">3</span>
                    Pick {spec.picks - selection.length} more horse
                    {spec.picks - selection.length === 1 ? '' : 's'} on the board
                    above, then start the race here
                  </div>
                )
              ) : (
                <div className="flex min-h-[44px] w-full items-center justify-between rounded-xl border border-border-subtle bg-subtle px-4 py-2">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-on-prominent">
                    {running ? 'Racing —' : 'Finished —'} {spec.label}
                    {spec.orderable && ordered ? ' (exact order)' : ''}
                    <span className="flex items-center gap-0.5">
                      {pickedHorses.map((h) => (
                        <span
                          key={h}
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: card.horses[h].silks }}
                        />
                      ))}
                    </span>
                  </span>
                  {pricing !== null ? (
                    <span className="text-xs font-bold tabular-nums text-on-prominent">
                      {pricing.multiplier >= 1000
                        ? `${Math.round(pricing.multiplier).toLocaleString()}×`
                        : `${pricing.multiplier.toFixed(2)}×`}
                    </span>
                  ) : null}
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
                ? selectionComplete
                  ? canTrade
                    ? 'Fair odds — no commission (POC)'
                    : 'Stake exceeds balance — lower it to start'
                  : 'Tap horses on the board to build your bet'
                : running
                  ? 'Race in progress'
                  : undefined
            }
          />
        }
      />

      <ResultOverlay
        open={showOverlay}
        won={result?.outcome === 'win'}
        title={copy.title}
        subtitle={result ? `${copy.subtitle} — ${finishTop5}` : copy.subtitle}
        amount={result?.outcome === 'win' ? result.netPL : result?.stake}
        amountLabel="credits"
        tier={result?.outcome === 'win' ? 'win' : 'loss'}
        onDismiss={dismissResult}
        autoDismissMs={6000}
        showAutoDismissBar
        primaryAction={{ label: 'Next race', onClick: dismissResult }}
      />
    </GameShell>
  );
}
