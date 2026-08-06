'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '@trading-game/design-intelligence-layer';
import { GameShell } from '@/components/games/shared/game-shell';
import { GameViewport, GameNotice } from '@/components/games/shared/game-layout';
import { StakeDock } from '@/components/games/shared/stake-dock';
import {
  ResultOverlay,
  getResultTierFromPayout,
} from '@/components/games/shared/result-overlay';
import type { GameInfoSection } from '@/components/games/shared/game-info-drawer';
import { DigitLadderPickStrip } from '@/components/games/digit-ladder/digit-ladder-pick-strip';
import { useDigitLadder } from '@/hooks/use-digit-ladder';
import {
  applyStepMult,
  centsToUsdt,
  usdtToCents,
} from '@/lib/games/digit-ladder';
import { cn } from '@/lib/utils';

const INFO_SECTIONS: GameInfoSection[] = [
  {
    id: 'how',
    label: 'How it works',
    content: (
      <p className="text-sm text-on-subtle">
        The face digit is the current last digit. Tap Higher or Lower for the
        next tick. Win strictly above or below — a tie busts. After a win, cash
        out the pot or climb the ladder and risk it all on the next step.
      </p>
    ),
  },
  {
    id: 'pricing',
    label: 'Pricing',
    content: (
      <div className="space-y-2 text-sm text-on-subtle">
        <p>
          Odds match Digits Over/Under vs the face digit. Higher wins on digits
          above the face; Lower on digits below. Multiplier = 1 / (p + 2%
          commission), locked when you tap.
        </p>
        <p>
          On digit 0, Lower is off. On digit 9, Higher is off. Parlay compounds
          the house edge each rung.
        </p>
      </div>
    ),
  },
];

