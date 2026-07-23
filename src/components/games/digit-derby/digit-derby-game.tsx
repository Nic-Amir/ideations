'use client';

import { Button, Spinner } from '@trading-game/design-intelligence-layer';
import { GameShell } from '@/components/games/shared/game-shell';
import { GameViewport, GameNotice } from '@/components/games/shared/game-layout';
import { MiniMarketStrip } from '@/components/games/shared/mini-market-strip';
import { StakeDock } from '@/components/games/shared/stake-dock';
import {
  ResultOverlay,
  getResultTierFromPayout,
} from '@/components/games/shared/result-overlay';
import type { GameInfoSection } from '@/components/games/shared/game-info-drawer';
import { useDigitDerby } from '@/hooks/use-digit-derby';
import {
  DigitLeaderboardStrip,
  DigitRaceTrack,
} from '@/components/games/digit-derby/digit-race-track';
import { DIGIT_DERBY_CONFIG } from '@/lib/games/digit-derby';

export function DigitDerbyGame() {
  const {
    phase,
    pick,
    stake,
    setStake,
    counts,
    tickCount,
    lockedMultiplier,
    lockedPick,
    multiplier,
    result,
    playError,
    balance,
    maxStake,
    canStart,
    marketReady,
    finishOrder,
    inFinalStretch,
    finishCount,
    ticks,
    highlightedTicks,
    lastConsumedTick,
    extractionKey,
    selectDigit,
    startRace,
    dismissResult,
  } = useDigitDerby();

  const displayMultiplier = lockedMultiplier ?? multiplier;
  const displayPick = lockedPick ?? pick;
  const potentialReturn =
    pick !== null ? Math.round(stake * multiplier) : null;

  const infoSections: GameInfoSection[] = [
    {
      id: 'how',
      label: 'How to play',
      content: (
        <div className="space-y-2 text-sm text-on-subtle">
          <p>Pick a digit from 0 to 9, set your stake, and start the race.</p>
          <p>
            Each live tick advances the digit that matches its last digit. First
            to {finishCount} wins.
          </p>
          <p>You win if the digit you picked finishes first.</p>
        </div>
      ),
    },
    {
      id: 'pricing',
      label: 'Pricing',
      content: (
        <div className="space-y-2 text-sm text-on-subtle">
          <p>
            Under uniform last digits, each runner has a 10% chance to win.
          </p>
          <p>
            Offered odds use a {DIGIT_DERBY_CONFIG.commission * 100}% commission:{' '}
            <span className="font-display tabular-nums text-on-prominent">
              {multiplier.toFixed(2)}×
            </span>{' '}
            for every digit. Multiplier locks when you start.
          </p>
          <p>Timeout or feed failure mid-race refunds your stake.</p>
        </div>
      ),
    },
    {
      id: 'feed',
      label: 'Feed',
      content: (
        <div className="space-y-2 text-sm text-on-subtle">
          <p>Settlement uses live Deriv ticks — no synthetic fallback.</p>
          <p>If the market is unavailable, starting a race is disabled.</p>
        </div>
      ),
    },
  ];

  const statusLabel =
    phase === 'running'
      ? inFinalStretch
        ? 'Final stretch'
        : 'Live'
      : phase === 'settled'
        ? 'Finish'
        : 'Ready';

  const overlayOpen = phase === 'settled' && result !== null;
  const overlayWon = result?.outcome === 'win' || result?.outcome === 'refund';
  const overlayTier =
    result?.outcome === 'refund'
      ? ('push' as const)
      : getResultTierFromPayout(
          result && result.stake > 0 ? result.payout / result.stake : 0,
        );

  return (
    <GameShell infoSections={infoSections} showSymbolPicker>
      <GameViewport
        market={
          marketReady ? (
            <MiniMarketStrip
              ticks={ticks}
              highlightedTicks={highlightedTicks}
              lastConsumedTick={lastConsumedTick}
              extractionKey={extractionKey}
            />
          ) : (
            <div className="flex shrink-0 items-center justify-center border-b border-border-subtle py-6">
              <Spinner />
            </div>
          )
        }
        play={
          <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <DigitLeaderboardStrip
                finishOrder={finishOrder}
                counts={counts}
                pick={displayPick}
                statusLabel={statusLabel}
              />
              <span className="shrink-0 font-display text-xs tabular-nums text-on-subtle">
                {phase === 'running' || phase === 'settled'
                  ? `${tickCount} ticks`
                  : `First to ${finishCount}`}
              </span>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border-subtle bg-subtle/40">
              <DigitRaceTrack
                counts={counts}
                finishCount={finishCount}
                finishOrder={finishOrder}
                pick={pick}
                lockedPick={lockedPick}
                multiplier={displayMultiplier}
                selectable={phase === 'idle'}
                running={phase === 'running' || phase === 'settled'}
                finished={phase === 'settled'}
                inFinalStretch={inFinalStretch}
                onSelectDigit={selectDigit}
              />
            </div>

            <p className="text-center text-sm text-on-subtle">
              {phase === 'idle' ? (
                pick !== null ? (
                  <>
                    Digit {pick} locked in at {multiplier.toFixed(2)}×
                    {potentialReturn !== null ? (
                      <span className="text-on-prominent">
                        {' '}
                        · return {potentialReturn.toLocaleString()}
                      </span>
                    ) : null}
                  </>
                ) : (
                  'Pick a digit, then start the race.'
                )
              ) : phase === 'running' ? (
                <>
                  Racing digit {lockedPick} at {displayMultiplier.toFixed(2)}×
                  …
                </>
              ) : null}
            </p>

            {playError ? <GameNotice tone="danger">{playError}</GameNotice> : null}
            {!marketReady && phase === 'idle' ? (
              <GameNotice tone="warning">Market unavailable. Waiting for live ticks.</GameNotice>
            ) : null}
          </div>
        }
        dock={
          <StakeDock
            stake={stake}
            max={maxStake}
            balance={balance}
            onStakeChange={setStake}
            stakeDisabled={phase !== 'idle'}
            showSlider={phase === 'idle'}
            footer={
              phase === 'idle' && pick !== null
                ? `Digit ${pick} · ${multiplier.toFixed(2)}×`
                : phase === 'running'
                  ? `Digit ${lockedPick} · racing…`
                  : undefined
            }
            actions={
              <>
                {phase === 'idle' ? (
                  <Button
                    variant="primary"
                    className="w-full min-h-[44px]"
                    disabled={!canStart}
                    onClick={() => void startRace()}
                  >
                    Start race
                  </Button>
                ) : null}
                {phase === 'running' ? (
                  <Button
                    variant="primary"
                    className="w-full min-h-[44px]"
                    disabled
                    aria-busy
                  >
                    Racing…
                  </Button>
                ) : null}
                {phase === 'settled' ? (
                  <Button
                    variant="primary"
                    className="w-full min-h-[44px]"
                    onClick={dismissResult}
                  >
                    Race again
                  </Button>
                ) : null}
              </>
            }
          />
        }
      />

      <ResultOverlay
        open={overlayOpen}
        won={overlayWon}
        tier={overlayTier}
        title={
          result?.outcome === 'win'
            ? `Digit ${result.winner} wins`
            : result?.outcome === 'refund'
              ? 'Race refunded'
              : `Digit ${result?.winner ?? '—'} wins`
        }
        subtitle={
          result?.outcome === 'win'
            ? `Your pick ${result.pick} finished first · ${result.multiplier.toFixed(2)}×`
            : result?.outcome === 'refund'
              ? 'Stake returned — timeout or market issue'
              : `Your pick was ${result?.pick} · better luck next race`
        }
        amount={
          result?.outcome === 'lose' ? result.stake : result?.payout
        }
        amountLabel="credits"
        onDismiss={dismissResult}
        primaryAction={{ label: 'Race again', onClick: dismissResult }}
        details={
          result ? (
            <div className="text-center text-xs text-on-subtle">
              Finish order:{' '}
              <span className="font-display tabular-nums text-on-prominent">
                {result.finishOrder.slice(0, 5).join(' · ')}
              </span>
            </div>
          ) : null
        }
      />
    </GameShell>
  );
}
