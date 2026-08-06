'use client';

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
import { DigitLadderFace } from '@/components/games/digit-ladder/digit-ladder-face';
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
      <div className="space-y-2 text-sm text-on-subtle">
        <p>
          First, draw a free face digit from the next tick — no stake.
          That face stays locked while you set a stake and tap Higher or Lower.
        </p>
        <p>
          The next tick settles the step. Win strictly above or below — a tie
          busts. After a win, cash out the pot or climb the ladder and risk it
          all on the next step.
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
    tableTick,
    liveDigit,
    liveTick,
    extractionKey,
    settleCompare,
    rungTrail,
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
    drawFace,
  } = useDigitLadder();

  const needDraw = phase === 'need_draw';
  const drawing = phase === 'drawing';
  const ready = phase === 'ready';
  const awaiting = phase === 'awaiting_tick';
  const decision = phase === 'decision';
  const canPick = (ready && canTrade) || decision;

  const basePotCents = decision ? usdtToCents(potUsdt) : usdtToCents(stake);

  const potPreviewHigher =
    pricing?.higher.offered
      ? centsToUsdt(applyStepMult(basePotCents, pricing.higher.multiplier))
      : 0;
  const potPreviewLower =
    pricing?.lower.offered
      ? centsToUsdt(applyStepMult(basePotCents, pricing.lower.multiplier))
      : 0;

  return (
    <GameShell title="Digit Ladder" infoSections={INFO_SECTIONS} showSymbolPicker>
      <GameViewport
        play={
          <DigitLadderFace
            phase={phase}
            faceDigit={faceDigit}
            revealDigit={revealDigit}
            tableTick={tableTick}
            liveTick={liveTick}
            liveDigit={liveDigit}
            extractionKey={extractionKey}
            settleCompare={settleCompare}
            rungTrail={rungTrail}
            canDrawAgain={ready && !drawing}
            onDrawAgain={() => void drawFace()}
          />
        }
        dock={
          <div className="flex flex-col gap-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {playError ? (
              <div className="px-4">
                <GameNotice tone="danger">{playError}</GameNotice>
              </div>
            ) : null}

            {!marketReady && (needDraw || ready) ? (
              <div className="px-4">
                <GameNotice tone="info">Waiting for ticks…</GameNotice>
              </div>
            ) : null}

            {drawing ? (
              <div className="px-4">
                <GameNotice tone="info">Drawing face from next tick…</GameNotice>
              </div>
            ) : null}

            {awaiting ? (
              <div className="px-4">
                <GameNotice tone="info">Next tick draws the digit…</GameNotice>
              </div>
            ) : null}

            {(needDraw || (drawing && faceDigit === null)) && marketReady ? (
              <div className="px-4">
                <Button
                  variant="primary"
                  className="w-full min-h-[48px]"
                  disabled={drawing}
                  onClick={() => void drawFace()}
                >
                  {drawing ? 'Drawing…' : 'Draw face'}
                </Button>
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

            {ready ? (
              <StakeDock
                stake={stake}
                max={maxStake}
                balance={balance}
                onStakeChange={setStake}
                stakeDisabled={!ready}
              />
            ) : null}

            {pricing && (ready || decision) ? (
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

            {history.length > 0 && (ready || needDraw) ? (
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
            ? result.entryDigit !== null
              ? `${result.entryDigit} → ${result.lastDigit}`
              : `Last digit ${result.lastDigit}`
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