export function DigitLadderGame() {
  const {
    stake,
    setStake,
    phase,
    result,
    history,
    playError,
    revealDigit,
    faceDigit,
    liveQuote,
    pricing,
    potUsdt,
    rungs,
    balance,
    maxStake,
    marketReady,
    canTrade,
    placePick,
    onCashOut,
    dismissResult,
  } = useDigitLadder();

  const idle = phase === 'idle';
  const awaiting = phase === 'awaiting_tick';
  const decision = phase === 'decision';
  const canPick = (idle && canTrade) || decision;

  const basePotCents = decision
    ? usdtToCents(potUsdt)
    : usdtToCents(stake);

  const potPreviewHigher =
    pricing?.higher.offered
      ? centsToUsdt(applyStepMult(basePotCents, pricing.higher.multiplier))
      : 0;
  const potPreviewLower =
    pricing?.lower.offered
      ? centsToUsdt(applyStepMult(basePotCents, pricing.lower.multiplier))
      : 0;

  const displayDigit = revealDigit ?? faceDigit;

  return (
    <GameShell infoSections={INFO_SECTIONS} showSymbolPicker>
      <GameViewport
        play={
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-6">
            <p className="text-xs uppercase tracking-wide text-on-subtle">
              {awaiting
                ? 'Face digit'
                : decision
                  ? 'Climb or cash out'
                  : 'Live last digit'}
            </p>

            <AnimatePresence mode="wait">
              <motion.div
                key={`${displayDigit}-${revealDigit ?? 'face'}`}
                initial={{ scale: 0.85, opacity: 0.5 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 380, damping: 22 }}
                className={cn(
                  'flex size-28 items-center justify-center rounded-full border-2 font-display text-6xl font-black tabular-nums',
                  revealDigit !== null
                    ? 'border-primary bg-primary/15 text-primary'
                    : 'border-border-subtle bg-subtle text-on-prominent',
                )}
              >
                {displayDigit ?? '—'}
              </motion.div>
            </AnimatePresence>

            {liveQuote ? (
              <p className="font-body text-xs tabular-nums text-on-subtle">
                {liveQuote}
              </p>
            ) : null}

            {decision ? (
              <p className="text-sm text-on-subtle text-center max-w-[280px]">
                Pot is at risk on the next rung. Cash out to bank it, or call
                Higher / Lower again.
              </p>
            ) : idle ? (
              <p className="text-sm text-on-subtle text-center max-w-[280px]">
                Call whether the next tick&apos;s last digit is higher or lower
                than the face.
              </p>
            ) : null}
          </div>
        }
        dock={
          <div className="flex flex-col gap-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {playError ? (
              <div className="px-4">
                <GameNotice tone="danger">{playError}</GameNotice>
              </div>
            ) : null}

            {!marketReady && idle ? (
              <div className="px-4">
                <GameNotice tone="info">Waiting for live ticks…</GameNotice>
              </div>
            ) : null}

            {awaiting ? (
              <div className="px-4">
                <GameNotice tone="info">Next tick draws the digit…</GameNotice>
              </div>
            ) : null}

            {decision ? (
              <div className="flex flex-col gap-2 px-4">
                <div className="flex items-center justify-between text-xs text-on-subtle">
                  <span>
                    Ladder{' '}
                    <span className="font-display font-semibold tabular-nums text-on-prominent">
                      {rungs}
                    </span>{' '}
                    rung{rungs === 1 ? '' : 's'}
                  </span>
                  <span>
                    Pot{' '}
                    <span className="font-display font-semibold tabular-nums text-semantic-win">
                      {potUsdt.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </span>
                </div>
                <Button
                  variant="primary"
                  className="w-full min-h-[48px]"
                  onClick={onCashOut}
                >
                  Cash out{' '}
                  {potUsdt.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}
                </Button>
              </div>
            ) : null}

            {pricing && (idle || decision) ? (
              <div className="px-4">
                <DigitLadderPickStrip
                  higher={pricing.higher}
                  lower={pricing.lower}
                  potPreviewHigher={potPreviewHigher}
                  potPreviewLower={potPreviewLower}
                  canPick={canPick}
                  continueMode={decision}
                  onTap={placePick}
                />
              </div>
            ) : null}

            {idle ? (
              <StakeDock
                stake={stake}
                max={maxStake}
                balance={balance}
                onStakeChange={setStake}
                stakeDisabled={!idle}
              />
            ) : null}

            {history.length > 0 && idle ? (
              <p className="px-4 text-center text-xs text-on-subtle">
                Last {Math.min(history.length, 5)}:{' '}
                {history.slice(0, 5).map((h, i) => (
                  <span
                    key={`${h.outcome}-${i}`}
                    className={cn(
                      'font-display tabular-nums mx-0.5',
                      h.outcome === 'WON'
                        ? 'text-semantic-win'
                        : 'text-semantic-loss',
                    )}
                  >
                    {h.outcome === 'WON' ? `+${h.potUsdt.toFixed(0)}` : 'bust'}
                  </span>
                ))}
              </p>
            ) : null}
          </div>
        }
      />

      <ResultOverlay
        open={phase === 'settled' && result !== null}
        won={result?.outcome === 'WON'}
        title={
          result?.outcome === 'WON'
            ? result.rungs > 1
              ? `Cashed · ${result.rungs} rungs`
              : 'Cashed out'
            : 'Ladder bust'
        }
        subtitle={
          result?.lastDigit !== null && result?.lastDigit !== undefined
            ? `Last digit ${result.lastDigit}`
            : undefined
        }
        amount={
          result?.outcome === 'WON' ? result.potUsdt : result?.stakeUsdt
        }
        amountLabel={result?.outcome === 'WON' ? 'Pot' : 'Lost stake'}
        tier={
          result
            ? getResultTierFromPayout(
                result.outcome === 'WON'
                  ? result.potUsdt / Math.max(result.stakeUsdt, 1e-9)
                  : 0,
              )
            : 'loss'
        }
        onDismiss={dismissResult}
        autoDismissMs={3500}
        showAutoDismissBar
      />
    </GameShell>
  );
}
