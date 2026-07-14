'use client';

import { useState } from 'react';
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
  type BetModeSpec,
  type BetMode,
  type PickPricing,
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
            'flex-1 rounded-md px-1 py-1.5 text-[11px] font-semibold transition-colors min-h-[44px]',
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
            'flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors min-h-[40px]',
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
              'flex h-10 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg border px-1 text-[11px] font-semibold',
              filled
                ? 'border-border-prominent bg-subtle text-on-prominent'
                : 'border-border-subtle bg-prominent text-on-subtle',
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

function SportsbookSlip({
  card,
  spec,
  selection,
  ordered,
  pricing,
  stake,
  canTrade,
  onClear,
  onStart,
}: {
  card: RaceCard;
  spec: BetModeSpec;
  selection: number[];
  ordered: boolean;
  pricing: PickPricing | null;
  stake: number;
  canTrade: boolean;
  onClear: () => void;
  onStart: () => void;
}) {
  const remaining = spec.picks - selection.length;
  const returnAmount = pricing ? Math.round(stake * pricing.multiplier) : 0;
  const netProfit = Math.max(0, returnAmount - stake);

  return (
    <div className="mx-4 mb-2 shrink-0 rounded-xl border border-border-subtle bg-subtle/50 p-3 shadow-sm">
      <div className="mb-2 flex min-h-[32px] items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-on-subtle">Bet slip</p>
          <p className="text-xs font-semibold text-on-prominent">
            {spec.label}{spec.orderable && ordered ? ' · exact order' : ''}
            <span className="ml-1 font-normal text-on-subtle">{selection.length}/{spec.picks} selected</span>
          </p>
        </div>
        {selection.length > 0 ? (
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

      <SelectionSlots
        card={card}
        selection={selection}
        picks={spec.picks}
        ordered={spec.orderable && ordered}
      />

      {remaining > 0 ? (
        <p className="mt-2 text-center text-xs text-on-subtle">
          Select {remaining} more runner{remaining === 1 ? '' : 's'} from the market above.
        </p>
      ) : pricing ? (
        <>
          <div className="mt-2 grid grid-cols-3 gap-2 rounded-lg bg-prominent px-3 py-2 text-center">
            <div>
              <p className="text-[9px] uppercase tracking-wide text-on-subtle">Odds</p>
              <p className="font-display text-sm font-bold tabular-nums text-on-prominent">
                {pricing.multiplier >= 1000
                  ? `${Math.round(pricing.multiplier).toLocaleString()}×`
                  : `${pricing.multiplier.toFixed(2)}×`}
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
            disabled={!canTrade}
            onClick={onStart}
            className={cn(
              'mt-2 flex min-h-[52px] w-full items-center justify-between rounded-xl bg-primary px-4 text-on-prominent-static-inverse',
              !canTrade && 'opacity-40',
              canTrade && 'active:scale-[0.98]',
            )}
          >
            <span className="flex items-center gap-2 font-display text-base font-bold">
              <Play className="h-5 w-5 fill-current" />
              Start race
            </span>
            <span className="text-right text-xs font-semibold tabular-nums">
              Stake {stake.toLocaleString()}
              <span className="block text-[10px] opacity-80">Return {returnAmount.toLocaleString()}</span>
            </span>
          </button>
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

function FinishDetails({ card, result }: { card: RaceCard; result: DerbyResult }) {
  const topFive = result.finishOrder.slice(0, 5);
  const pickedOutsideTopFive = result.pick.horses.filter((horse) => !topFive.includes(horse));

  const finishRow = (horse: number, position: number, isPlayerPick: boolean) => (
    <div
      key={`${position}-${horse}`}
      className={cn(
        'grid grid-cols-[24px_12px_1fr_auto] items-center gap-2 rounded-md px-2 py-1.5 text-xs',
        isPlayerPick ? 'bg-primary/10 text-on-prominent' : 'bg-subtle text-on-subtle',
      )}
    >
      <span className="font-display font-bold tabular-nums">{position}</span>
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: card.horses[horse].silks }} />
      <span className="truncate font-medium">{card.horses[horse].name}</span>
      {isPlayerPick ? <span className="text-[9px] font-bold uppercase tracking-wide text-primary">Your pick</span> : null}
    </div>
  );

  return (
    <div className="max-h-[min(300px,35vh)] space-y-2 overflow-y-auto pr-1 text-left">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-on-subtle">Top five finish</p>
      <div className="space-y-1">
        {topFive.map((horse, index) => finishRow(horse, index + 1, result.pick.horses.includes(horse)))}
      </div>
      {pickedOutsideTopFive.length > 0 ? (
        <div className="border-t border-border-subtle pt-2">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-on-subtle">Your remaining picks</p>
          <div className="space-y-1">
            {pickedOutsideTopFive.map((horse) =>
              finishRow(horse, result.finishOrder.indexOf(horse) + 1, true),
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
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
  const boardOdds = mode === 'place' ? card.placeOdds : card.winOdds;
  const boardOddsLabel =
    mode === 'place' ? 'Place odds' : mode === 'winner' ? 'Win odds' : 'Win ref.';
  const raceProgress = Math.min(100, (visibleTick / card.ticks) * 100);

  const drawNewRace = () => {
    setView('chart');
    newRace();
  };

  const showNextRace = () => {
    setView('chart');
    dismissResult();
  };

  return (
    <GameShell infoSections={INFO_SECTIONS} showSymbolPicker={false}>
      <GameViewport
        market={<OutcomeStrip {...windowStats} />}
        play={
          <div
            className={cn(
              'flex flex-1 min-h-0 flex-col',
              idle ? 'scrollbar-hide overflow-y-auto' : 'overflow-hidden',
            )}
          >
            {playError ? (
              <div className="px-4 pt-3">
                <GameNotice tone="danger">{playError}</GameNotice>
              </div>
            ) : null}

            {idle ? (
              <div className="shrink-0 space-y-2 border-b border-border-subtle px-4 py-2">
                <div className="flex min-h-[44px] items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-on-subtle">Market</p>
                    <p className="truncate text-sm font-semibold text-on-prominent">{spec.label} · {spec.tag}</p>
                  </div>
                  <button
                    type="button"
                    onClick={drawNewRace}
                    aria-label="Draw a new race card"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-subtle text-on-subtle transition-colors hover:text-on-prominent"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                </div>
                <ModePicker mode={mode} onChange={setMode} disabled={!idle} />
                {spec.orderable ? (
                  <div className="flex items-center gap-2">
                    <span className="w-12 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-on-subtle">Order</span>
                    <OrderToggle ordered={ordered} onChange={setOrdered} disabled={!idle} />
                  </div>
                ) : null}
              </div>
            ) : null}

            {!idle && path ? (
              <div className="shrink-0 border-b border-border-subtle px-3 pt-1.5 pb-2">
                <LeaderboardStrip
                  card={card}
                  liveRanks={liveRanks}
                  selection={pickedHorses}
                  statusLabel={finished || settled ? 'Finish' : 'Live'}
                />
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between text-[10px] font-semibold text-on-subtle tabular-nums">
                      <span>{inFinalStretch && !settled ? 'Final stretch' : settled ? 'Race complete' : `Tick ${visibleTick}/${card.ticks}`}</span>
                      <span>{ticksLeft !== null && ticksLeft > 0 ? `${ticksLeft} to go` : 'Photo finish'}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-border-subtle">
                      <div
                        className={cn('h-full rounded-full transition-[width] duration-200', inFinalStretch ? 'bg-semantic-warning' : 'bg-primary')}
                        style={{ width: `${raceProgress}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex shrink-0 rounded-lg border border-border-subtle bg-subtle p-0.5">
                    {(['chart', 'track'] as const).map((nextView) => (
                      <button
                        key={nextView}
                        type="button"
                        onClick={() => setView(nextView)}
                        aria-pressed={view === nextView}
                        className={cn(
                          'min-h-[36px] rounded-md px-3 text-[10px] font-semibold capitalize transition-colors',
                          view === nextView ? 'bg-prominent text-on-prominent shadow-sm' : 'text-on-subtle hover:text-on-prominent',
                        )}
                      >
                        {nextView}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {/* Full-bleed play surface — odds board while idle, price chart
                (or track lanes) once the race is on */}
            <div
              className={cn(
                'relative flex-1',
                idle
                  ? 'min-h-[220px]'
                  : 'mx-3 my-2 min-h-[280px] overflow-hidden rounded-xl border border-border-subtle bg-subtle/20',
              )}
            >
              {showChart && path ? (
                <div className="flex h-full flex-col">
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
                  mode={mode}
                  odds={boardOdds}
                  oddsLabel={boardOddsLabel}
                />
              )}
            </div>

            {idle ? (
              <SportsbookSlip
                card={card}
                spec={spec}
                selection={selection}
                ordered={ordered}
                pricing={pricing}
                stake={stake}
                canTrade={canTrade}
                onClear={clearSelection}
                onStart={startRace}
              />
            ) : (
              <div className="mx-4 mb-2 shrink-0 rounded-xl border border-border-subtle bg-subtle/60 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-on-subtle">Locked position</p>
                    <p className="truncate text-xs font-semibold text-on-prominent">
                      {spec.label}{spec.orderable && ordered ? ' · exact order' : ''}
                    </p>
                  </div>
                  {pricing ? (
                    <span className="font-display text-sm font-bold tabular-nums text-on-prominent">
                      {pricing.multiplier >= 1000
                        ? `${Math.round(pricing.multiplier).toLocaleString()}×`
                        : `${pricing.multiplier.toFixed(2)}×`}
                    </span>
                  ) : null}
                </div>
                <div className="scrollbar-hide mt-2 flex gap-1.5 overflow-x-auto">
                  {pickedHorses.map((horse, index) => (
                    <span key={horse} className="flex shrink-0 items-center gap-1.5 rounded-full border border-border-subtle bg-prominent px-2 py-1 text-[10px] font-semibold text-on-prominent">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: card.horses[horse].silks }} />
                      {spec.orderable ? `${index + 1}. ` : ''}{card.horses[horse].name}
                      <span className="text-on-subtle">#{liveRanks.indexOf(horse) + 1}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
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
        subtitle={copy.subtitle}
        amount={result?.outcome === 'win' ? result.netPL : result?.stake}
        amountLabel={result?.outcome === 'win' ? 'net' : 'lost'}
        tier={result?.outcome === 'win' ? 'win' : 'loss'}
        onDismiss={showNextRace}
        details={result ? <FinishDetails card={card} result={result} /> : undefined}
        primaryAction={{ label: 'Next race', onClick: showNextRace }}
      />
    </GameShell>
  );
}
