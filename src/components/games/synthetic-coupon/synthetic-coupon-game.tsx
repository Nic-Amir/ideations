'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { GameShell } from '@/components/games/shared/game-shell';
import { GameViewport, GameNotice } from '@/components/games/shared/game-layout';
import { StakeDock } from '@/components/games/shared/stake-dock';
import { ResultOverlay } from '@/components/games/shared/result-overlay';
import type { GameInfoSection } from '@/components/games/shared/game-info-drawer';
import { CouponCorridorChart } from '@/components/games/synthetic-coupon/coupon-corridor-chart';
import { useSyntheticCoupon } from '@/hooks/use-synthetic-coupon';
import {
  DISTANCE_PRESETS,
  PERIOD_OPTIONS,
  type DistancePresetId,
  type PeriodTicks,
} from '@/lib/games/synthetic-coupon';

const INFO_SECTIONS: GameInfoSection[] = [
  {
    id: 'how',
    label: 'How it works',
    content: (
      <p className="text-sm text-on-subtle">
        Stake into a fixed price corridor. Every survived period accrues a
        fixed-cash coupon on your position. Cash out anytime for stake plus
        coupons — or lose it all if price breaks a barrier.
      </p>
    ),
  },
  {
    id: 'structure',
    label: 'Structure',
    content: (
      <div className="space-y-2 text-sm text-on-subtle">
        <p>
          Stake equals notional. Coupons accrue on the position (not paid to
          your balance until you cash out). A breach wipes stake and unpaid
          accrued coupons.
        </p>
        <p>
          Barriers are log-symmetric around entry and lock when you enter.
          Near corridors pay a higher coupon rate; Far corridors are wider
          with a lower coupon.
        </p>
      </div>
    ),
  },
  {
    id: 'pricing',
    label: 'Pricing',
    content: (
      <p className="text-sm text-on-subtle">
        Coupon size and corridor width are locked at entry so a one-period
        cash-out targets about a 2% house edge. Terms are stored as locked
        pricing for replay — the same shape a mesh product would persist on
        the contract.
      </p>
    ),
  },
];

