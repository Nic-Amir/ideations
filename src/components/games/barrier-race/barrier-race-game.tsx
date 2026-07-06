'use client';

import { Button, Card } from '@trading-game/design-intelligence-layer';
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

function AssetPickCard({
  asset,
  odds,
  payout,
  selected,
  disabled,
  onSelect,
}: {
  asset: AssetId;
  odds: number;
  payout: number;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const { name, tag } = ASSET_LABELS[asset];
  const isDrift = asset === 'drift';

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'flex flex-1 flex-col items-start rounded-lg border p-3 text-left transition-colors min-h-[88px]',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        selected
          ? 'border-primary bg-primary/10'
          : 'border-border-subtle bg-subtle hover:bg-secondary-hover',
      )}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <span
          className={cn(
            'font-display text-sm font-bold',
            isDrift ? 'text-primary' : 'text-semantic-info',
          )}
        >
          {name}
        </span>
        <span className="font-display text-lg font-bold tabular-nums text-on-prominent">
          {odds.toFixed(2)}×
        </span>
      </div>
      <span className="mt-0.5 text-xs text-on-subtle">{tag}</span>
      <span className="mt-auto pt-2 text-xs text-on-subtle tabular-nums">
        Payout: {payout.toLocaleString()} credits
      </span>
    </button>
  );
}

// Starting distance per asset (spec's d/s: ~4.95σ for Drift, ~3.30σ for Vol),
// used to normalize the live meters so both start visually "full distance".
const START_DISTANCES = (() => {
  const { vol, logBarrier, logS0 } = deriveParams();
  return {
    drift: (logBarrier - logS0[0]) / vol[0],
    vol: (logBarrier - logS0[1]) / vol[1],
  };
})();

function DistanceMeter({
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
          'w-9 shrink-0 text-xs font-semibold',
          isDrift ? 'text-primary' : 'text-semantic-info',
          isPick && 'underline underline-offset-2',
        )}
      >
        {ASSET_LABELS[asset].name}
      </span>
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-subtle">
        <div
          className={cn(
            'absolute inset-y-0 left-0 rounded-full transition-[width] duration-150',
            isDrift ? 'bg-primary' : 'bg-semantic-info',
          )}
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      <span className="w-14 shrink-0 text-right text-xs text-on-subtle tabular-nums">
        {touched ? 'Touch!' : `${sigma.toFixed(1)}σ away`}
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
  } = useBarrierRace();

  const racing = phase === 'racing';
  const settled = phase === 'settled';
  const showOverlay = settled && result !== null;

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
          <div className="flex flex-col flex-1 min-h-0 gap-3 p-4">
            {playError ? (
              <GameNotice tone="danger">{playError}</GameNotice>
            ) : null}

            <Card className="flex-1 min-h-[180px] border-0 bg-subtle overflow-hidden">
              <div className="h-full min-h-[180px] p-2">
                <RaceChart
                  path={path}
                  visibleTick={visibleTick}
                  barrier={barrier}
                  startPrice={startPrice}
                  barrierFlash={barrierFlash}
                  ghost={cashedOut}
                />
              </div>
            </Card>

            {phase === 'idle' ? (
              <div className="shrink-0 space-y-2">
                <ModeToggle mode={mode} onChange={setMode} disabled={!canTrade} />
                <p className="text-xs text-on-subtle text-center">
                  {mode === 'cashout'
                    ? 'Sell your position mid-race at the live price'
                    : `Both assets start at ${startPrice.toFixed(2)} — first to reach ${barrier.toFixed(2)} wins`}
                </p>
                <div className="flex gap-2">
                  <AssetPickCard
                    asset="drift"
                    odds={driftOdds}
                    payout={Math.round(stake * driftOdds)}
                    selected={pick === 'drift'}
                    disabled={!canTrade}
                    onSelect={() => startRace('drift')}
                  />
                  <AssetPickCard
                    asset="vol"
                    odds={volOdds}
                    payout={Math.round(stake * volOdds)}
                    selected={pick === 'vol'}
                    disabled={!canTrade}
                    onSelect={() => startRace('vol')}
                  />
                </div>
              </div>
            ) : (
              <div className="shrink-0 space-y-2">
                {mode === 'cashout' && racing ? (
                  cashedOut ? (
                    <p className="text-center text-xs text-on-subtle">
                      Position sold — replaying how the race ended
                    </p>
                  ) : (
                    <Button
                      variant="secondary"
                      className={cn(
                        'w-full min-h-[48px] font-display font-bold tabular-nums',
                        cashOutOffer !== null &&
                          cashOutOffer > stake &&
                          'text-semantic-win',
                      )}
                      disabled={cashOutOffer === null}
                      onClick={cashOut}
                    >
                      {cashOutOffer !== null
                        ? `Cash out — ${cashOutOffer.toLocaleString()} credits`
                        : 'Pricing…'}
                    </Button>
                  )
                ) : null}
                <div className="space-y-1.5">
                  {liveDistances && pick ? (
                    <>
                      <DistanceMeter
                        asset="drift"
                        sigma={liveDistances.drift}
                        isPick={pick === 'drift'}
                      />
                      <DistanceMeter
                        asset="vol"
                        sigma={liveDistances.vol}
                        isPick={pick === 'vol'}
                      />
                    </>
                  ) : null}
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
            stakeDisabled={racing || settled}
            footer={
              phase === 'idle'
                ? 'Tap an asset card to place your trade'
                : undefined
            }
            actions={
              phase === 'idle' ? (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="primary"
                    className="min-h-[44px]"
                    disabled={!canTrade}
                    onClick={() => startRace('drift')}
                  >
                    Trade Drift
                  </Button>
                  <Button
                    variant="secondary"
                    className="min-h-[44px]"
                    disabled={!canTrade}
                    onClick={() => startRace('vol')}
                  >
                    Trade Vol
                  </Button>
                </div>
              ) : null
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
        autoDismissMs={2200}
      />
    </GameShell>
  );
}
