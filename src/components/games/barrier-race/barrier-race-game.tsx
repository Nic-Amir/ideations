'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { GameShell } from '@/components/games/shared/game-shell';
import { GameViewport, GameNotice } from '@/components/games/shared/game-layout';
import { StakeDock } from '@/components/games/shared/stake-dock';
import { ResultOverlay } from '@/components/games/shared/result-overlay';
import type { GameInfoSection } from '@/components/games/shared/game-info-drawer';
import { RaceChart } from '@/components/games/barrier-race/race-chart';
import { useBarrierRace, type RaceMode } from '@/hooks/use-barrier-race';
import {
  ASSET_LABELS,
  deriveParams,
  type AssetId,
} from '@/lib/games/barrier-race';

const INFO_SECTIONS: GameInfoSection[] = [
  {
    id: 'how',
    label: 'How it works',
    content: (
      <p className="text-sm text-on-subtle">
        Two simulated assets race toward a shared price barrier. Pick which one
        touches the target first. The race settles the instant a barrier is
        breached.
      </p>
    ),
  },
  {
    id: 'assets',
    label: 'Assets',
    content: (
      <p className="text-sm text-on-subtle">
        Drift is the steady favorite — high drift, low volatility. Vol is the
        underdog — lower drift but bigger jumps. They are negatively correlated,
        so when one surges the other tends to fall back.
      </p>
    ),
  },
  {
    id: 'payouts',
    label: 'Payouts',
    content: (
      <p className="text-sm text-on-subtle">
        Drift pays 1.50×, Vol pays 2.61×. If both assets touch the barrier on
        the same tick, or neither reaches it in time, your stake is refunded.
      </p>
    ),
  },
  {
    id: 'pricing',
    label: 'Pricing',
    content: (
      <p className="text-sm text-on-subtle">
        Odds are derived from a numerical grid model (validated by Monte Carlo).
        A 3% commission is built into the offered multipliers.
      </p>
    ),
  },
  {
    id: 'cashout',
    label: 'Cash-out',
    content: (
      <div className="space-y-2 text-sm text-on-subtle">
        <p>
          In cash-out mode you can sell your position mid-race. Every tick the
          game re-prices your bet by simulating thousands of race continuations
          from the current prices, then offers that value minus a 3% fee.
        </p>
        <p>
          The offer swings with the race — lock in profit when your asset pulls
          ahead, or salvage part of your stake when it falls behind. After you
          cash out, the rest of the race replays quickly so you can see what
          holding would have paid.
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
  mode: RaceMode;
  onChange: (mode: RaceMode) => void;
  disabled: boolean;
}) {
  const options: { id: RaceMode; label: string }[] = [
    { id: 'classic', label: 'Classic' },
    { id: 'cashout', label: 'Cash-out' },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Race mode"
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

/**
 * Digits-style trade button: the pick, odds and payout live on one large
 * colored surface. This is the game's single trade gesture.
 */
function PickButton({
  asset,
  odds,
  payout,
  selected,
  disabled,
  idle,
  onSelect,
}: {
  asset: AssetId;
  odds: number;
  payout: number;
  selected: boolean;
  disabled: boolean;
  idle: boolean;
  onSelect: () => void;
}) {
  const { name, tag } = ASSET_LABELS[asset];
  const isDrift = asset === 'drift';

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
              delay: isDrift ? 0 : 0.4,
            }
          : { duration: 0.2 }
      }
      className={cn(
        'flex min-h-[76px] flex-1 flex-col rounded-xl px-4 py-3 text-left transition-opacity',
        isDrift ? 'bg-primary' : 'bg-semantic-info',
        'text-on-prominent-static-inverse',
        disabled && !selected && 'opacity-40',
        disabled && selected && 'ring-2 ring-border-prominent ring-offset-2 ring-offset-card',
        !disabled && 'active:scale-[0.98]',
      )}
    >
      <div className="flex w-full items-baseline justify-between gap-2">
        <span className="font-display text-base font-bold">{name}</span>
        <span className="font-display text-xl font-bold tabular-nums">
          {odds.toFixed(2)}×
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

// Starting distance per asset (spec's d/s: ~4.95σ for Drift, ~3.30σ for Vol),
// used to normalize the live rails so both start visually "full distance".
const START_DISTANCES = (() => {
  const { vol, logBarrier, logS0 } = deriveParams();
  return {
    drift: (logBarrier - logS0[0]) / vol[0],
    vol: (logBarrier - logS0[1]) / vol[1],
  };
})();

function DistanceRail({
  asset,
  sigma,
  isPick,
}: {
  asset: AssetId;
  sigma: number;
  isPick: boolean;
}) {
  const start = START_DISTANCES[asset];
  const progress = Math.min(Math.max(1 - sigma / start, 0), 1);
  const touched = sigma <= 0;
  const isDrift = asset === 'drift';

  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          'w-8 shrink-0 text-[10px] font-semibold',
          isDrift ? 'text-primary' : 'text-semantic-info',
          isPick && 'underline underline-offset-2',
        )}
      >
        {ASSET_LABELS[asset].name}
      </span>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-border-subtle/60">
        <div
          className={cn(
            'absolute inset-y-0 left-0 rounded-full transition-[width] duration-150',
            isDrift ? 'bg-primary' : 'bg-semantic-info',
          )}
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      <span className="w-12 shrink-0 text-right text-[10px] text-on-subtle tabular-nums">
        {touched ? 'Touch!' : `${sigma.toFixed(1)}σ`}
      </span>
    </div>
  );
}