function PeriodPicker({
  ticks,
  onChange,
  disabled,
}: {
  ticks: PeriodTicks;
  onChange: (ticks: PeriodTicks) => void;
  disabled: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Coupon period"
      className="flex flex-1 rounded-lg border border-border-subtle bg-subtle p-0.5"
    >
      {PERIOD_OPTIONS.map((opt) => (
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
      aria-label="Corridor width"
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

export function SyntheticCouponGame() {
  const {
    stake,
    setStake,
    periodTicks,
    setPeriodTicks,
    distanceId,
    setDistanceId,
    phase,
    result,
    playError,
    barrierFlash,
    couponFlash,
    balance,
    maxStake,
    canEnter,
    canCashOut,
    pricing,
    prices,
    upper,
    lower,
    entrySpot,
    accruedUsdt,
    payoutPreview,
    couponPreview,
    ticksToCoupon,
    periodProgress,
    periodsCompleted,
    startRound,
    cashOut,
    dismissResult,
    playAgain,
  } = useSyntheticCoupon();

  const idle = phase === 'idle';
  const flying = phase === 'flying';
  const settled = phase === 'cashed_out' || phase === 'defaulted';
  const showOverlay = settled && result !== null;

  const resultTitle =
    result?.outcome === 'cashed_out'
      ? result.autoHorizon
        ? 'Session capped — cashed out'
        : 'Cashed out'
      : 'Defaulted';
  const resultSubtitle =
    result?.outcome === 'cashed_out'
      ? `${result.periodsCompleted} coupon${result.periodsCompleted === 1 ? '' : 's'} · tick ${result.settleTick}`
      : `Broke ${result?.breachSide ?? 'a barrier'} on tick ${result?.settleTick ?? 0}`;
  const cashOutHint = flying && !canCashOut ? 'Wait for the first tick' : null;

  return (
    <GameShell infoSections={INFO_SECTIONS} showSymbolPicker={false}>
      <GameViewport
        market={
          <div className="relative flex h-full min-h-[220px] flex-col">
            <div className="flex items-center justify-between gap-2 px-4 pt-3">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[8px] font-bold uppercase tracking-wide',
                    flying
                      ? 'bg-semantic-win/10 text-semantic-win'
                      : phase === 'defaulted'
                        ? 'bg-semantic-loss/10 text-semantic-loss'
                        : 'bg-subtle text-on-subtle',
                  )}
                >
                  {flying ? 'Live' : phase === 'defaulted' ? 'Defaulted' : phase === 'cashed_out' ? 'Closed' : 'Preview'}
                </span>
                {flying ? (
                  <div className="min-w-[7.5rem] space-y-1">
                    <span className="text-xs text-on-subtle tabular-nums">
                      Next coupon in {ticksToCoupon}t
                    </span>
                    <div
                      className="h-1 w-full overflow-hidden rounded-full bg-subtle"
                      role="progressbar"
                      aria-valuenow={Math.round(periodProgress * 100)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label="Period progress"
                    >
                      <div
                        className={cn(
                          'h-full rounded-full transition-[width] duration-300',
                          couponFlash ? 'bg-primary' : 'bg-semantic-win',
                        )}
                        style={{ width: `${Math.min(100, periodProgress * 100)}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <span className="text-xs text-on-subtle tabular-nums">
                    Coupon {couponPreview.toFixed(2)} / {periodTicks}t
                  </span>
                )}
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase text-on-subtle">Position</p>
                <p className="font-display text-lg font-bold tabular-nums text-on-prominent">
                  {payoutPreview.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
                {flying || settled ? (
                  <p
                    className={cn(
                      'text-[10px] tabular-nums transition-colors',
                      couponFlash ? 'text-primary font-semibold' : 'text-semantic-win',
                    )}
                  >
                    +{accruedUsdt.toFixed(2)} accrued
                    {couponFlash ? ' · coupon' : ''}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="min-h-0 flex-1 px-1 pb-1">
              <CouponCorridorChart
                prices={prices}
                upper={upper}
                lower={lower}
                entrySpot={entrySpot}
                flying={flying}
                barrierFlash={barrierFlash}
                breachSide={result?.breachSide ?? null}
              />
            </div>
          </div>
        }
        play={
          <div className="space-y-3 px-4 py-3">
            {playError ? <GameNotice tone="danger">{playError}</GameNotice> : null}

            <div className="flex gap-2">
              <PeriodPicker
                ticks={periodTicks}
                onChange={setPeriodTicks}
                disabled={!idle}
              />
              <DistancePicker
                distanceId={distanceId}
                onChange={setDistanceId}
                disabled={!idle}
              />
            </div>

            <p className="text-center text-xs text-on-subtle">
              Survive ~{(pricing.pPeriod * 100).toFixed(0)}% of each period ·{' '}
              {(pricing.couponRateK * 100).toFixed(0)}% coupon rate
            </p>

            {idle ? (
              <motion.button
                type="button"
                disabled={!canEnter}
                onClick={startRound}
                whileTap={canEnter ? { scale: 0.98 } : undefined}
                className={cn(
                  'flex w-full min-h-[72px] flex-col items-center justify-center rounded-xl bg-primary px-4 py-3 text-on-prominent-static-inverse',
                  !canEnter && 'opacity-40',
                )}
              >
                <span className="font-display text-lg font-bold">Enter corridor</span>
                <span className="text-xs opacity-90 tabular-nums">
                  Risk {stake.toLocaleString()} · coupon {couponPreview.toFixed(2)} each period
                </span>
              </motion.button>
            ) : (
              <div className="space-y-1.5">
                <motion.button
                  type="button"
                  disabled={!canCashOut}
                  onClick={cashOut}
                  whileTap={canCashOut ? { scale: 0.98 } : undefined}
                  className={cn(
                    'flex w-full min-h-[72px] flex-col items-center justify-center rounded-xl bg-semantic-win px-4 py-3 text-on-prominent-static-inverse',
                    !canCashOut && 'opacity-40',
                  )}
                >
                  <span className="font-display text-lg font-bold">Cash out</span>
                  <span className="text-xs opacity-90 tabular-nums">
                    Take {payoutPreview.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                    {periodsCompleted > 0
                      ? ` · ${periodsCompleted} coupon${periodsCompleted === 1 ? '' : 's'}`
                      : ''}
                  </span>
                </motion.button>
                {cashOutHint ? (
                  <p className="text-center text-[11px] text-on-subtle">{cashOutHint}</p>
                ) : null}
              </div>
            )}
          </div>
        }
        dock={
          <StakeDock
            stake={stake}
            onStakeChange={setStake}
            balance={balance}
            max={maxStake}
            stakeDisabled={!idle}
          />
        }
      />

      <ResultOverlay
        open={showOverlay}
        won={result?.outcome === 'cashed_out'}
        title={resultTitle}
        subtitle={resultSubtitle}
        amount={
          result?.outcome === 'cashed_out'
            ? result.payout
            : result
              ? result.stake + result.accrued
              : 0
        }
        amountLabel={result?.outcome === 'cashed_out' ? 'Payout' : 'Position wiped'}
        tier={result?.outcome === 'cashed_out' ? 'win' : 'loss'}
        onDismiss={dismissResult}
        autoDismissMs={5000}
        showAutoDismissBar
        primaryAction={{ label: 'Play again', onClick: playAgain }}
        details={
          result ? (
            <p className="text-xs text-on-subtle">
              Status {result.status} · stake {result.stake.toFixed(2)} · accrued{' '}
              {result.accrued.toFixed(2)}
            </p>
          ) : null
        }
      />
    </GameShell>
  );
}