function WinRateStrip({
  drift,
  vol,
  n,
}: {
  drift: number;
  vol: number;
  n: number;
}) {
  if (n === 0) {
    return (
      <p className="px-4 py-2 text-xs text-on-subtle text-center">
        Win-rate stats appear after your first race
      </p>
    );
  }

  return (
    <div className="flex items-center justify-center gap-4 px-4 py-2 text-xs text-on-subtle">
      <span>
        Last {n} races:{' '}
        <span className="font-semibold text-primary tabular-nums">
          {(drift * 100).toFixed(0)}%
        </span>{' '}
        Drift
      </span>
      <span className="text-border-subtle">/</span>
      <span>
        <span className="font-semibold text-semantic-info tabular-nums">
          {(vol * 100).toFixed(0)}%
        </span>{' '}
        Vol
      </span>
    </div>
  );
}

export function BarrierRaceGame() {
  const {
    stake,
    setStake,
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
    driftOdds,
    volOdds,
    liveDistances,
    mode,
    setMode,
    cashOutOffer,
    cashedOut,
    cashOut,
    barrier,
    startPrice,
    startRace,
    dismissResult,
    raceAgain,
  } = useBarrierRace();

  const idle = phase === 'idle';
  const racing = phase === 'racing';
  const settled = phase === 'settled';
  const showOverlay = settled && result !== null;

  // Leader readout for the on-chart banner.
  const leader = (() => {
    if (!racing || !liveDistances) return null;
    if (liveDistances.drift <= 0 || liveDistances.vol <= 0) return null;
    const asset: AssetId =
      liveDistances.drift <= liveDistances.vol ? 'drift' : 'vol';
    return { asset, sigma: liveDistances[asset] };
  })();

  const nearMissAsset =
    settled && result?.outcome === 'lose' && result.nearMiss?.isNearMiss
      ? result.pick
      : null;

  const cashOutStory = (() => {
    if (result?.outcome !== 'cashout' || !result.counterfactual) return null;
    const { payout: heldPayout, wouldHaveWon } = result.counterfactual;
    const kept = result.payout;
    if (wouldHaveWon) {
      const leftBehind = heldPayout - kept;
      return {
        title: 'Cashed out early',
        subtitle: `${ASSET_LABELS[result.pick].name} went on to win — you left ${leftBehind.toLocaleString()} on the table`,
      };
    }
    if (heldPayout === 0) {
      return {
        title: 'Good call',
        subtitle: `${result.winner === 'drift' || result.winner === 'vol' ? ASSET_LABELS[result.winner].name : 'The other asset'} won the race — holding would have lost your stake`,
      };
    }
    return {
      title: 'Cashed out',
      subtitle: 'The race ended in a refund — holding would have returned your stake',
    };
  })();

  const resultTitle = cashOutStory
    ? cashOutStory.title
    : result?.outcome === 'win'
      ? `${ASSET_LABELS[result.pick].name} wins`
      : result?.outcome === 'tie'
        ? 'Tie — stake refunded'
        : result?.outcome === 'timeout'
          ? 'Timeout — stake refunded'
          : `${ASSET_LABELS[result?.winner === 'vol' ? 'vol' : 'drift'].name ?? 'Other'} wins`;

  const resultSubtitle = cashOutStory
    ? cashOutStory.subtitle
    : result?.outcome === 'win'
      ? `Paid at ${result.multiplier.toFixed(2)}×`
      : result?.outcome === 'lose'
        ? result.nearMiss?.isNearMiss
          ? `So close — ${ASSET_LABELS[result.pick].name} came within ${result.nearMiss.closestGap.toFixed(2)} of the target`
          : 'Better luck on the next race'
        : undefined;

  const resultTier =
    result?.outcome === 'cashout'
      ? result.netPL > 0
        ? 'win'
        : result.netPL === 0
          ? 'push'
          : 'loss'
      : result?.outcome === 'win'
        ? 'win'
        : result?.outcome === 'lose'
          ? 'loss'
          : 'push';

  return (
    <GameShell infoSections={INFO_SECTIONS} showSymbolPicker={false}>
      <GameViewport
        market={<WinRateStrip {...windowStats} />}
        play={
          <div className="flex flex-col flex-1 min-h-0">
            {playError ? (
              <div className="px-4 pt-3">
                <GameNotice tone="danger">{playError}</GameNotice>
              </div>
            ) : null}

            {/* Full-bleed play surface — chart is the star, live state lives on it */}
            <div className="relative mx-3 mt-2 flex-1 min-h-[220px] overflow-hidden rounded-xl border border-border-subtle bg-subtle/30">
              <RaceChart
                path={path}
                visibleTick={visibleTick}
                barrier={barrier}
                startPrice={startPrice}
                barrierFlash={barrierFlash}
                ghost={cashedOut}
                nearMissAsset={nearMissAsset}
              />

              {leader ? (
                <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2">
                  <span
                    className={cn(
                      'rounded-full border border-border-subtle bg-card/90 px-3 py-1 text-xs font-semibold backdrop-blur-sm',
                      leader.asset === 'drift'
                        ? 'text-primary'
                        : 'text-semantic-info',
                    )}
                  >
                    {ASSET_LABELS[leader.asset].name} leads ·{' '}
                    {leader.sigma.toFixed(1)}σ to go
                    {pick === leader.asset ? ' — your pick' : ''}
                  </span>
                </div>
              ) : null}

              {!idle && liveDistances && pick ? (
                <div className="pointer-events-none absolute inset-x-3 bottom-2 space-y-1 rounded-lg border border-border-subtle/60 bg-card/80 px-3 py-2 backdrop-blur-sm">
                  <DistanceRail
                    asset="drift"
                    sigma={liveDistances.drift}
                    isPick={pick === 'drift'}
                  />
                  <DistanceRail
                    asset="vol"
                    sigma={liveDistances.vol}
                    isPick={pick === 'vol'}
                  />
                </div>
              ) : null}

              {mode === 'cashout' && racing ? (
                cashedOut ? (
                  <p className="pointer-events-none absolute inset-x-0 bottom-16 text-center text-xs text-on-subtle">
                    Position sold — replaying how the race ended
                  </p>
                ) : (
                  <div className="absolute inset-x-0 bottom-16 flex justify-center">
                    <button
                      type="button"
                      disabled={cashOutOffer === null}
                      onClick={cashOut}
                      className={cn(
                        'min-h-[44px] rounded-full border px-5 font-display text-sm font-bold tabular-nums shadow-sm backdrop-blur-sm transition-colors',
                        cashOutOffer !== null && cashOutOffer > stake
                          ? 'border-semantic-win/40 bg-semantic-win/15 text-semantic-win'
                          : 'border-border-prominent bg-card/90 text-on-prominent',
                      )}
                    >
                      {cashOutOffer !== null
                        ? `Cash out — ${cashOutOffer.toLocaleString()}`
                        : 'Pricing…'}
                    </button>
                  </div>
                )
              ) : null}
            </div>

            {/* Single trade surface: pick buttons directly under the chart edge */}
            <div className="shrink-0 space-y-2 p-4 pt-3">
              {idle ? (
                <>
                  <ModeToggle mode={mode} onChange={setMode} disabled={!canTrade} />
                  <p className="text-center text-xs text-on-subtle">
                    {mode === 'cashout'
                      ? 'Sell your position mid-race at the live price'
                      : `First to reach ${barrier.toFixed(2)} wins — pick your racer`}
                  </p>
                </>
              ) : null}
              <div className="flex gap-2">
                <PickButton
                  asset="drift"
                  odds={driftOdds}
                  payout={Math.round(stake * driftOdds)}
                  selected={pick === 'drift'}
                  disabled={!idle || !canTrade}
                  idle={idle && canTrade}
                  onSelect={() => startRace('drift')}
                />
                <PickButton
                  asset="vol"
                  odds={volOdds}
                  payout={Math.round(stake * volOdds)}
                  selected={pick === 'vol'}
                  disabled={!idle || !canTrade}
                  idle={idle && canTrade}
                  onSelect={() => startRace('vol')}
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
            stakeDisabled={racing || settled}
            footer={
              idle
                ? 'Tap a racer above to start'
                : racing
                  ? 'Race in progress'
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
              : result?.outcome === 'cashout'
                ? result.netPL
                : undefined
        }
        amountLabel="credits"
        tier={resultTier}
        onDismiss={dismissResult}
        autoDismissMs={5000}
        showAutoDismissBar
        primaryAction={{ label: 'Race again', onClick: raceAgain }}
      />
    </GameShell>
  );
}
